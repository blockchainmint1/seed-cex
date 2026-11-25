# Seeds — TA1–TA5 fixes (TON / Relay TON / USD₮ on TON / STON.fi)

Responds to: seeds-ton-relay-usdt-ston-review-2026-11-25 (base 4a09405). Owner chose: fix all five.
Nothing signed or sent on chain. Stage unchanged (testers only).

## TA1 (High) — native TON watcher
- `src/lib/pockets/ed-confirm-rules.ts` `tonTraceStatus` no longer reads `out_msgs`.
  - Paid = a child whose `transaction.account.address` and `in_msg.destination.address` are the destination and whose `in_msg.value` equals the amount exactly (number must be a safe integer, else wait). Result = child `!aborted && success`; emulated child → wait.
  - Failed = root aborted / unsuccessful, or root `action_phase.skipped_actions > 0` or `action_phase.success === false`.
  - Anything else (no child yet, amount mismatch, other destination) → null (keep waiting, hold stays).
- Test fixture cut from a live TONAPI `/v2/traces` response (empty `out_msgs` on every node; payment visible only as the child's `in_msg.value` 6463073460). 11 cases.

## TA2 (High) — STON.fi minimum
- `src/lib/ston/rules.ts` `stonMinimum(shown, fresh)`: refuses when fresh < 99% of shown; signs `max(99% shown, 99% fresh)`. `shown = 1` signs 99% of the server quote (test).
- `ton_swaps.quote_units` stores the server quote; check constraint now `min_out ≤ GREATEST(shown, quote)` (migration 0109).

## TA3 (Medium) — caps
- TON priced via `fetchQuotes(TRACKED)` (TON tracked); unpriced → refused.
- New `reserve_ton_swap` (service-role only, advisory lock per member): per-swap and 24h USD caps from `swapLimitsFor`, `amount_usd` stored and frozen by `guard_ton_swap`. Testers keep no caps per standing rule.
- Set-asides: TON is not a trading leg, so there is nothing for `pocketSpendProblem` to check today.

## TA4 (Low) — USD₮ send TON check
- `readUsdtTonSpendable` returns `feeUnits = usdtFeeAllowance(balance)`: 0 below 0.13 TON (0.05 gas + 0.05 fee cap + 0.03 keep), so preparation refuses before code/2FA/tap.

## TA5 (Low) — Relay TON arrival
- `tonPayoutSeen` (relay/rules.ts, tested): requires a finished `TonTransfer` (status ok, not in progress) to the pocket's raw address of ≥ minimum since the swap row was created, read from TONAPI `/v2/accounts/{raw}/events?start_date=`. Unreadable history → wait. Balance delta no longer decides.

## Verification
- Typecheck clean; full `bun test`: 1,583 pass, 0 fail.
- Not done: any live send. Plan from the review stands: STON 0.1 TON swap (read signed min back), USD₮ sends, under-funded USD₮ send refused, then one native TON withdrawal.

Note: the review lists `TONAPI_API_KEY` as unset — it is set and verified (three keyed requests succeeded).
