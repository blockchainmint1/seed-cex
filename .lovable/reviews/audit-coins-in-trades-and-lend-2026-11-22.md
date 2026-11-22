# Auditor reviews: Coins in trades + Seeds Lend (Nov 22)

I checked each finding against the code. Every one I spot-checked is real.

## Part 1. Coins in trades (live for members now)

The auditor says the design is right. Nobody can touch another member's coins or orders. Two problems can **cancel a member's orders for no reason**, so these are the urgent ones.

| # | What goes wrong | My fix | What changes for members |
|---|---|---|---|
| **C1** | Right after Seeds sends a member's coins for a trade or P2P sale, there are a few seconds where the pocket has already dropped but Seeds still counts those coins as promised. If the order watch runs in that gap, it cancels their newest orders and emails them "coins left your pocket outside Seeds". That's false and scary. | Only cancel when the shortfall shows on **two runs in a row** (about 1 minute apart), and stop counting a trade as "promised" once its send is on record. | When someone really moves coins out in HME Wallet, their orders get cancelled about a minute later instead of right away. No false alarms. |
| **C2** | Two requests at the same instant (say a withdrawal and an order) can both pass against the same free coins. Later the trade fails and counts as one of the 3 strikes that pause their orders. | Make the check and the hold happen one at a time per member. | Nothing visible. |
| **C3** | Coins in a withdrawal or swap that's waiting for its codes or Telegram tap still look free, so a member can promise them to an order too. | Add a 4th group, **"Going out"**, next to "In trades" on Balances. | While a withdrawal or swap is waiting for approval, those coins can't go into orders. |
| C4 | The watch checks 30 members a minute. Fine now. With a few thousand members holding orders, each one gets checked about once an hour. | No change now. I'll add it to the roadmap. | Nothing yet. |
| C5 | USDC split across networks (60 on Ethereum + 60 on Base, with 100 promised) can't be sent from either. That's correct, but the message is confusing. | Clearer message: "Your open orders need 100 USDC on a single network." | Better wording. |

## Part 2. Seeds Lend (hidden, no real loans yet)

The auditor found no way for a borrower or lender to take the other's coins. The lockbox code is careful. **One serious bug must be fixed before any real loan.**

| # | What goes wrong | My fix |
|---|---|---|
| **L1 (High)** | A borrower repays. The coins reach the lender, but the step after the send errors. Seeds then marks the loan "unpaid" again, and the next check can **liquidate the borrower's collateral to the same lender**. The borrower pays twice. | Never assume "nothing sent" after an error. Seeds records the transaction before broadcasting it, so it will use that record. Add a test that proves the loan ends "repaid". |
| L5 | Same bug when lending. If funding errors mid-send, the loan gets stuck forever and the collateral stays locked. | Same fix, plus an admin button to return collateral if funding never arrived within a day. |
| **L2** | The page says "no single party, Seeds included, can move a lockbox". In practice Seeds holds both members' pocket keys, so Seeds alone can sign. The code only lets it pay the two members by the stored terms, so this adds no new risk, but the promise isn't true. | Make the page honest: "Seeds can only ever pay the two of you, by the agreed terms." Add an AWS alarm on the lockbox signing key, like the pocket-key alarms (you'd paste one CloudShell command). |
| L3 | A stranger can send 100 tiny coin crumbs to a lockbox. Paying out then needs a fee over the 0.01 TXC cap, so the payout fails forever. | Skip crumbs worth less than their own fee, limit how many go into one payout, and allow a second payout for leftovers. |
| **L4** | Liquidation correctly waits for the price to stay bad for 30 minutes. But the coin split uses **the single latest price**, which could be a one-off spike. CoinMarketCap is also the only price source. | Use a steadier price for the split (your choice below). Add CoinGecko/DexScreener as a second source, alert admins when prices go stale for 15+ minutes, and show lenders the liquidation price and the 30-minute delay before they lend. |
| L6 | The public loan list shows members' internal account numbers. | Show a random offer number instead. Keep the track record. |
| L7 | TSD or other tokens sent to a lockbox get stuck there for good. | Say "TXC only" on the collateral screen. Warn both members if tokens show up. |
| L8 | A recovery loop can resend endlessly on a node setup the exchange already guards against. | Use the same guard. |

## Breaks anything?
No. None of this changes fees, who can trade, or how coins move between members. C1 slows down a real cancellation by about a minute. C3 stops coins from being in two places at once. The Lend changes only affect the hidden /loans page.
