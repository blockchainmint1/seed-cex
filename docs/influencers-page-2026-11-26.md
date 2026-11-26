# Seeds influencer page — auditor handoff

## Scope
Public `/influencers` page, linked in ABOUT/mobile navigation and footer. Branded Genesis artwork reused from the existing project pointer. Per-route metadata and explicit sitemap inclusion. No new database schema, account permissions, signer, reward calculation, payout, competition engine or external script.

## Content checks
- Explains limited own-pocket access, no Seeds trading/deposit/withdrawal fees, network and third-party costs, on-chain delays, no HFT, no leverage products, variable liquidity and recovery/software/provider risks.
- Avoids an absolute safety or no-rug guarantee. Links to code and risk disclosures.
- Bobby confirmed rewards are agreed individually. No invented rates, automatic payouts or reward balance.
- Community competitions, prizes/rankings and cryptoU.ai integration are clearly planned, not connected or enrolling. AI real buying is disclosed as tester-only.
- Competition provider restrictions remain intact; this page does not enable contests or use SwapKit for them.
- Suggested incentives (welcome sessions, transparent strategy reviews, office hours, creator kit) are proposals, not delivered entitlements.

## Affiliate-link access
New `InfluencerInvite` client component uses existing getMyInvite only after a signed-in identity is present. Query cache key includes identity. No signed-out protected call or public loader call. Existing server authentication and per-owner referral logic remain unchanged. Signed-out CTA remembers `/influencers#your-link`. No invented URL or referral code; real link is returned by the existing ecosystem service. Existing link directs referred users through Honest.Money to To the Moon, disclosed on the page. Copy failures are visible and text remains selectable. Results/QR link opens existing Account → Referrals.

## Validation
- Browser: public desktop and 390×844 mobile, no horizontal overflow or page errors; screenshots inspected.
- Browser as owner: real `https://seeds.honest.money/invite/mineTXC` copied; referral results opened at `/account/referrals`.
- Existing referral/privacy and return-path tests: 33 passing, zero failing. Preview build OK.
- Honest.Money `/api` guidance fetched and checked; no sign-in changes. No accessible owned cryptoU project found, so no integration represented as functional.
- Root AGENTS.md at size budget; structural note omitted per budget rule.

Independent review required before publishing. Delivery copy includes the exact latest code commit.