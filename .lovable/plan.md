# Seeds — P2P Escrow Exchange (USDC / TXC)

## First: the honest verdict on the original idea

Uploading a seed phrase to a server is the opposite of non-custodial. One server breach = every user drained, permanently, with no recourse. It also makes Seeds a money transmitter in most jurisdictions, and it trains users into the exact behavior every crypto phishing scam relies on. We are not doing that.

The *goal* behind it — "log in, your crypto is just there, no deposit dance" — is completely achievable. That's what this plan builds.

## The key model: browser-encrypted wallet

1. Seeds generates a BIP-39 seed phrase **in the user's browser**.
2. It's encrypted there with the user's password (PBKDF2 → AES-GCM).
3. Only the **ciphertext** is stored in Lovable Cloud. The server never sees the seed, the password, or any private key.
4. On login, the ciphertext is pulled down and decrypted in the browser. Feels like an account. Isn't custody.
5. The user is shown their phrase once, at creation, with a forced "I've written this down" step. That's their escape hatch — Seeds cannot reset a lost password, and the UI says so bluntly.

This is the same shape as MetaMask's vault, just synced.

## How USDC ↔ TXC actually settles

I read texitcoin.org/build. Relevant facts: TXC is a Scrypt UTXO chain (Bitcoin/Litecoin lineage), 3-minute blocks, sub-cent fees, with a public mempool.space-compatible REST API at `mempool.texitcoin.org` (free, no key) including `POST /api/tx` for broadcasting signed raw transactions. Omni Layer handles tokens on TXC. USDC lives on a completely different chain (Ethereum/Base/Solana).

There is **no shared ledger**, so there is no such thing as a single atomic USDC↔TXC swap. The three real options:

| Mechanism | How it works | Verdict |
|---|---|---|
| Bridge / wrapped TXC | Lock TXC, mint wTXC on an EVM chain, trade in a normal AMM | Powerful, but bridges are the single most-hacked thing in crypto and it's a huge build |
| Order book + escrow | Both sides deposit to an escrow the exchange arbitrates, released on confirmation | Practical, well-understood, ships now |
| Atomic swap (HTLC) | Hash-timelock contracts on both chains, trustless | Genuinely trustless, but needs TXC script support + long timelocks; bad UX at 3-min blocks |

**Recommendation: P2P order book with escrow**, structured as 2-of-3 multisig so Seeds is an *arbitrator*, not a custodian:

- Keys: maker, taker, Seeds. Any two can release. Happy path = maker + taker sign, Seeds never touches it. Dispute path = Seeds signs with the honest party.
- This is how Bisq and (pre-shutdown) LocalBitcoins worked. It's the credible answer.

Trade lifecycle (the core state machine):

```text
OPEN → MATCHED → BOTH_FUNDED → RELEASED → SETTLED
                      │
                      └─→ DISPUTED → ARBITRATED
                      └─→ TIMED_OUT → REFUNDED
```

## Phasing (important)

Signing real value on two chains is not a first-build. So:

**Phase 1 (this plan)** — the entire product, real except for broadcast:
- Real BIP-39 wallet generation + browser encryption, real TXC address derivation
- Real TXC chain data via `mempool.texitcoin.org` (live balances, confirmations, fees, block height)
- Full order book, matching, escrow state machine, trade history in Cloud
- USDC side and final broadcast run in a clearly-labeled **simulation mode** — banner in the UI, no real funds at risk

**Phase 2 (later)** — real multisig escrow addresses, real signing, real broadcast, dispute arbitration, KYC/legal review.

Shipping Phase 1 in sim mode is the responsible way to prove the mechanism before touching anyone's money.

## What gets built

**Pages**
- `/` — Seeds landing: the pitch, the non-custodial explainer, "why we will never ask for your seed"
- `/trade/usdc-txc` — the exchange: chart, order book (bids/asks), buy/sell form, open orders, trade history
- `/wallet` — balances, TXC address + QR, receive/send, encrypted-vault status
- `/auth` — sign up / sign in, wallet creation + seed backup flow
- `/orders` — a user's open orders and escrow trades with live state
- `/terms`, `/privacy`, `/manifesto` — drafted fresh, honest.money tone
- Global footer: "Part of the [honest.money](https://honest.money) ecosystem" + Terms / Privacy / Manifesto

**Backend (Lovable Cloud)**
- Email/password + Google auth
- Tables: `profiles`, `wallets` (ciphertext + public addresses only — never plaintext), `orders`, `trades`, `escrows`, `trade_events`, `user_roles` (separate table, for arbitrators)
- RLS everywhere; order book is publicly readable, orders/wallets are owner-scoped
- Server functions: place/cancel order, matching engine, escrow state transitions, TXC chain polling

**Design direction**
Not another purple-gradient DeFi dashboard. Seeds should read as: terminal-adjacent, high-density, monospace numerics, dark by default, green/amber for market state — an instrument, not a brochure. Texas-grit rather than Silicon Valley pastel.

## Technical notes

- Crypto in-browser: `@scure/bip39` + `@scure/bip32` + `@noble/hashes` (audited, tiny, no Node polyfills — important because the server runtime is a Cloudflare Worker and can't run native crypto addons)
- Vault: PBKDF2-SHA256 (600k iterations) → AES-256-GCM via WebCrypto. Encrypt/decrypt only in the browser.
- TXC address derivation: BIP-44 path with TXC's coin type / address version bytes — I'll confirm the exact params against the open-source `texitcoin` repo's chainparams before implementing.
- Chain reads go through a server function (caches responses, avoids hammering the public API from every browser).
- Wallet/vault code is client-only and must not be statically imported by SSR routes.
- Never `dangerouslySetInnerHTML`; all order input validated with Zod client- and server-side.

## Explicitly out of scope for now

Real fund movement, real USDC integration, KYC/AML, fiat on-ramp, bridge/wrapped TXC, atomic swaps. Each needs its own conversation — the legal one especially.
