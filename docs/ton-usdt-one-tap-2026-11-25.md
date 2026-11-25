# Auditor note — one-tap TSD/coin → USD₮ on TON (Nov 25, 2026)

## What changed
TSD (or any THORChain/Maya coin Seeds can send) → USD₮ on TON is now a single approved swap
with three steps, on the existing one-tap chain (`hype_chains`, new direction `to_ton_usdt`):
1. TSD Bridge or THORChain/Maya: coin → ETH (existing audited step)
2. Relay: ETH → TON into the member's own TON pocket (existing audited `to_ton` step)
3. STON.fi: TON → USD₮ on TON in the same pocket (existing audited `startTonToUsdt`)

## Safety rules added
- One Telegram Approve covers the whole chain. The approval text names all three steps and the USD₮ minimum.
- `min_out` guards step 2 (TON). The new `final_min` is fixed at insert by trigger and guards step 3 (USD₮).
- The TON baseline (`ton_baseline_nano`) is noted once before the Relay step. It is write-once and can only be set in `mid` before `leg2_id`. `reserve_relay_leg` refuses a `to_ton_usdt` Relay step until the baseline exists.
- Step 3 hands on only `tonToHandOn` = min(Relay-reported, balance − baseline) − 0.265 TON in fees, with a floor of 0.1 TON (pure, tested). The member's own TON is never spent.
- Step 3 needs a fresh STON.fi quote ≥ `final_min`. The signed minimum is max(stonMinimum, final_min). Otherwise the chain stops in `kept_mid` with the TON in the pocket.
- `ton_swaps.parent_id` tags the step. `reserve_ton_swap` accepts a parent only when the chain is the member's own, is `to_ton_usdt`, is in `mid2` and has no `leg3_id`. A step that already exists since `step_at` is adopted and never re-sent. `leg3_id` is write-once.
- Inner steps are hidden from the standalone TON swap list.
- Still testers only (relayBlocker + stonBlocker at request). Step 3 passes tester=true, which is consistent with that gate. Before opening to capped members, caps must be counted once per chain.

## Files
- drizzle/migrations/0111_ton_usdt_one_tap_chain.sql
- drizzle/migrations/0112_relay_leg_ton_usdt_chain.sql
- src/lib/hype-chain/{rules.ts, rules.test.ts, hype-chain.server.ts, hype-chain.functions.ts, AGENTS.md}
- src/lib/ston/ston.server.ts
- src/lib/swap/plan.ts
- src/components/swap/HypeChainResult.tsx
- src/routes/swap.tsx
- src/lib/activity/activity-rules.ts
- Also: Swap-link prefill on the Withdraw page, the revoke dialog and pocket balances (UI only)

## Checks
- 1,603 tests pass and the type check is clean.
- A live quote for 50 TSD gave ≈ 54.45 TON → 48.996 USD₮ on TON with the three steps shown.
- No transaction was signed or sent.

## Please review
- Fee reserve (0.265 TON) versus actual STON.fi plus wallet fees.
- The `kept_mid` paths in `mid2`/`leg3`.
- The `reserve_ton_swap` parent check.
