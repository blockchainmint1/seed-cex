# Auditor's Nov 23 note: what's new and what needs your call

## The good news
- **Everything we shipped last round passed.** The Coins-in-trades fixes (C1, C2, C3, C5), the lending switch-off and the stuck-repayment fix (L1, L5), the **Cancel all** button and the tidier Balances table. No new problems.
- **The zip is the same 18 reports as before.** Three of them gained a short "checked and correct" section, and that's the only change. The loose review file is the same as the copy inside the zip.

## New, small
- **C2 note.** When two requests from the same member arrive together, Seeds now handles them one at a time and holds a 60-second "one at a time" hold. If a coin server is ever slow enough that a check takes longer than 60 seconds, the next request could slip in. The auditor's fix is to **write it to our error log whenever a check runs longer than 60 seconds**, so we find out if that ever happens. It only adds a log entry, so members won't notice anything.
- **For the future BTC/ETH lending rebuild.** I've put the auditor's checklist on our task list. Nothing to do while lending is off.

## The big one: someone who steals a member's open Seeds tab (H1)
**The risk, in plain terms.** Someone who steals an Honest.Money member's open Seeds sign-in could swap in their own coin or wallet as that member's trading pocket. After that, the member's deposits and trade winnings would land with the thief.

**What the auditor now agrees with.** They accepted our version. Approving a new coin or wallet link needs something the thief doesn't have:
1. **A fresh sign-in within the last 10 minutes.** The auditor's top pick. For Honest.Money members that's signing in to Honest.Money again. For coin and wallet members it's scanning or signing with their own coin or wallet again. The thief has the open Seeds tab, but not the password or the coin.
2. A Telegram tap from a chat connected **at least 24 hours earlier**.
3. A code from a 2FA app set up **at least 24 hours earlier**.
4. A one-time code emailed to the member's Honest.Money email.

Revoke stays a single click, and the auditor agreed. The "This wasn't me" button in the email opens a page with a Revoke button and doesn't act on its own, and they agreed with that too.

**What the auditor added (H1b).** A thief could turn on a 2FA app or connect their own Telegram on day one, wait a day, and then use it. So a new 2FA app or Telegram chat should only count for approvals once the member confirms it with option 1, 2, 3 or 4 above. The member also gets a notice that it was added.

**How we'd do it without locking honest people out.** Today, 2FA setup happens straight with the sign-in service, so Seeds can't put a gate in front of the setup itself. What Seeds *can* do is decide which 2FA apps and Telegram chats it **trusts**:
- Anything a member already has today stays trusted. The attack needs a new one.
- A new 2FA app or Telegram chat is trusted right away when it's added within 10 minutes of a fresh sign-in. That covers first-time setup in the welcome guide, since the member just signed in.
- Otherwise Account → Security shows it as **"Not confirmed yet"**, with a Confirm button that offers a fresh sign-in or an email code.
- The member gets an email and a Telegram message whenever one is added or removed.

**Effect on members.** Most members won't notice. They set things up right after signing in. A member who adds 2FA weeks later from an old tab gets asked to sign in again, which takes one click on Honest.Money. Nobody gets locked out, because a fresh sign-in always works.

**Effect on withdrawals.** None. The current rules stay: the link must be newer than the 2FA app and the Telegram chat, plus an email code, a 2FA code and a Telegram tap on every withdrawal.

## Still waiting from last time
- **V1:** move the Vault request-signing key into AWS like the pocket keys. It's cheap to do now, before any Vault app is set to expect our current key; after that, changing it is hard.
- **Bug group:** is everyone in the Telegram bug group Seeds staff? If not, we'd post only the report number, title and link there.
- **Small fixes:** H2, a warning *before* a held key is applied; the error-log flood cap; and now the C2 slow-check log.

## Not tested live yet
No real phone scan, Vault link, MetaMask/Ledger link, or end-to-end test of the stolen-tab chain on the live site.
