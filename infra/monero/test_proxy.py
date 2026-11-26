import unittest
from proxy import allowed


class GatewayRules(unittest.TestCase):
    def call(self, method, params):
        return {"jsonrpc": "2.0", "method": method, "params": params}

    def test_watch_never_accepts_a_spend_key(self):
        filename = "seeds-" + "a" * 32
        self.assertFalse(allowed("watch", self.call("generate_from_keys", {"filename": filename, "spendkey": "secret"})))
        self.assertTrue(allowed("watch", self.call("generate_from_keys", {"filename": filename, "viewkey": "view"})))

    def test_signer_never_saves_or_relays(self):
        self.assertFalse(allowed("signer", self.call("close_wallet", {"autosave_current": True})))
        self.assertTrue(allowed("signer", self.call("close_wallet", {"autosave_current": False})))
        self.assertFalse(allowed("signer", self.call("submit_transfer", {})))
        self.assertFalse(allowed("signer", self.call("transfer", {})))

    def test_signer_wallet_is_temporary(self):
        self.assertTrue(allowed("signer", self.call("generate_from_keys", {"filename": "seeds-sign-test", "autosave_current": False})))
        self.assertFalse(allowed("signer", self.call("generate_from_keys", {"filename": "../seeds-sign-test", "autosave_current": False})))
        self.assertFalse(allowed("signer", self.call("generate_from_keys", {"filename": "seeds-sign-test", "autosave_current": True})))

    def test_watch_build_does_not_relay(self):
        self.assertFalse(allowed("watch", self.call("transfer", {})))
        self.assertTrue(allowed("watch", self.call("transfer", {"do_not_relay": True})))

    def test_batches_and_unlisted_calls_are_refused(self):
        self.assertFalse(allowed("watch", [self.call("get_balance", {})]))
        self.assertFalse(allowed("watch", self.call("restore_deterministic_wallet", {})))


if __name__ == "__main__":
    unittest.main()