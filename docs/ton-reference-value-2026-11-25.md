# TON dollar-value correction — auditor handoff

## Rule

Every TON dollar value must describe the actual TON coin, even if a price provider changes its ticker. A different asset with a similar ticker must never supply TON's price. Confirmed quantities and settled records must stay unchanged.

## Reproduction and diagnosis

- Signed in as the project owner and opened Account → Balances, filtered to TON.
- Before: confirmed and available quantity **254.71915799 TON**, Value **—**.
- Live CoinMarketCap `symbol=TON` resolved a case-variant `Ton` entry for an unrelated tokenized stock (ID 39249). Seeds' exact-symbol lookup therefore omitted TON rather than using that stock's price.
- Live CoinMarketCap `id=11419` returned the former Toncoin entry with ticker `GRAM`. The identity is selected by coin ID, not the provider's current ticker.

## Change

- `src/lib/cmc.server.ts` excludes TON from the symbol batch, requests pinned ID **11419** in parallel, verifies the response's ID, and normalizes the reference symbol back to **TON**.
- Positive finite prices only; absent or incorrect ID evidence leaves TON unpriced. No fixed or invented fallback price.
- Requests have a six-second timeout; a failed TON request does not discard other successful reference quotes.
- `src/lib/cmc.functions.ts` uses display cache key `cmc:quotes:v2` so a previously valid but incomplete cached quote set cannot hide this correction.
- `src/routes/swap.tsx` now also uses this normalized TON reference for the send amount's dollar estimate. Native TON has its own side kind, which the previous estimate calculation omitted.
- Existing cache timing, withdrawal protections, transaction builders, permissions, settings, and settled records are unchanged. No migration or balance adjustment.

## Verification

- Signed-in browser after: **254.71915799 TON**, Value **$243.69** at the price fetched during verification. The price is live and will change.
- Confirmed quantity and available quantity stayed identical. No browser runtime errors.
- Signed-in Swap form: selected **50 TON → BTC**, showing **≈ $47.98** and **254.71915799 TON** available in the pocket. No quote was submitted or coins sent.
- Regression tests cover ID 11419, changed provider ticker, refusal of an incorrect returned ID, preservation of other prices when the TON request fails, and existing symbol-keyed cache behavior.
- Full suite: **1,698 tests passed**, zero failed, across 135 files.
- Preview build: **build OK**.
- No funded send, swap, withdrawal, or historical-record update was performed.

## Release

Not published. Independent review is required before publication because the shared reference feed is also read by future withdrawal/swap dollar-limit checks. The final commit ID is supplied with the shareable copy of this note.

## Rest-of-app code review

The following places were read; only the Balances reproduction and the stated browser checks were exercised live. No further wrong-asset TON price lookup was found.

| Place | Result |
| --- | --- |
| Account Overview and Balances, mobile/desktop (`use-pocket.ts`, `account.index.tsx`, `account.balances.index.tsx`) | Shared reference lookup now supplies TON; quantities and totals use confirmed balances. |
| Deposit/Withdraw selectors (`account.balances.deposit.tsx`, `account.balances.withdraw.tsx`) | Same pocket rows; no independent TON identity lookup. |
| Swap form (`swap.tsx`) | Separate native-TON kind previously lacked an input USD estimate; corrected to use the same reference feed. |
| Withdrawal checks and approval details (`withdraw.server.ts`, `SeedsWithdraw.tsx`) | New USD valuations consume the corrected feed; old saved amounts remain unchanged. |
| STON.fi reservations (`ston.server.ts`) | Corrected reference feed, existing checked STON.fi USDt quote fallback unchanged. |
| Trade terminal and settlement terms (`TradeTerminal.tsx`, `autosettle.server.ts`) | Shared normalized reference; no second TON ticker lookup. |
| Relay and multi-step swaps (`relay/rules.ts`, `relay.server.ts`, `hype-chain.server.ts`) | Native chain/currency and execution quotes identify TON independently of CMC tickers; unchanged. |
| STON.fi quotes/history (`ton-usdt.server.ts`, `ton-jetton.ts`, `TonUsdtResult.tsx`, `MySwaps.tsx`) | Pinned native TON/Tether/pool contracts and actual token quantities; unchanged. |
| Research/search (`coin-search.server.ts`, `coin-research.ts`, `coin-research.server.ts`) | Numeric coin IDs, not ticker-based quote identity; upstream metadata can retain its own label. |
| Primary market/history and source AI catalog (`thor-markets.ts`, `thor-markets.server.ts`, `ai/catalog.ts`) | No current TON catalog entry; history uses asset/coin IDs. Live database-managed AI catalog was not inspected. |
| P2P and paused lending (`p2p.server.ts`, `p2p-config.ts`, `loans.server.ts`, `loans/rules.ts`) | Current catalogs do not expose TON valuation; their shared quote consumer gets the correction if later used. No settings changed. |
| Withdrawal/swap jobs (`jobs/pulse-withdrawals.ts`, `jobs/tsd-routes.ts`) | Delegate to the checked engines; no second identity lookup. |
| Market/AI jobs (`jobs/market-snapshot.ts`, `jobs/ai-daily.ts`) | Follow the above catalogs/ID-based histories. |
| SQL reservations (migrations 0050, 0100, 0111, 0112) | Consume server-supplied USD values; no external ticker resolution. Migration definitions read; deployed definitions not queried. |

No settled, sent, paid, refunded, or closed record was edited. No permissions, settings, or example data were changed.