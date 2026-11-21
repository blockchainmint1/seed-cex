# Auditor review: TEXITcoin coin lookups (Nov 21, 2026)

**Auditor's verdict:** acceptable, with one change before relying on it. No report file needed.

## What the auditor found, checked against our code and the live TEXITcoin server

| # | Finding | Is it real? | Today's risk | Recommendation |
|---|---|---|---|---|
| 1 | If the TXC indexer under-reported a coin's size, the leftover would go to miners as fee (our builder trusts the indexer's coin sizes). | **Yes.** Old-style TXC signatures don't cover the coin's size, so the network would accept it. | Small. Our server refuses any send paying more than 0.10 TXC per 1,000 bytes (confirmed on our node). A normal send is ~230 bytes, so the most a lying indexer could burn is about **0.02 TXC per send**. Bigger sends (many coins) could burn more. The indexer is Bobby's own, so it would have to be broken or hacked. | **Do it.** Before signing, ask our own server about each chosen coin (`gettxout`): it exists, is unspent, and its size and owner match. Any mismatch → use the slow full check instead. Measured: ~0.17 s for all coins in one request. |
| 1b | No fee ceiling of our own in the send builder (EVM sends already have one). | **Yes.** | Covered by the server limit above, but that limit grows with send size. | **Do it.** Hard cap per send. Starting values (agent-chosen, to confirm): TXC 0.05, ISK 0.05, LTC 0.002. Normal fees are ~0.00003. |
| 2 | Coin list and the indexer's height are read separately; a 5-second cached list could be older than the height. | **Yes.** No height header exists today (checked). | With fix 1 in place, the only effect is a false "not enough coins". | **Do it inside Seeds:** if the fast list comes up short, recheck with the slow full check before saying "not enough." Optional later: add a height header on the TXC mempool site (separate project). |
| 3 | TSD sends still use the 10-second full check for their small TXC fee coin. | **Yes.** | None — just slow. | **Do it** with the same double-check, so TSD sends get ~10 s faster. |
| 4 | On-screen balances read the indexer with no height check. | Fine, as the auditor says. | None. | No change. |

## What this would and wouldn't change for members

- Nothing visible except faster TSD sends.
- If the indexer ever disagrees with our server, sends quietly use the slow path. They don't fail.
- A send whose fee would exceed the cap is refused with "network fees are unusually high, nothing was sent."
- No database changes.
