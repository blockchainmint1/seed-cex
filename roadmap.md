# Roadmap

- [x] Activity page (/activity, /trades forwards): action-needed strip, tabs for open orders, order history, trades, swaps, P2P, deposits, withdrawals, Seeds AI, plus All activity with filters + CSV (Bobby, Nov 22)
- [x] Deposit history: record each new deposit from now on + fill in past deposits from TXC, ISK and Ethereum-style networks (Bobby: "Both", Nov 22)
- [x] One Swap page for every coin: THORChain/Maya, Uniswap/PancakeSwap/PulseX and TSD in one form, Seeds picks the best route; old Any-coin address forwards (Nov 22)
- [x] Two-step swaps done automatically under one Telegram tap (e.g. PEPE on Ethereum → Bitcoin, Bitcoin → a Base token); stops safely with the in-between coin in the pocket if the price moves (Nov 22)
- [ ] Auditor review of two-step swaps before publishing (blocked: auditor)
- [ ] First real two-step swap, small amount, by a beta tester (blocked: auditor review + a tester's Telegram tap)

- [x] /admin/marketing panel: one home for coin recruiting, ads and coin videos; old /admin/ads and /admin/videos addresses forward there (Nov 21)
- [x] Admin → Marketing → Coin recruiting: find coin teams on CoinMarketCap (mid-size, newest, MEXC/LBank/XT/Gate/BingX) or a pasted list (BitMart), score 0–100 with reasons, pipeline stages, AI-drafted outreach a person approves and sends, 1,000-paid-listings goal tracker (Nov 21)
- [ ] Paste the BitMart stranded-coin list into Admin → Recruiting (blocked: someone gathers the list)
- [ ] "Who sent you?" on /list + finder payouts for the 20% finder's fee (blocked: Bobby confirms the finder's-fee program)
- [x] Ad spots (ecosystem + Seeds-listed coins only): homepage spotlight, markets sponsored row, coin-page side card, sponsored news story, slim coin banner + Admin → Ads with view/click counts + /about/ads (Nov 21)
- [ ] First real ad booked in Admin → Ads, and ad prices per spot (blocked: Bobby's prices and advertisers)
- [x] Coin market pages, CoinMarketCap-style: recent THORChain trades, cost by trade size, my swaps & orders, global market data, links, other exchanges, news, team-picked videos (Admin → Coin videos) (Nov 20)
- [ ] Add the first expert videos in Admin → Coin videos (blocked: Bobby's team picks them)
- [x] Audit #3 follow-up 2: EVM double-check before freezing (two servers + receipt re-check), 5-min resend backoff, 1-min retry after a TXC/ISK index-check failure (Nov 20)
- [ ] Live test #4 before publishing: low-fee Base first payment dropped → watcher resends, no freeze (blocked: real funded test)
- [x] Homepage "Seeds Genesis" hero from Cory: video plays once then rests on the final tree, phones get the still, new headline/buttons (Nov 20)
- [ ] Higher-resolution Genesis master for big screens (blocked: Cory's team supplies a 1920px+ export)
- [x] /admin/settings withdrawal levels: low limits for new members, automatic step-ups from history, per-member set level / pause with notes, logged (Nov 18)
- [ ] Confirm the starting withdrawal levels (blocked: Bobby's numbers)
- [x] Two-factor sign-in (authenticator app) in Account → Security; required for withdrawal levels 2+; code on every withdrawal; admin reset with own code + note (Nov 18)
- [x] Admins must use Seeds two-factor: console locked until set up, code every 12 hours, enforced on every admin action (Nov 18)
- [ ] Bobby to confirm the 12-hour admin unlock window (agent-chosen)
- [ ] Bobby to set up two-factor at /admin in the preview before publishing, so admins aren't locked out (blocked: needs Bobby's real sign-in + phone)
- [ ] Two-factor: first real setup on a real Honest.Money sign-in (blocked: Bobby tries it; test sign-ins can't enroll)

- [x] Cross-chain swaps: THORChain routes for BTC, ETH, LTC, DOGE, BCH, XRP, SOL, ZEC, BNB, TRX (+ USDC/USDT on Ethereum) — live quotes, safety checks, /swap page
- [x] Cross-chain swaps: every live THORChain + Maya pool (46 coins, 17 networks) quotable on /swap with per-protocol memo shortcodes
- [x] Cross-chain swaps: add Maya Protocol as second route with best-price comparison (send-ready since Nov 19 via Liquify's Maya server)
- [x] Multichain pockets: Seeds-side keys/addresses/balances/signing for DOGE, BCH, XRP, TRX, SOL (+ ZEC addresses/balances); HME link accepts optional pockets
- [ ] HME Wallet extra pocket keys: built and audited on HME's side, not published; members must re-link from Seeds to share them (blocked: HME publish)
- [ ] HME Wallet revoke: sweeps TXC before TSD/tokens, leaving TSD with no TXC for fees — ask HME to move tokens first (blocked: HME team)
- [x] DASH/ATOM/RUNE/ADA/XMR accepted in HME links (Nov 18, at HME's request): keys checked, addresses + balances (not XMR), deposits stay closed; ADA = Icarus, XMR = Trezor method, both pinned to outside vectors + HME's own code
- [ ] DASH/ATOM/RUNE/ADA signers, then open deposits/swaps (ATOM on THORChain; DASH/ADA/RUNE need a 2nd independent Maya server) (blocked: not built)
- [ ] Monero: no THORChain or Maya pool exists, and reading a balance needs a view-key scan server — keys are stored only (blocked: no swap route anywhere Seeds uses)
- [x] HME Wallet: re-link on the same pocket replaces the old record; revoking a stale record leaves the live pocket alone (HME confirmed + tested, Nov 18)
- [ ] Joint HME Wallet test: 5→16 coins on same pocket, one active link, old 5-coin build refused, wallet revoke hits the active link (blocked: HME publishes their update)
- [x] Warn members HME Wallet can't hold DOGE/BCH/ZEC/XRP/TRX/SOL: swap back to TSD before revoking (Profile, revoke dialog, swap page, Telegram, revoke email); TSD swaps never buy a coin Seeds can't sell back
- [ ] Zcash v5 (ZIP-244) signing
- [x] Per-coin "send out" for the new coins before taking deposits (HME Wallet can't move them) — Nov 20, Seeds withdrawals
- [x] Cross-chain swaps: Seeds fee — Bobby chose no fee for now (no THORName needed)
- [x] Cross-chain swaps: send step built for BTC, LTC, ETH + Ethereum tokens, DOGE, BCH, XRP, TRX, SOL (THORChain, instant-access pockets, admin-only pilot, $250/swap, $1,000/day)
- [ ] Swap pilot: first small real swap per coin (blocked: Bobby funds his pocket and presses Send)
- [x] Swap gas: Bobby keeps the current TSD route (TSD -> TSD Bridge -> USDC in own pocket -> THORChain) and funds ETH himself; no in-house Seeds USDC swap. /swap now shows the ETH the fee needs and won't start a swap the pocket can't pay for (Nov 19)
- [ ] Seeds shared gas wallet: needs its own AWS KMS key (SEEDS_GAS_KMS_KEY_ETH) before Seeds can pay members' Ethereum fees; until then every pocket pays its own fee, and Admin -> Settings shows why (blocked: KMS key not created)
- [ ] Swap pilot: open to members + confirm limits (blocked: Bobby's limits choice, attorney/auditor sign-off)
- [ ] DOGE/BCH/XRP/TRX/SOL sending: no member has linked those keys yet (needs a seed-based pocket or HME Wallet support)

- [x] Import the supplied 21-page brand guidelines faithfully at /brand, with original PDF access and desktop/mobile verification

- [x] Update HME SSO, profile sync and events to HME_ECOSYSTEM; confirmed all 11 existing UUIDs with HME, tested profile receiver, activity reporting and site restrictions
- [x] Back up all 9 pre-HME accounts; delete the 4 test accounts; email-confirmed merge for the 5 real ones on first HME sign-in
- [ ] Complete real HME SSO sign-in after publishing the credential cutover (requires Bobby's HME email-code sign-in; popup and ticket-validation tests passed)

- [x] Merge profile and wallet around required HME Wallet linking; consolidate settings and remove legacy vault onboarding from the account experience
- [ ] Activate linked-pocket exchange/P2P settlement and wallet-approval transactions before enabling HME-only live trading (separate settlement integration)
  - [x] Exchange + P2P read the member's HME pocket (instant-access link) instead of old authorizations (Nov 18)
  - [x] Every send from a pocket waits for the owner's Telegram tap (built as the safe default; Bobby to confirm vs. "only above a limit")
  - [x] Same two-factor rule as withdrawals: two-factor on before the wallet link (built as default; Bobby to confirm)
  - [x] Unanswered/declined approvals cancel the trade; nothing is sent (15-minute window, swept every minute)
  - [ ] First real pocket-paid P2P release and exchange trade, small amounts (blocked: Bobby turns on two-factor, re-links, then tries one)
  - [ ] P2P dispute "Admin: release" now needs the seller's Telegram tap — decide if admins may force it instead (blocked: Bobby's decision)
  - [ ] Approve-each-trade (HME Wallet) links: sending from HME Wallet itself (blocked: HME Wallet signing flow not built)

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

- [x] /account rebuilt as exchange-style profile: tabs for overview, balances (spot/deposit/withdraw for every supported coin + network), profile, security, alerts, API keys, AI strategies (view/edit/pause/end), referrals; /api quick start, signing examples, recipes, troubleshooting
- [ ] Seeds-signed withdrawals to outside addresses for other coins — PulseChain only so far (Bobby chose it Nov 18); others still swap to TSD first (blocked: Bobby's decision + auditor review)
- [x] /ai: shares start even, editable in a popup (blank coins split what's left); THOR added (10 coins)
- [ ] /ai more coins: BNB, AVAX (needs BNB Chain/Avalanche sending), ATOM (Cosmos signer), ZEC (v5 signer), Maya coins ADA/DASH/RUNE (needs a 2nd independent Maya server) (blocked: Bobby picks which to build)
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
- [x] Primary markets from THORChain (Nov 19): /markets with 12 coin/TSD markets (BTC, ETH first), /markets/{coin}-tsd candlestick charts (15m/1H/4H/1D/1W, TSD = $1), THORChain chart on BTC/ETH/LTC order books, homepage + header/footer point to /markets

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

- [x] HEX + PulseChain (Nov 18): PulseChain network (PLS, pHEX) and HEX on Ethereum in balances/deposits; PLS/TSD, HEX/TSD, pHEX/TSD markets; PLS/HEX/pHEX on P2P; Seeds AI tester (1 year of CoinGecko history); live prices from CoinGecko/DexScreener
- [x] Seeds-signed PulseChain withdrawals (HME Wallet can't send there): 24-hour cancelable hold, $250 each / $1,000 a day, email + Telegram on every step, admin-only pilot
- [ ] PulseChain withdrawal pilot: first small real PLS and pHEX withdrawal (blocked: Bobby funds his pocket with a little PLS/pHEX and asks for one)
- [ ] PulseChain withdrawals open to members + deposits open for them (blocked: pilot result, auditor sign-off)
- [ ] Seeds AI buying PLS/HEX/pHEX through their TSD markets depends on sellers on the book (blocked: AI execution not built; linked-pocket market settlement not connected)
- [x] Seeds AI "Find my playbook": tries 231 rule combos, ranks on older history only, fresh-data held-up/faded check, optional AI write-up (signed-in, 10/day)

- [x] Admin: /admin sub-nav (account-style) + /admin/users to give or remove admin access (HME members only, can't remove yourself or the last admin, history + email notice)
- [x] Admin: /admin/ignite — registrants per class, searchable + sortable table, email a registrant, re-send payment link
- [x] Homepage Ignite popup (flyer style) driving to /ignite; /register and /register/confirmed 301 to /ignite
- [x] New-member setup guide (/welcome): first account visit, skippable, resumes where left off, reopen from Account → Overview (Nov 18)
- [ ] Bobby to confirm existing unlinked members should see the setup guide once (agent-chosen)

## Uniswap / PancakeSwap / PulseX (Bobby, Nov 18: more coins; Ethereum, Base, BNB Chain, PulseChain; pools directly; any coin)
- [x] Live prices from the pools on /swap/tokens: coin search or pasted address, best of every pool, sell-back check, plain warnings
- [x] Swapping from the member's EVM pocket on all four networks: exact-amount pool permission, server re-quote, agreed minimum, test run before sending, Telegram Approve tap, pays back into the same pocket, beta testers only (Nov 20)
- [x] TSD as a coin on Ethereum: TSD → any token (TSD Bridge pays USDC into the pocket, then the pool) and any token → TSD; one Telegram tap covers the whole swap (Nov 20)
- [ ] First small real swap per network (blocked: Bobby publishes, funds his pocket's fee coin on that network, taps Approve)
- [ ] Open token swaps to every member (blocked: first real swaps + Bobby's limits choice)

## List on Seeds (Bobby, Nov 18)
- [x] /list page (footer link): why Seeds, stop getting rugged, 3 packages $1,000/$2,500/$5,000, comparison, signed-in application form, /admin/listings review + admin Telegram ping
- [ ] Bobby to confirm package contents, one-time vs yearly, payment method, and "sponsored" label on paid spotlights
- [ ] Build what packages promise that doesn't exist yet: "New" badge, homepage spotlight, how-to-buy guide pages, trading contests (after launch)


## Business plan follow-ups (from /admin/plan, Nov 19)
- [x] /admin/plan business plan page with live numbers and calculators
- [ ] Bobby: confirm 20% listing finder's fee and USD vs TSD payout (blocked: Bobby's call)
- [ ] Bobby: listings one-time or yearly; monthly marketing budget; March 31, 2027 targets (blocked: Bobby's call)
- [ ] Bobby: conference coin count/size/first event; badge-only vs TSD claim reward (blocked: Bobby's call; lawyer review before any reward)
- [ ] Build when approved: "Who sent you?" on /list + finder payouts; invite click/sign-up counts; coach badge + directory; conference claim codes (/c/{code}); Founding 1,000 badge

- [x] Maya swaps: send BTC/ETH/USDC/USDT through Maya from pockets, and TSD routes pick the better of THORChain/Maya with fallback (admin-only pilot, same caps) (Nov 19)
- [x] Maya second server: Bobby decided not to run our own box for now (Nov 19); use Liquify's independent public Maya server (api-maya.liquify.com) as the second check, counted only when its node id differs
- [ ] Maya pilot: first small real Maya swap (blocked: Bobby presses Send)

## Security audit #2 (Nov 19) — Bobby's choices: swaps to outside addresses = Telegram tap + 2FA code; new Telegram = code only, no wait; Honest.Money scripts on public pages only; no limit-order guard yet
- [x] H1 Telegram connect/disconnect needs a fresh 2FA code (when 2FA on); old chat told
- [x] H2 Swaps (THORChain, Maya, TSD routes) paying outside the member's own pocket need fresh 2FA code + Telegram tap
- [x] H3 Remove legacy instant-withdrawal functions and legacy-authorization auto-send
- [x] H4 Honest.Money scripts off Account/Admin/welcome/wallet pages
- [x] M1 Pilot swap/TSD/PulseChain paths use full admin check (12-hour code)
- [x] M3 Visit counter rate limit + scheduled prune
- [x] M5 Size caps on every list input (zod advisory)
- [x] L1 approval match includes sending address; L2 full address on P2P approvals; L3 rate-limit public quote lookups; L5 onboarding save = update; L6 privacy wording on country
- [x] Carry-overs: daily swap cap counts open TSD routes; gas top-up per-member cap; re-link keeps in-flight TSD routes; public quotes without Seeds' TSD Bridge key; no key on redirects; approve-mode re-link keeps extra-coin keys
- [ ] Auditor response file

- [x] AI-assistant connections (MCP) at seeds.honest.money/mcp: 7 read-only tools (markets, candles, my account/orders/trades/swaps/P2P listings), Honest.Money sign-in + approval screen, Connected apps + Disconnect in Account → Security (Nov 19)
- [ ] Publish so assistants can reach /mcp and the approval screen on the live site (blocked: Bobby publishes)
- [ ] Decide whether visitors should still be able to read P2P listings' verified balance and order/trade owner ids straight from the database (pre-existing; blocked: Bobby's call)
- [ ] Assistant write tools (place/cancel orders, etc.) — not built; would need Telegram approval like every pocket send (blocked: Bobby asks for them)

- [x] Help section at /help in the top menu: 38 guides in 9 topics, 33-question FAQ, instant search, footer links, sitemap (Nov 19)
- [x] Help pages send stuck members to help.honest.money (Bobby, Nov 19)
- [ ] Fix older pages that disagree with Help: /how-it-works and the homepage intro/step cards still describe the retired in-browser seed vault and email sign-up; /about/kyc says Seeds pays the Ethereum fee on TSD routes, but the shared gas wallet isn't set up (blocked: Bobby's go-ahead)
- [ ] Switch support@honest.money in emails and the Ignite payment page to help.honest.money? (blocked: Bobby's call)

## Seeds' own market history (Nov 19) — Bobby: "much more comprehensive local data than daily or hourly, every 5 minutes, use our own copy as often as possible, get MORE data than less"
- [x] 5-minute history: every THORChain market (price, liquidity, 24h volume/change, halt + mint-pause flags, pool balances, pending inbound, synth supply, Savers depth/units/fill, pool/LP units, RUNE price) + per-chain state (halt flags, gas rate, outbound fee, dust, vault router/address) + network state (planned-out queue, fee constants, hourly node counts) (Nov 19)
- [x] Hourly rollup (open/high/low/close, avg+min liquidity, avg volume) and automatic pruning: 5-minute detail 90 days, rollups 2 years (Nov 19)
- [x] Pages read Seeds' own copy first: the Markets list and homepage price table are served from the newest 5-minute slice when it is under 15 minutes old and covers every market; otherwise they fall back to THORChain. A slice that is stale, incomplete or unreadable is never shown as live (Nov 19)
- [x] History tables and the read function are server-only: no browser, visitor or member can reach them (row-level security with no public policy; function granted to the server role only) (Nov 19)
- [x] Scheduled every 5 minutes (market-snapshot-5min) (Nov 19)
- [ ] History starts filling once the app is published — the schedule calls the live site, so the route must be deployed first (blocked: Bobby publishes)
- [ ] After publishing: confirm rows are landing and the Markets page is being served from Seeds' own copy (blocked: publish)
- [ ] Charts still read candle history from THORChain; once Seeds has its own weeks of 5-minute data, build candles from it so charts survive a THORChain outage too (not built)
- [ ] Maya and DEX pools are still spot-checks only — no history recorded for them yet (not built)

- [x] Seeds AI real buying: beta testers' locked plans buy/sell through the TSD swap route after the owner's OK; members stay on paper (Nov 19)
- [ ] Seeds AI real buying: first real confirmed day with real coins (blocked: Bobby turns it on for his plan and confirms)
- [x] Beta tester group (Nov 19): all admins count as beta testers; admins switch other members on/off in Admin → Admin access
- [x] No limits for beta testers + admins: swap/TSD-swap caps, AI plan size/count caps, PulseChain withdrawal levels + 24h hold (Bobby chose "withdrawals too")
- [x] AI check message in Telegram = one message per check: "you're X, the rule says Y, what would you like to do" + option buttons that execute (within the one-tap limit)
- [x] One-tap Telegram limit: admin default + highest a member can set; members lower any time or raise with a 2FA code (Account → Alerts)
- [ ] Bobby to confirm the $1,000 highest one-tap limit a member can set (agent-chosen)
- [x] AI plans checked every 24 h at the time each was started (not all at 13:00 UTC)
- [ ] Switch the AI plan-check timer from once a day (13:00 UTC) to every minute — right after the next publish (blocked: publish; the live site still runs the old all-plans check)
- [x] AI daily override: when the rule says be in cash (sell to TSD, or stay in TSD), ask "override?" in Telegram and on Seeds; override = keep holding / buy now, clock resets
- [x] AI "Buy now anyway": warn when turning on real buying while the plan says wait in TSD; buy-in resets the clock (rules look forward from the buy day)
- [x] Push Seeds AI live: real buying for beta testers; going to cash leaves TSD unquarantined — a buy-back without enough TSD sends a "deposit more TSD" alert

## Scaling (Nov 19)
- [x] One shared copy of homepage/trade-page market data, TXC node status and reference prices (refreshed every 3–60 s)
- [x] Pocket balances: shared copy (1 min), last good value shown when a chain lookup fails, Refresh asks the chains again
- [x] ISK balances read mempool.iskandercoin.com's address index first (Seeds node as backup); sends still use our node
- [x] Paid THORChain access: Liquify THORNode (LIQUIFY_API_KEY) + Midgard (LIQUIFY_MIDGARD) wired in first
- [ ] Maya partner key (blocked: Bobby emails the Maya team)
- [ ] Launch-day queue for Telegram/email blasts; batch the visit counter
- [ ] Load test at 5k/20k/50k on a test copy (blocked: needs publish + a test copy)


## Withdrawals for every coin (Bobby, Nov 20 2026)
- [x] One rule set for all coins: 2FA + Telegram both on before the wallet link; each withdrawal needs email code + 2FA code + Telegram tap; level limits + cancelable hold
- [x] Seeds sends every coin it can sign (TSD, TXC, ISK, LTC, BTC, ETH, USDC, USDT, BNB, ZCU, HEX, PLS, pHEX, DOGE, BCH, XRP, TRX, SOL); ZEC later (no signer yet)
- [x] PulseChain moves onto the same rules
- [x] Tests, auditor note
- [ ] First small real withdrawal per coin (blocked: Bobby re-links after this publishes, then tries one)
- [x] Open withdrawals to all members (Bobby: everyone now, Nov 20)

## Audit #3 (Nov 20) — built in preview, waiting on the auditor before publishing
- [x] A1 exchange trades: taker pays first, maker's side sent only after that payment is confirmed on its network; vanished/rejected payment → trade on hold + payer's trading frozen (admin lifts in Admin → Accounts); slow payments go to admin without blame
- [ ] A1 first real two-sided exchange trade with the wait (blocked: Bobby tries a small one after publish)
- [x] A2 AI assistants: approval screen + Connected apps say honestly what they can do (abilities unchanged)
- [x] A3/A5/D1/D2 quiet fixes (assistant sign-ins never count as a fresh code; AI tester check; swap approvals bind the coin bought; Peer Pay links only to Seeds; "already have it" network answers treated as maybe-sent, never failed)
- [x] A4 tester withdrawal hold — Bobby: keep no hold (each withdrawal still needs email + 2FA + Telegram)
- [x] A6 confirming an AI trade day on the site above the one-tap limit needs a fresh authenticator code
- [ ] A7 rate limiter rework (later, at load testing); A8 note only
- [x] Auditor follow-up: TXC/ISK servers have the full lookup index (checked live Nov 20)
- [x] Follow-up: resend a dropped payment once before calling it a double-spend (EVM: check if another payment used its slot)
- [x] Follow-up: a frozen trader can't release P2P sales, open P2P trades or swap to outside addresses
- [x] Follow-up: if a TXC/ISK server loses its lookup index, "not found" never blames anyone
- [x] A2 again — Bobby: keep as is (honest wording, abilities unchanged), Nov 20

## Coin & outside-wallet sign-up (Bobby, Nov 21 2026)
- [x] Seeds side: "Start with a coin" / "Use another wallet" sign-in, coin/wallet accounts, pocket-key intake (same format as HME Wallet)
- [x] Join Honest.Money later attaches the membership to the same account
- [x] Withdrawals for coin/wallet accounts need a confirmed email first
- [x] Admin → Users shows how each person signed up
- [x] Build guide + test vectors for the separate Seeds Key page; auditor note
- [ ] Build the Seeds Key page itself (blocked: separate project + its web address; guide provided)
- [x] Seeds Key address = key.seeds.honest.money (Bobby, Nov 21); point the subdomain at the Key page host once built

## Key sign-in auditor review (Nov 21) — built in preview, waiting on the auditor
- [x] K1 wallet-pocket message in the standard Sign-In with Ethereum/Solana layout (Bobby: no Seeds-held secret)
- [x] K2 match code on both screens + "is this your coin?" confirm
- [x] K3 2FA code + Telegram notice when adding an email (Bobby: no 24-hour wait)
- [x] K4 one-true-address wording on sign-in + Help center guide; verifiable-build rules in the Key page guide
- [x] K5 hourly clean-up of day-old sign-in requests; K6 admin alarm at 500 coin/wallet sign-ups an hour; K7 unbiased email code
- [x] K8 test accounts' pocket keys deleted and sign-in blocked
- [ ] Wallet warnings checked in real MetaMask / Rabby / Coinbase Wallet / Phantom (blocked: Seeds Key page must exist first)
- [x] Auditor follow-up (key sign-in): Fix A standard wallet sign-in message, Fix B held key change (auditor's version), burst alarm, Solana sign-in note
- [ ] Real-wallet test: MetaMask shows its look-alike-site warning on both Seeds Key messages (blocked: Key page built + a person with a real wallet)
- [x] TXC sends/settlement read Seeds' own TXC indexer (mempool.texitcoin.org) first when it has caught up with our node; node scan as fallback (no addressindex reindex needed)

## TXC coin-lookup auditor notes (Nov 21) — Bobby: do all four
- [x] Double-check every indexer coin with our own TXC server before it can be spent (size + owner); mismatch → slow full check
- [x] Hard fee cap per send: 0.01 TXC, 0.01 ISK, 0.002 LTC (Bobby, Nov 21; TXC/ISK raised from 0.0001)
- [x] Fast list comes up short → recheck the slow way before "not enough coins"
- [x] TSD sends use the fast checked coin list for their TXC fee coin
- [x] Auditor follow-up (Nov 21): TXC/ISK fee limit 0.0001 → 0.01 (Bobby: yes)
- [x] Auditor follow-up: slow-check coins through the same double-check + tidier batch-reply check (Bobby: yes)
- [ ] One real TXC send and one real TSD send with the new coin double-check before launch (needs a member's Telegram tap)

## Coin / wallet accounts (Bobby, Nov 21)
- [x] Coin/wallet members never forced to join Honest.Money; optional reminders on Overview, Security and Profile (Bobby, Nov 21)
- [x] Coin/wallet account pages: own sign-in check, email step, "Turn on withdrawals" steps, "Sign in again with your coin" instead of HME Wallet re-link (Security, Overview, Withdraw, setup guide, withdrawal messages) (Nov 21)
- [ ] First real coin member walks the withdrawal steps end to end (blocked: Seeds Key page catch-up + auditor + publish)
- [x] Always pocket 1106: HME Wallet links refuse other numbers; coin/wallet sign-ins reuse 1106 after a revoke; wording updated (Nov 22)
- [ ] Seeds Key site: copy the new rules.ts (pocketFor always 1106) (blocked: done in the Seeds Key project, then auditor)
- [ ] Setup guide asks for withdrawal checks (email / two-factor / Telegram) before the wallet step so nobody has to re-link (waiting on Bobby: how many checks, coin re-link approach)
- [ ] Same phrase in HME Wallet and on a coin: decide where a coin sign-in lands once the HME Wallet link is revoked (today it makes a second account) (waiting on Bobby)
