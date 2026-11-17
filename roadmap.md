# Roadmap

- [x] Cross-chain swaps: THORChain routes for BTC, ETH, LTC, DOGE, BCH, XRP, SOL, ZEC, BNB, TRX (+ USDC/USDT on Ethereum) — live quotes, safety checks, /swap page
- [x] Cross-chain swaps: add Maya Protocol as second route with best-price comparison (price-only until a second independent Maya server exists)
- [x] Multichain pockets: Seeds-side keys/addresses/balances/signing for DOGE, BCH, XRP, TRX, SOL (+ ZEC addresses/balances); HME link accepts optional pockets
- [ ] HME Wallet: send optional pocket keys per docs/hme-wallet-extra-pockets.md (blocked: HME team)
- [ ] Zcash v5 (ZIP-244) signing
- [ ] Per-coin "send out" for the new coins before taking deposits (HME Wallet can't move them)
- [ ] Cross-chain swaps: wire pocket signers + broadcast into /swap behind existing safety gates and settle-guard (blocked: HME optional pockets + linked-pocket settlement)
- [ ] Cross-chain swaps: Seeds fee — register a THORName/MAYAName and set the fee (blocked: Bobby's fee choice)

- [x] Import the supplied 21-page brand guidelines faithfully at /brand, with original PDF access and desktop/mobile verification

- [x] Update HME SSO, profile sync and events to HME_ECOSYSTEM; confirmed all 11 existing UUIDs with HME, tested profile receiver, activity reporting and site restrictions
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
