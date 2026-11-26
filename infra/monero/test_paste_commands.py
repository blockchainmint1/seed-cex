import subprocess
import unittest

from paste_commands import command_for


class PasteCommandsTests(unittest.TestCase):
    def check_block(self, role):
        # Execute only bash's syntax checker, NEVER the installer commands.
        safe_wrapper = command_for(role).replace("sudo bash <<", "bash -n <<", 1)
        result = subprocess.run(["bash"], input=safe_wrapper, text=True,
                                capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        # bash returns 0 for a missing closing delimiter but emits a warning.
        self.assertEqual(result.stderr, "")
        self.assertEqual(result.stdout, "")

    def test_ec2_watch_block_is_consumed_and_parsed(self):
        self.check_block("watch")

    def test_do_signer_block_is_consumed_and_parsed(self):
        self.check_block("signer")

    def test_arbitrary_role_cannot_enter_the_shell_block(self):
        with self.assertRaises(ValueError):
            command_for("watch; echo unsafe")


if __name__ == "__main__":
    unittest.main()