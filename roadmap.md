# Roadmap

- [x] Cross-chain swaps: THORChain routes for BTC, ETH, LTC, DOGE, BCH, XRP, SOL, ZEC, BNB, TRX (+ USDC/USDT on Ethereum) — live quotes, safety checks, /swap page
- [x] Cross-chain swaps: every live THORChain + Maya pool (46 coins, 17 networks) quotable on /swap with per-protocol memo shortcodes
- [x] Cross-chain swaps: add Maya Protocol as second route with best-price comparison (price-only until a second independent Maya server exists)
- [x] Multichain pockets: Seeds-side keys/addresses/balances/signing for DOGE, BCH, XRP, TRX, SOL (+ ZEC addresses/balances); HME link accepts optional pockets
- [ ] HME Wallet extra pocket keys: built and audited on HME's side, not published; members must re-link from Seeds to share them (blocked: HME publish)
- [ ] HME Wallet revoke: sweeps TXC before TSD/tokens, leaving TSD with no TXC for fees — ask HME to move tokens first (blocked: HME team)
- [ ] DASH/ATOM/RUNE/ADA pockets: only accept in submit once Seeds can read and sign them; ADA must use the Icarus master-key method HME uses (blocked: Seeds signers not built)
- [x] Warn members HME Wallet can't hold DOGE/BCH/ZEC/XRP/TRX/SOL: swap back to TSD before revoking (Profile, revoke dialog, swap page, Telegram, revoke email); TSD swaps never buy a coin Seeds can't sell back
- [ ] Zcash v5 (ZIP-244) signing
- [ ] Per-coin "send out" for the new coins before taking deposits (HME Wallet can't move them)
- [x] Cross-chain swaps: Seeds fee — Bobby chose no fee for now (no THORName needed)
- [x] Cross-chain swaps: send step built for BTC, LTC, ETH + Ethereum tokens, DOGE, BCH, XRP, TRX, SOL (THORChain, instant-access pockets, admin-only pilot, $250/swap, $1,000/day)
- [ ] Swap pilot: first small real swap per coin (blocked: Bobby funds his pocket and presses Send)
- [ ] Swap pilot: open to members + confirm limits (blocked: Bobby's limits choice, attorney/auditor sign-off)
- [ ] DOGE/BCH/XRP/TRX/SOL sending: no member has linked those keys yet (needs a seed-based pocket or HME Wallet support)

- [x] Import the supplied 21-page brand guidelines faithfully at /brand, with original PDF access and desktop/mobile verification

- [x] Update HME SSO, profile sync and events to HME_ECOSYSTEM; confirmed all 11 existing UUIDs with HME, tested profile receiver, activity reporting and site restrictions
- [x] Back up all 9 pre-HME accounts; delete the 4 test accounts; email-confirmed merge for the 5 real ones on first HME sign-in
- [ ] Complete real HME SSO sign-in after publishing the credential cutover (requires Bobby's HME email-code sign-in; popup and ticket-validation tests passed)

- [x] Merge profile and wallet around required HME Wallet linking; consolidate settings and remove legacy vault onboarding from the account experience
- [ ] Activate linked-pocket exchange/P2P settlement and wallet-approval transactions before enabling HME-only live trading (separate settlement integration)

- [x] Admin console (/admin) — accounts, totals, open trades/orders
- [x] Grant admin role to operator accounts
- [x] Trim markets to TSD pairs only (dropped USDC_TXC, TXC_USDT)
- [x] BTC wrap/unwrap desk — Seeds client built; issuer live on TSD Swap side
- [x] Issuer launched wBTC #43 / wLTC #44 / wETH #45 on Omni — registered in chain registry
- [x] Generalize Omni settlement to any property (TSD + wrapped assets)
- [x] Add BTC/TSD and ETH/TSD markets (wrapped under the hood, shown as native)
- [x] Unwrap flow: send user's wrapped asset to issuer deposit address
- [x] Consolidate wallet balance rows — one row per asset across EVM networks
- [ ] Issuer-side go-live checklist (on TSD Swap): flip Live per asset, fund BTC/LTC vaults for unwrap liquidity
- [x] BTC listed in wallet balances with wrap-deposit flow (WRAP_ISSUER_API_KEY fixed by user)
- [x] Removed Withdraw column from spot balances (reads as custodial); withdrawal history panel retained
- [x] "Locked (trading)" column: balance sitting in the authorized trading branch per asset
- [x] Nav: dropped Admin link, ABOUT/PROOF uppercase
- [x] P2P marketplace (/p2p): seller profiles, verified-fund offers, trade room + chat, feedback, ranking, community jury + admin rulings
- [x] P2P: Telegram alerts (new buyer, paid, released, cancelled, expired, flagged, disputes, chat, uploads)
- [x] P2P: receipt / screenshot uploads in trade chat (private, 8 MB, images + PDF)
- [x] P2P: market-following prices (market ± margin, CMC feed, TSD = $1)
- [x] Exchange Telegram alerts: order fills, settlement failures, settled trades, sign-ins, deposits (wallet-page sweep), expiring authorizations
- [ ] Admin report/queue UI for P2P user reports (APIs exist, no page yet)
- [x] Authorization copy on /wallet + /account: branch 1106, HME Wallet link modes (verified in preview)
- [ ] /how-it-works + homepage still pitch only the capped/expiring vault model — add the HME Wallet link (instant-until-revoked / approve-every-trade)

- [x] Branded emails via AWS SES: welcome, trade confirmation, P2P order, "you changed X", weekly update; profile email switches; one-click unsubscribe
- [ ] Weekly email schedule (Mondays) — scheduling tool unavailable this session; set up after publish
- [ ] Email footer postal address (CAN-SPAM) — needs Bobby's business mailing address

- [ ] AI basket builder: AI writes a member-approved rulebook, fixed engine executes it (concept in docs/ai-basket-strategy-concept.md; blocked: Bobby's detailed spec + linked-pocket settlement)
- [x] /register Peer Pay: 7-day copy/email link, payer signs in with Honest.Money, registrant can cancel, no discount
- [ ] Peer Pay: full friend-pays test with a second Honest.Money account (blocked: Bobby picks a test account)

- [x] Ignite confirmation page after payment: thanks, seat reserved, HME referral link (existing members), seats left, check email, connection info coming
- [x] Ignite: find out why NectarPay never notified Seeds of Bobby's paid invoice; add a server-side payment re-check so a missed notice can't strand a paid seat
- [ ] Ignite: "connection info" email for confirmed seats (blocked: Bobby supplies the class link/details)
- [x] Ignite: "A letter from Bobby" at the bottom of /register (from Week 138 call) + class overview write-up
- [x] Site-wide rebrand to /brand guidelines (logo, colors, Manrope, buttons, favicon), /register first
- [ ] Brand: SVG logo masters + .ico/PWA icons (blocked: designer supplies vector files)
- [ ] Ignite letter: Bobby confirms $1,000/seat match + 10/10/10/20 split, contest rules/prizes, "free for miners", basket-builder timing (blocked: Bobby/counsel)
- [x] NectarPay: explained the missed notice (follow-up work cut off, never retried); they now save + retry; Seeds re-runs repeated confirmations
- [ ] NectarPay: confirm each retry is re-signed with a fresh timestamp (blocked: NectarPay team)

## TSD <-> THORChain route (one step for members)
- [x] Route model chosen: go through TSD Bridge (single issuer) for TSD<->USDC, Seeds runs the THORChain leg; coins pass only through the member's own pockets
- [x] Seeds' TSD Bridge key works with cash-out access; live: 0% fee both ways, 10–100,000 TSD per order
- [x] Built: "Pay with TSD" on /swap (buy any THORChain coin with TSD, sell back to TSD), resumable step engine, every-minute job, progress tracker, price-moved pause, tests
- [ ] Seeds gas wallet: Bobby creates one more AWS KMS key (SEEDS_GAS_KMS_KEY_ETH) and funds its address with a little ETH (blocked: Bobby) — until then members need ETH in their EVM pocket
- [ ] First real $10–50 test each way (blocked: Bobby, pilot admin-only)
- [ ] Ask TSD Bridge: pay USDC straight into THORChain (router deposit with our memo) and credit THORChain payouts to mint addresses — removes the gas step (blocked: TSD Bridge team)
- [ ] Auditor review of TSD routes before opening to members (blocked: auditor)
- [ ] View-only THORChain order book on market pages (waiting on Bobby's go-ahead)

## Locked trading balance (2-of-2 + 30-day refund, TXC/ISK)
- [x] Lock rules: script, address, Seeds key derivation, BIP143 signing, refund path, lock strength (src/lib/lock/, tested against live node)
- [x] Spec for HME Wallet + auditor (docs/locked-trading-balance-spec.md)
- [ ] HME Wallet: recognise/sign lock inputs, save lock description, offline "Recover locked funds" (blocked: HME team)
- [x] Auditor design review: all conditions encoded (P2SH default, deposit depth, never-sign-twice ledger, sweep-all, fee reserve, Omni decode, no RBF, pair settlement)
- [x] Real test on TXC: P2SH deposit + co-signed send + never-sign-twice all pass; P2WSH proven unusable for tokens (Omni ignores it) -> P2SH only
- [ ] Live test: member-only refund from the P2SH lock (waits for the 20-block test timer)
- [x] KMS signer code (src/lib/lock/kms.server.ts) + setup instructions for Bobby
- [ ] Connect AWS KMS keys and run kms-check (blocked: Bobby creates the two keys + signing user, then enters 5 settings)
- [x] HME Wallet hand-off doc for lock signing/recovery (P2SH only)
- [ ] HME Wallet: P2SH lock inputs need nonWitnessUtxo support in their signer (blocked: HME team)
- [x] Attorney briefing incl. trade-type comparison
- [ ] Legal answers on custody wording, licensing, P2P, Ignite deposit promise (blocked: counsel)
- [ ] Wire lock into settlement: lock/refresh/unlock flows, instant settle only while strong (blocked: HME Wallet + real test + auditor)

## Seeds AI (/ai) — absorbing Crypto Fortune Teller
- [x] Phase 1: price history (daily download) for coins Seeds can buy, 10 theory tests per coin, plan tester incl. fixed basket (e.g. BTC/ETH/LTC), /ai + /ai/coin/$id, /admin/ai (coin list, data health, refresh) on normal admin sign-in
- [x] Phase 2: "Lock it in" — plans saved to the member's account (TSD amount, coins, rules); daily server-side check + Telegram "Based on your plan we should… " message with a review link
- [ ] Phase 3: EXECUTE — member's TSD → USDC via TSD Bridge cash-out API (Seeds key already has cash-out access) → THORChain buys into the member's own pocket addresses; gas top-up design; one-tap Telegram confirm below an admin-set dollar limit, bigger moves open Seeds (blocked: build + real small test + auditor review)
- [ ] Phase 4: more coins — Ethereum tokens like SHIB need a DEX route (THORChain/Maya don't list them); DOGE/BCH/XRP/SOL/TRX buyable once members link those keys (HME handoff list)
