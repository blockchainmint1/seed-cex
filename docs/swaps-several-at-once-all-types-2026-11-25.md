# Several swaps at once — every swap type (QA-0009 follow-up), 2026-11-25

Builds on 56f63a3 (TSD swaps several at once).

## Rule (src/lib/swap/lanes.ts, tested in lanes.test.ts)
- Lane = one coin in one pocket (THORChain-style asset or network:token; TSD has its own accounting → no lane).
- Balance-watching swaps (hype_chains, two_step_swaps, relay_swaps, ton_swaps) note a balance and hand on "what arrived". They never share a lane with any other open top-level swap. Exact-amount swaps (tsd_routes, swap_sends, dex_swaps) may share lanes with each other.
- Chained swaps hold ETH + end coin(s) + their own coin until status mid2/leg3, then only TON (+ USD₮ on TON).
- Pool swaps add POOL:<network>; two-step/dex on the same network never overlap (dex_swaps_one_open index still in place).
- At most 5 open top-level swaps per member (MAX_OPEN_SWAPS), plus 5 per kind in SQL.

## Enforcement
- assertSwapLaneFree (lanes.server.ts) runs inside withPocketSpendLock (DB-claimed per-member lock) in every top-level start: startTsdRoute (no parent), sendSwapFromPocket (no leg), requestDexSwap (top-level only), requestTwoStep, relay request, startTonToUsdt (no chain), hype-chain request. Unreadable tables → refuse, nothing sent.
- Migration 0118: reserve_hype_chain and reserve_two_step_swap drop "one open per member" for a cap of 5; two_step_swaps_one_open index dropped; unapproved requests expire after 15 min instead of being cancelled by a newer request.
- Unchanged: reserve_relay_swap / reserve_relay_leg (one open Relay — implied by the ETH lane anyway), ton_swaps_one_open, dex_swaps_one_open, reserve_swap_send 'signing' guard, all caps, Telegram taps, baselines, txid-before-broadcast, never re-sign.

## Known limits for review
- Different swaps signing from the same EVM pocket in the same minute (e.g. a TSD route's USDC send and a chained swap's Relay step) both fetch the pending nonce; a collision is refused by the node and retried (pre-existing across kinds, now more likely).
- A chained swap whose step 1 is a TSD route is still subject to reserve_tsd_route's "earlier TSD swap must have sent its first coins" rule; if refused, the chain stops with nothing sent.
- Gas spent by another swap can only make a baseline-based hand-on smaller, never larger.

Tests: 1670 pass, typecheck clean. No funded run.
