# Auditor review: miner check & classes — what it means for us

**Bottom line:** the auditor found nothing serious. The miner check is cleared to go live. None of the six notes would break anything we do today.

| # | What they found | Does it matter? | My recommendation |
|---|---|---|---|
| **K1** | If Honest.Money's miner check breaks (key revoked, outage), we quietly charge miners the full $99 and nobody notices. We also remember an "unknown" answer for 5 minutes. | **Yes.** Spark just opened, so a quiet failure would mean real miners overpaying. | **Fix.** Record failed checks in our own error log (at most one entry every few minutes), stop remembering "unknown", and show "last good miner check" on the class admin page. |
| **K2** | One Honest.Money key does three jobs. They want Honest.Money to confirm it rejects replayed requests. | Only Honest.Money can answer the replay question. | **Ask Honest.Money.** I'll write a short note you can forward. Give the miner check its own key later, if they offer one. |
| **K3** | Two notes and an old database file name a member's Honest.Money username (the Ignite customer whose email was missed). The code is public. | **Yes, privacy.** It's an easy cleanup. | **Fix.** Replace it with "one member" everywhere. |
| **K4** | An admin can move a paid seat into a full, draft or finished class. | Low risk, since only admins can do it, but it's an easy mistake (for example, moving someone into the full Ignite class). | **Fix.** Block moves into a full or finished class. Moving into a draft class asks "are you sure?". |
| **K5** | Anyone can add someone else's email to the "tell me about new classes" list. | Harmless while a person picks every mailing, and every email has an unsubscribe link. | **Skip for now.** Add a confirmation email before we ever send to the list automatically. |
| **K6** | The affiliates page will slow down at 50,000 members. | Not today. | **Skip for now.** It goes on the "watch at 50k" list. |

**Already done from their go-live list:** Honest.Money turned on mining permission, and the real test member reads as a miner. The sign-up screen already says "we couldn't confirm mining hash power" when the check can't answer.

**One thing I noticed myself:** until ISK's mining site is connected, every *non*-miner also sees that "couldn't confirm" message, with a nudge to email support. That could bring in some needless support emails. I can soften the wording while I'm in there.
