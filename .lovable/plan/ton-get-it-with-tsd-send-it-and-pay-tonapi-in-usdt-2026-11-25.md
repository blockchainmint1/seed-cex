# TON: get it with TSD, send it, and pay TONAPI in USDT

## What Bobby gets
1. **TSD → TON in one tap.** Swap page offers TON. Route: TSD → ETH (existing TSD Bridge leg) → TON through Relay (live quote checked today: 0.01 ETH ≈ 17.8 TON). One Telegram Approve covers the whole route; if the second step's fresh price is worse than agreed, the ETH stays in the member's own pocket.
2. **TON → USDT on TON.** The TONAPI bill is paid in USDT on the TON network, which Relay can't deliver. Seeds swaps TON → USDT inside the member's own TON pocket on STON.fi (the biggest TON exchange).
3. **USDT-on-TON withdrawals.** Seeds can send USDT (TON) to an outside address with the same email code + 2FA + Telegram tap as every other withdrawal. First real test: pay the $9.90 TONAPI Lite bill.
4. Testers only until the auditor signs off and the small test sends succeed.

## Build order
1. Relay ETH → TON leg (Relay's TON payout address checked, TON payout confirmed on the TON chain).
2. Chain it after the TSD → ETH leg as one route, one tap.
3. USDT-on-TON balance + send (TON "jetton" transfer from the member's 1106 TON pocket; exact token contract pinned, TON fee reserve kept).
4. STON.fi TON → USDT swap inside the pocket (quote re-checked server-side, minimum enforced on-chain).
5. Auditor note + tests; then the funded test: TSD → TON → USDT → TONAPI.

## Not in this round
- TON → ETH back out through Relay (needs signing a Relay-built TON transaction; separate review). Members can still withdraw TON directly.

## Technical details
- Relay chain id 224235520, native TON currency `EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c`, 9 decimals; recipient = member's TON pocket (not the EVM pocket), so checkRelayQuote gains a per-destination recipient/currency rule.
- USDT jetton master pinned: `EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`; member's jetton wallet address derived and cross-checked with toncenter + TONAPI before signing.
- Reuses ed-send.server.ts rules: txid + expiry stored before broadcast, never re-signed, chain-proven expiry only.
- New tables/migrations for route legs follow the relay_swaps / tsd_routes patterns.
