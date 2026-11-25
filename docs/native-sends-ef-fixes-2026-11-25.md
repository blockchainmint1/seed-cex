# Seeds: EF1–EF3 fixes on native XLM / TON / SUI sends (2026-11-25)

Base: 1ed6ca25c4d50ce9f712c62bfb2d6f887d6900f8 (includes 1ed6ca2, the QA delete). Review: base..HEAD of this commit.

- **EF1:** Stellar reads the newest ledger first, then the transaction. A 404 counts as expired only when that same response's `Latest-Ledger` header is at least the head's sequence and the head closed past `maxTime + 30 s` (`stellarNotFoundExpired`, tested, including a stale-backend case). Sui reads the epoch first, then `getTransaction`; a notFound is judged against that earlier epoch. TON is unchanged.
- **EF2:** Migration 0105: for XLM/TON/SUI the guard trigger refuses any change to a `txid` once it is recorded.
- **EF3:** The txid/send_meta recorder in `sendOne` updates only where `status = 'signing'`, and throws before broadcast when no row changed.
- Not done: no mocked network test for the Sui order (the rule is covered by code review only). The unused `stellarBackup` and the TONAPI key are still open.
- Tests: 1,541 passed. Build OK. Nothing sent on chain.
