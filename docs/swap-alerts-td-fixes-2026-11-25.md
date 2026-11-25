# TD1–TD3 fixes — 2026-11-25

Scope: follow-ups to the review of 18b78c2..ab52b2e. No change to how or when coins are sent.

- **TD1** `src/lib/dex/swap.server.ts`: a pool swap with `tsd_route_id` skips its stop alert only when that TSD route is itself in a stop stage (failed/kept_mid/kept_usdc) — the route already alerted. If the route finished or can't be read, the pool swap still alerts, so no stop goes silent. (Routes started by pool swaps carry no `parent_id`, so the route side keeps alerting.)
- **TD2** `src/lib/hype-chain/hype-chain.server.ts`: step-3 retry pattern now also matches "isn't answering" (STON.fi) and "servers disagree" (TON seqno / jetton reads). All such errors are thrown before any send ("Nothing was sent"); the existing `tonStepSince` check runs first on every retry, so a step already sent is adopted, never re-sent. 30-minute cap unchanged.
- **TD3** `src/lib/two-step/two-step.server.ts`: removed leftover `&& true`.
