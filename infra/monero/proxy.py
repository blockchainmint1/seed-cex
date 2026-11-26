"""Loopback-only, digest-authenticated Monero gateway. Never log requests or keys."""
import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import HTTPDigestAuthHandler, Request, build_opener

WATCH = {"get_version", "get_height", "generate_from_keys", "open_wallet", "close_wallet", "refresh", "get_balance", "export_outputs", "import_key_images", "transfer", "describe_transfer", "submit_transfer", "get_transfer_by_txid"}
SIGNER = {"get_version", "generate_from_keys", "import_outputs", "export_key_images", "describe_transfer", "sign_transfer", "close_wallet"}
MAX_BODY = 16 * 1024 * 1024


def allowed(role, body):
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0":
        return False
    method, params = body.get("method"), body.get("params", {})
    if method not in (WATCH if role == "watch" else SIGNER) or not isinstance(params, dict):
        return False
    if method == "generate_from_keys":
        name = params.get("filename", "")
        if not isinstance(name, str) or "/" in name or "\\" in name or ".." in name:
            return False
        if role == "watch":
            return re.fullmatch(r"seeds-[0-9a-f]{32}", name) is not None and not params.get("spendkey")
        return name.startswith("seeds-sign-") and params.get("autosave_current") is False
    if role == "watch" and method == "transfer":
        return params.get("do_not_relay") is True
    if role == "signer" and method == "close_wallet":
        return params.get("autosave_current") is False
    return True


def serve():
    role = os.environ["MONERO_ROLE"]
    if role not in {"watch", "signer"}:
        raise ValueError("Invalid server role")
    token = os.environ["GATEWAY_TOKEN"]
    if len(token) < 32:
        raise ValueError("Gateway token too short")
    auth = HTTPDigestAuthHandler()
    rpc = "http://127.0.0.1:18088/json_rpc"
    auth.add_password(None, rpc, "seeds", os.environ["RPC_PASSWORD"])
    opener = build_opener(auth)

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(75)

        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != "/json_rpc" or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                self.send_error(403)
                return
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= MAX_BODY or self.headers.get("Transfer-Encoding"):
                    self.send_error(413)
                    return
                raw = self.rfile.read(size)
                body = json.loads(raw)
                if not allowed(role, body):
                    self.send_error(403)
                    return
                request = Request(rpc, data=raw, headers={"Content-Type": "application/json"}, method="POST")
                with opener.open(request, timeout=70) as result:
                    output = result.read(MAX_BODY + 1)
                if len(output) > MAX_BODY:
                    raise ValueError("Oversize RPC response")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(output)))
                self.end_headers()
                self.wfile.write(output)
            except Exception:
                # Do not include request bodies, upstream URLs or exception text.
                self.send_error(502, "Monero request could not be completed")

    ThreadingHTTPServer(("127.0.0.1", 18089), Handler).serve_forever()


if __name__ == "__main__":
    serve()