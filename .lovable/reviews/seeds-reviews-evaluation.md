# Seeds — evaluation of the 2026-11-19 review bundle

Bundle: audit #1, lock code review, new-features review, audit #2, deep scan (D1–D8), market-history scaling note.
Evaluated against current main `098c826`. No code changed yet; waiting on owner decisions.

## Important: the bundle reviews older code
The deep scan and handoff were done at `d8207ff`. The audit #2 fixes landed later, in `4adab66` (response: seeds-audit2-response-2026-11-19.md). So these "still open" carry-overs are already closed:

| Item | Status in current code |
|---|---|
| Audit #2 H1 Telegram rebind without 2FA | Fixed — connect/unlink need a fresh code; old chat warned, pending approvals cancelled |
| Audit #2 H2 swap to any typed address | Fixed — outside payouts need 2FA code + Telegram tap |
| Audit #2 H3 legacy withdrawal exports | Removed; wallet_delegations inserts blocked in the database |
| Audit #2 H4 third-party scripts | Scripts only on public info pages (tested allowlist). CSP still not added |
| Audit #2 M1 pilot gates role-only | Fixed — role + fresh admin code |
| Audit #2 M3 /api/public/track unlimited | Fixed — 60/min per connection, 300/session/day |
| New-features: approve-mode relink wipes keys, daily-cap union, gas per-member cap, relink kills routes, issuerFetch redirect | Fixed in 4adab66 |
| Audit #2 M4 limit-order collar | Skipped by owner decision |
| Audit #2 M2 code on every pocket send | Skipped by owner decision (Telegram tap is the second factor) |

Request to auditor: please re-pull at `098c826` or later for the next pass. Help center, MCP and market-history commits are still unaudited.

## New findings — confirmed open in current code

| # | Sev | Confirmed? | Fix | Could it break anything? |
|---|---|---|---|---|
| D1 Peer Pay email link host | Med | Yes — `safeOrigin` accepts any https host (ignite-peer.ts:70) | Emails always use https://seeds.honest.money; payment-return links use an allowlist (live site, preview, localhost in dev) | No. Peer Pay links made in the preview would point at the live site |
| D2 "already sent" answer after fail-over counted as failed | Med | Yes — XRP, Bitcoin, EVM "nonce too low" | Treat those answers as sent using the locally computed txid; widen the "maybe sent" check in swap, TSD route, gas and PulseChain sends | No. Only reached after a first server timed out |
| D3 Names in Telegram messages not escaped | Low | Yes — messages sent as HTML, names inserted raw | Escape member-supplied text only (names, notes), keep Seeds' own bold/code formatting | No, if only user text is escaped. 16 call sites to review |
| D4 Unsubscribe links never expire | Low | Yes | Add issue month; valid 90 days; expired link says "sign in to change email settings" | Old (90+ day) email links stop working — legally fine (US law needs 30 days) |
| D5 Public Peer Pay page can trigger NectarPay checks | Low | Yes | Throttle via the database (updated_at) instead of per-server memory; only re-check when ?paid=1 | No |
| D6 Sell-ad max reveals exact free balance when the pocket covers less than the max | Low | Yes, still true after "funds verified" | Round the shown max down to a coarse step | Needs owner choice of step (see question) |
| D7 Pocket key depth not checked | Low | Yes | Require account-level keys (depth 3, hardened account index) for BIP-44 coins | Could refuse real HME links if HME sends another level — will check existing link records first and refuse only new links |
| D8 Empty NowNodes header; URL keys in logs | Info | Partly (send-io sends empty header) | Omit header when unset; re-check two console.error sites | No |

## Market-history read path (scaling note)
Confirmed: `storedRows()` runs the 24-hour aggregation RPC with no cache, twice per request (thor-markets.server.ts:225 and :236).
Fixes 1 (30 s cache, call once) and 2 (precomputed latest row written by the 5-minute job) are safe and match the scaling plan given to the owner. Fix 3 (edge-cached public route) is also safe for this public data.
Also agreed: in-memory-first rate limiter; capacity model; load test on a copy of the site.

## Lock code review B1–B4
Valid. The lock code is not used anywhere yet (no page or job calls it), so there is no live risk. Recommend fixing B1–B4 and the "should fix" list before HME Wallet's lock signing arrives, plus the pending member-only refund test. Remove test rows (zero-UUID locks) after the refund test.

## Gap the bundle does not mention
Exchange trades are marked "settled" when the coins are broadcast (0 confirmations), and a payment the chain later rejects is not acted on. A member could approve in Telegram and then race the same coins out of their pocket. Proposed interim fix (pending owner decision): settled only after 2 confirmations (TXC/TSD) / 3 (EVM); a rejected leg opens a dispute and freezes the payer's trading. Same check for P2P releases.

## On adding these reports to the public repo
The repository is public. Committing reports that describe open weaknesses before they are fixed tells attackers where to look. Recommend committing them under docs/security/ once the listed items are fixed.
