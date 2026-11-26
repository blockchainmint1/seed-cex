import subprocess
import unittest
from pathlib import Path

from paste_commands import cert_command_for, command_for, install_command_for

WATCH_HOST = "node-xmr.honest.money"
SIGNER_HOST = "sign-xmr.honest.money"
WATCH_CERT = "/etc/letsencrypt/live/node-xmr.honest.money/fullchain.pem"
WATCH_KEY = "/etc/letsencrypt/live/node-xmr.honest.money/privkey.pem"


def parse_only(block):
    # Execute only bash's syntax checker, NEVER the installer commands.
    safe_wrapper = block.replace("sudo bash <<", "bash -n <<", 1)
    return subprocess.run(["bash"], input=safe_wrapper, text=True,
                          capture_output=True, timeout=15)


class PasteCommandsTests(unittest.TestCase):
    def check_block(self, block, delimiter):
        result = parse_only(block)
        self.assertEqual(result.returncode, 0, result.stderr)
        # bash returns 0 for a missing closing delimiter but emits a warning.
        self.assertEqual(result.stderr, "")
        self.assertEqual(result.stdout, "")
        self.assertEqual(block.count(f"\n{delimiter}\n"), 1)
        self.assertTrue(block.endswith(f"\n{delimiter}\n"))

    def test_ec2_watch_block_is_consumed_and_parsed(self):
        self.check_block(command_for("watch"), "SEEDS_MONERO_WATCH_BOOTSTRAP")

    def test_do_signer_block_is_consumed_and_parsed(self):
        self.check_block(command_for("signer"), "SEEDS_MONERO_SIGNER_BOOTSTRAP")

    def test_watch_certificate_block_is_consumed_and_parsed(self):
        self.check_block(cert_command_for("watch", WATCH_HOST), "SEEDS_MONERO_WATCH_CERT")

    def test_signer_certificate_block_is_consumed_and_parsed(self):
        self.check_block(cert_command_for("signer", SIGNER_HOST), "SEEDS_MONERO_SIGNER_CERT")

    def test_watch_install_block_is_consumed_and_parsed(self):
        self.check_block(install_command_for("watch", WATCH_HOST, WATCH_CERT, WATCH_KEY),
                         "SEEDS_MONERO_WATCH_INSTALL")

    def test_signer_install_block_is_consumed_and_parsed(self):
        self.check_block(install_command_for("signer", SIGNER_HOST, WATCH_CERT, WATCH_KEY),
                         "SEEDS_MONERO_SIGNER_INSTALL")

    def test_certificate_block_names_the_host_and_paths(self):
        block = cert_command_for("watch", WATCH_HOST)
        self.assertIn(f"-d {WATCH_HOST}", block)
        self.assertIn(f"/etc/letsencrypt/live/{WATCH_HOST}/fullchain.pem", block)
        self.assertIn("--register-unsafely-without-email", block)
        self.assertIn("--email 'ops@honest.money'",
                      cert_command_for("watch", WATCH_HOST, "ops@honest.money"))

    def test_install_block_carries_the_real_values_and_both_bundle_files(self):
        block = install_command_for("watch", WATCH_HOST, WATCH_CERT, WATCH_KEY)
        self.assertIn(f"bash \"$bundle/install.sh\" watch {WATCH_HOST} {WATCH_CERT} {WATCH_KEY}",
                      block)
        here = Path(__file__).with_name
        for name, marker in (("install.sh", "SEEDS_BUNDLE_INSTALL_SH"),
                             ("proxy.py", "SEEDS_BUNDLE_PROXY_PY")):
            source = here(name).read_text().rstrip("\n")
            embedded = block.split(f"<<'{marker}'\n", 1)[1].split(f"\n{marker}\n", 1)[0]
            self.assertEqual(embedded, source, f"{name} must be written in full")
        # Certificate renewal needs the ACME path served on port 80 for this host only.
        self.assertIn("listen 80;", block)
        self.assertIn("location /.well-known/acme-challenge/ { root /var/www/html; }", block)

    def test_install_block_refuses_a_different_wallet_host(self):
        with self.assertRaises(ValueError):
            install_command_for("watch", "sign-xmr.honest.money; echo unsafe", WATCH_CERT, WATCH_KEY)

    def test_certificate_block_refuses_a_malformed_host(self):
        for host in ("", "-node-xmr.honest.money", "node xmr.honest.money",
                     "node-xmr.honest.money\nexit 1", "node-xmr.honest.money'",
                     "node-xmr..honest.money", "a" * 254 + ".honest.money"):
            with self.assertRaises(ValueError, msg=repr(host)):
                cert_command_for("watch", host)

    def test_certificate_block_refuses_a_malformed_email(self):
        for email in ("ops@honest.money; rm -rf /", "ops@honest.money'", "not an address"):
            with self.assertRaises(ValueError, msg=repr(email)):
                cert_command_for("watch", WATCH_HOST, email)

    def test_install_block_refuses_unsafe_paths(self):
        for cert in ("fullchain.pem", "/etc/letsencrypt/live/x/full chain.pem",
                     "/etc/x'\"$(id)"):
            with self.assertRaises(ValueError, msg=repr(cert)):
                install_command_for("watch", WATCH_HOST, cert, WATCH_KEY)

    def test_arbitrary_role_cannot_enter_the_shell_block(self):
        with self.assertRaises(ValueError):
            command_for("watch; echo unsafe")
        for builder in (lambda r: cert_command_for(r, WATCH_HOST),
                        lambda r: install_command_for(r, WATCH_HOST, WATCH_CERT, WATCH_KEY)):
            with self.assertRaises(ValueError):
                builder("watch; echo unsafe")


if __name__ == "__main__":
    unittest.main()
