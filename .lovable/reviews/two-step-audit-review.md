# Auditor review of the one Swap form + two-step swaps — what it means for Seeds

**Bottom line:** the auditor found no way for an outsider to start, redirect or enlarge a swap, and no way for a member to lose money. Every step still needs your Telegram tap, always pays your own pocket, and step 2 never pays out below the minimum you agreed to. The issues are about a two-step swap getting **mixed up with the member's own other swaps**, which would make the history and the Telegram messages wrong.

I checked each point against our code. Here's my take:

| # | What the auditor found | Is it real? | My recommendation |
|---|---|---|---|
| T1 | A two-step swap finds "its" first send by matching coins and time, not by its own ID. If you start a regular BTC→ETH swap while a BTC→ETH→PEPE two-step is running, the two-step can grab your regular swap as its own. | **Yes, confirmed.** | **Fix it.** Tag every send with the two-step it belongs to. Invisible to members. |
| T1b | Also block other swaps from the same pocket while a two-step is running. | Sensible. | **Yes.** Members wait until the two-step finishes (minutes, sometimes 30+ for slow coins). **Your call — question below.** |
| T2 | Step sends inside a two-step skip the per-swap caps. The caps are only checked once, when the two-step starts. | True, but it's the same design as our TSD swaps, and only beta testers (who have no caps) can use two-step swaps today. | **Don't change it the way they suggest.** Checking the caps again mid-swap would count the same swap twice, and a capped member's swap could **stall halfway with a coin they didn't want**. Instead I'll add a test that fails if two-step swaps ever open beyond beta testers, and we look at caps properly then. |
| T3 | The Telegram approval doesn't re-check the middle coin or the minimum. | Covered: those terms can't be edited after the swap is created. | Nothing to do. Never loosen that lock. |
| T4 | If THORChain doesn't report how much step 1 paid within 30 minutes, step 2 uses the expected amount, capped at the pocket balance. If you already held some of the middle coin (say ETH), step 2 could spend **your own ETH** beyond what step 1 produced. | **Yes, confirmed.** | **Fix it.** Note the middle-coin balance just before step 1, and hand on only what arrived after that. **Your call — question below.** |
| T5 | Always using pocket 1106 means a revoked pocket key comes back when you re-link. | True. It's the trade-off you chose (Nov 21) so coins are never stranded. | Nothing to change. The "is this really you?" hold on key changes is now the main protection, and it's in place. |

**Still owed before publishing (auditor's list, not run yet):** one real swap each way (BTC→PEPE and PEPE→BTC) on a tester pocket, decline/expire/unlink during step 1, a price miss that keeps the middle coin, a crash between sending and saving, and a before/after test of T1.

**Decisions (Nov 22):** T1 fix — yes; block other swaps — no; T4 — only what arrived; T2 — skip + test. Done in preview.
