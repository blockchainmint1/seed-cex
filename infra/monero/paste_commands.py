"""Emit complete, syntax-checkable paste commands; never wallet credentials."""
import argparse
import re
from pathlib import Path

ROLES = ("watch", "signer")
HOST_RE = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$")
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$")
PATH_RE = re.compile(r"^/[a-zA-Z0-9_./-]+$")


def _text(name: str) -> str:
    return Path(__file__).with_name(name).read_text()


def _role(role: str) -> str:
    if role not in ROLES:
        raise ValueError("Role must be watch or signer")
    return role


def _host(host: str) -> str:
    if not isinstance(host, str) or not 1 <= len(host) <= 253 or not HOST_RE.fullmatch(host):
        raise ValueError("Host must be a plain hostname such as node-xmr.honest.money")
    return host


def _path(value: str, label: str) -> str:
    if not isinstance(value, str) or not PATH_RE.fullmatch(value):
        raise ValueError(f"{label} must be an absolute path without spaces or shell characters")
    return value


def _block(role: str, suffix: str, body: str) -> str:
    delimiter = f"SEEDS_MONERO_{role.upper()}_{suffix}"
    # A file need not end in a newline. The closing delimiter must be its own line.
    return f"sudo bash <<'{delimiter}'\n{body.rstrip()}\n\n{delimiter}\n"


def command_for(role: str) -> str:
    """Blockchain bootstrap: syncs the watch node, installs binaries only for the signer."""
    role = _role(role)
    body = _text("bootstrap.sh").replace("role=${1:-}", f"role={role}", 1).rstrip("\n")
    return _block(role, "BOOTSTRAP", body)


def cert_command_for(role: str, host: str, email: str = "") -> str:
    """Trusted TLS certificate for one host; no wallet material is touched."""
    role, host = _role(role), _host(host)
    if email:
        if not EMAIL_RE.fullmatch(email):
            raise ValueError("Email must be a plain address without spaces or shell characters")
        contact = f"--email '{email}'"
    else:
        contact = "--register-unsafely-without-email"
    body = f"""set -euo pipefail
DEBIAN_FRONTEND=noninteractive apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y certbot nginx
install -d -m 755 /var/www/html
systemctl is-active --quiet nginx || systemctl start nginx
certbot certonly --webroot -w /var/www/html -d {host} --agree-tos --no-eff-email {contact}
printf 'Certificate ready for {host}.\\n'
printf '  full chain: /etc/letsencrypt/live/{host}/fullchain.pem\\n'
printf '  private key: /etc/letsencrypt/live/{host}/privkey.pem\\n'
printf 'Next: run the install paste block for this host with those two paths.\\n'
"""
    return _block(role, "CERT", body)


def install_command_for(role: str, host: str, cert: str, key: str) -> str:
    """Authenticated wallet services for one host, with the bundle files written in place."""
    role, host = _role(role), _host(host)
    cert, key = _path(cert, "Certificate path"), _path(key, "Key path")
    install_sh = _text("install.sh").rstrip("\n")
    proxy_py = _text("proxy.py").rstrip("\n")
    body = f"""set -euo pipefail
umask 077
bundle=/root/seeds-monero-bundle
install -d -m 700 "$bundle"
cat > "$bundle/install.sh" <<'SEEDS_BUNDLE_INSTALL_SH'
{install_sh}
SEEDS_BUNDLE_INSTALL_SH
cat > "$bundle/proxy.py" <<'SEEDS_BUNDLE_PROXY_PY'
{proxy_py}
SEEDS_BUNDLE_PROXY_PY
chmod 700 "$bundle/install.sh"
rm -f /etc/nginx/sites-enabled/default
bash "$bundle/install.sh" {role} {host} {cert} {key}
"""
    return _block(role, "INSTALL", body)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    bootstrap = commands.add_parser("bootstrap", help="verified binaries, watch node sync")
    bootstrap.add_argument("role", choices=ROLES)
    certificate = commands.add_parser("cert", help="trusted TLS certificate for one host")
    certificate.add_argument("role", choices=ROLES)
    certificate.add_argument("host")
    certificate.add_argument("--email", default="", help="address for renewal notices")
    install = commands.add_parser("install", help="authenticated wallet services for one host")
    install.add_argument("role", choices=ROLES)
    install.add_argument("host")
    install.add_argument("--cert", required=True)
    install.add_argument("--key", required=True)
    args = parser.parse_args()
    if args.command == "bootstrap":
        print(command_for(args.role), end="")
    elif args.command == "cert":
        print(cert_command_for(args.role, args.host, args.email), end="")
    else:
        print(install_command_for(args.role, args.host, args.cert, args.key), end="")
