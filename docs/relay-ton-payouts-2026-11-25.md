# Auditor note — Relay ETH → TON and one-tap TSD → TON (Nov 25 2026)

**Scope:** new swap direction `to_ton` for Relay and for one-tap chained swaps (`hype_chains`). Testers only (relayBlocker / HYPE_CHAIN_TESTERS_ONLY unchanged). No new signer, no new key use: Seeds still signs only the Ethereum `depositNative(pocket, orderId)` to Relay's depository with the member's 1106 EVM key.

## What changed
- `src/lib/relay/rules.ts`: `to_ton` direction; TON chain id 224235520, native TON id `EQAAAA…M9c`, 9 decimals. `checkRelayQuote` for `to_ton` requires an expected TON recipient, compares Relay's `details.recipient` **exactly** (TON addresses are case-sensitive), and requires native TON with 9 decimals. All existing deposit checks (one step, one tx, known depository, Ethereum, exact value, calldata credits the pocket) are unchanged.
- `src/lib/relay/relay.server.ts`: TON recipient taken only from the member's current link (`addresses.TON`), stored in `relay_swaps.recipient`, re-checked against the live link when the tap is spent and before signing (`sameLink`). TON balance noted once before signing (`dest_baseline`, write-once); "done" only when Relay reports success **and** the TON pocket grew by ≥ the agreed minimum (`tonArrived`). Otherwise it stays open with a team note; nothing is ever re-sent.
- `src/lib/hype-chain/*`: `to_ton` behaves like `to_hype` (coin/TSD → ETH first, then Relay); the approval's `to` is the member's TON pocket and is matched when spent.
- `src/lib/swap/plan.ts`, Swap page, coin picker: TON is a receive-only side (ETH → TON via Relay; TSD/coins → TON in one tap). TON → anything is refused with a plain reason.
- Migration `0106_relay_ton_payouts`: direction checks widened; `recipient` (TON pattern required for `to_ton`, NULL otherwise) and `dest_baseline` columns; trigger makes `recipient` immutable and `dest_baseline` write-once; `reserve_relay_swap` / `reserve_relay_leg` carry the recipient, and a chain's Relay step must match the chain's direction.

## Please check
1. `tonArrived` relies on a balance delta. A member TON withdrawal during the bridging window could hide an arrival (swap stays open with a note — never pays twice), but can't fake one.
2. Relay status is trusted for "success"; the balance check is the independent confirmation.
3. TON pocket address comes from the link record only, never the browser.

## Verified
- `bun test` relay/hype-chain/swap: 49 pass (new `src/lib/relay/ton-rules.test.ts`: recipient mismatch, case change, jetton instead of TON, wrong decimals, missing recipient, routes).
- Live read-only quotes through the Swap page: 0.01 ETH → 17.78 TON; 20 TSD → 21.37 TON. Nothing was sent.

## Not in this change
USDT on TON (jetton balance/send, TON → USDT swap) — next.
