# TON USD₮ chain — audit TC1 / TC4 fixes (2026-11-25)

Scope: follow-up to review of 508074e..18b78c2.

- TC1: step 3 of the to_ton_usdt chain now passes the member's live tester status (isTesterUser: admin or beta role) to startTonToUsdt instead of a hard-coded `true`, so the per-swap and 24-hour TON caps apply to non-testers once chains open. Testers are unchanged (no caps, per Nov 19 rule). File: src/lib/hype-chain/hype-chain.server.ts.
- TC4: new pure chainStatusLabel (src/lib/hype-chain/rules.ts, tested) — a to_ton_usdt chain that stopped (kept_mid) after TON arrived (ton_amount set) reads "Stopped — TON in your pocket"; otherwise the old label. Display only.
- TC2: no change; signed minimum continues to come from Seeds' fresh server quote.
- TC3: no change by decision; an unknown step 3 stays open for manual review (fail-safe).

No change to reserve functions, triggers, amounts or signing. Hype-chain tests pass; typecheck clean.
