# QA-0009: several TSD swaps at once — auditor note (2026-11-25)

Before: a member could have only one open TSD swap (TSD <-> THORChain/Maya coin); a second was refused until the first finished (~15+ min).

After:
- Up to 5 open TSD swaps per member (MAX_OPEN_TSD_ROUTES, tsd-route.ts, tested).
- A new swap is refused while any open swap has not yet sent its first coins (buy: no tsd_txid in reserved/sending_tsd; sell: no swap_send_id/usdc_txid in reserved/swapping/minting; gas_pending judged by resume_stage). Enforced in startTsdRoute and in reserve_tsd_route (migration 0115, same advisory lock).
- Free TSD now also subtracts TSD sent by other open swaps whose Omni transfer has no confirmation yet (tsdInFlight; unreadable → balance treated as unreadable, nothing sent).
- Shared EVM-pocket USDC: a swap waiting for its bridge payout, or about to send USDC to TSD Bridge, counts only the balance left after USDC owed to other open swaps still waiting to send it (usdcOwedToOthers, tested).
- claim(): a route step runs only if no other route of the same member is mid-step, so two swaps never sign from the same pocket at once (EVM nonce / UTXO).
- Unchanged: per-swap and daily caps, Telegram/approval rules, txid-before-broadcast, never re-sign, reserve_swap_send "signing" guard. Other swap kinds (pool, Relay, STON.fi, two-step, chains) keep their one-open rule.

Tests: src/lib/xchain/tsd-route-concurrent.test.ts; xchain suite 104 pass; typecheck clean. No live funded run yet.
