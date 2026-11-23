# Auditor's latest bundle — what's new and what we should do

## What's in the pile (and what you can ignore)

| File | What it is | New? |
|---|---|---|
| seeds-security-reviews-2026-11-22_8.zip | Newest bundle: all 18 reports so far | **Keep this one** |
| seeds-security-reviews-2026-11-22_9.zip | Older copy of the same bundle (17 reports, older bug-tracker report, no Vault report) | Duplicate — ignore |
| seeds-link-key-to-hme-review_1.md | Same as the copy inside the newest zip | **New** |
| seeds-vault-signed-requests-review_1.md | Same as the copy inside the newest zip | **New** |
| seeds-qa-center-sentry-review_1.md | Updated version of a report we already handled; adds a follow-up section | **New part only** |
| "Fetching main for the key-link change" note | The auditor's chat summary of the three above | Summary |

The other 15 reports in the zip were already reviewed and handled earlier.

**The auditor hasn't seen our last two changes yet:** the Coins-in-trades / Seeds Lend fixes and the Cancel all button. Their "still waiting on code" list (Lend L1–L5, Coins in trades C1–C3) is already done — please send them the note `seeds-audit-coins-in-trades-and-lend-fixes-2026-11-22.md` from Files.

---

## 1. Linking a coin or wallet to an Honest.Money account (H1–H3)

**H1 — High. Real, and the auditor's fix has a gap.**
Today, someone who steals a member's logged-in Seeds session could: revoke the HME Wallet link, link *their own* coin or wallet in its place, and approve it on the same screen. From then on the member's deposit addresses and trade winnings would land in the thief's pocket. The member only hears about it afterwards.

The auditor's fix: approval must come from a second channel — a Telegram tap, or a fresh 2FA code — and refuse the link if the member has neither.

**The gap:** if a member has *neither* Telegram nor 2FA set up, the thief can turn on 2FA (or connect their own Telegram) from the stolen session first, then approve with it. Seeds allows that today.

**Our suggested version:**
- Approving a new coin/wallet link needs one of: a Telegram tap from a Telegram chat that was connected **at least 24 hours earlier**, a code from a 2FA app set up **at least 24 hours earlier**, or a one-time code emailed to the member's Honest.Money email address. Brand-new members can still link right away using the email code.
- Revoke stays one click. With the gate above, a revoke on its own can't steer anyone's coins — the worst a thief can do is stop trading — and members need a fast "cut it off" button in an emergency. (The auditor suggested gating revoke too; we think that hurts the honest member more than it stops the thief. Your call.)
- The after-the-fact email gets a "This wasn't me" button that opens a page with one Revoke button (a page, not an instant link, because email scanners click links on their own).

**H2 — Low.** When a new key is waiting for approval, warn the member on Telegram/email *before* it's applied, like sign-in already does. Easy, no downside.

**H3 — Info.** A note for our own change checklist. No member impact.

## 2. HME Vault signed requests (V1–V3)

Nothing has pinned the Vault signing key yet, so changes now are cheap; after Vault apps pin it, changing it means a Vault app update and a long overlap.

**V1 — Medium now, High once pinned.** The key Seeds uses to sign Vault requests is a plain server secret. Anyone who got a copy could make every Vault phone hand them a member's pocket keys, with no record anywhere. Fix: keep the key in AWS like the pocket keys, so every use is logged and alarmed.
- What it costs: you create one new AWS key (I'll give you CloudShell commands), the HME Vault and Seeds Key projects switch to the new key type (they already carry that code for TXC), and the key fingerprint we gave HME Vault (`b81366…`) is replaced with a new one. AWS charges about $0.15 per 10,000 signatures. Seeds signs once per sign-in request, not on every page load, so spam can't run up a bill.
- If we don't: write down who holds the secret, and rotate it on any suspicion.

**V2 — Medium.** A scammer can show someone a real Seeds QR code from a sign-in the scammer started. The defence is the 3-digit pairing code: the Vault must show it with "Compare this with the Seeds tab on your computer — if you didn't just open Seeds yourself, stop." Seeds side: put the code into the shared Vault rules file. Vault side: show it (HME Vault project).

**V3 — Low.** Using a different extra password makes a different wallet and a different, empty Seeds account. Add a line next to the password box on the Seeds Key page: "An extra password makes a different wallet — use the same one every time." (Seeds Key project.)

## 3. Bug tracker follow-up

- Earlier fixes Q1–Q3 confirmed done; the in-house error log passed.
- **Question for you:** new bug reports now post to the Telegram group (-1004268049198) with the tester's name and full report text. If anyone in that group isn't Seeds staff, we should post only the reference number, title and link there.
- Small fix: put an hourly cap on how many *new* error types can be recorded, and clear out empty ones, so nobody can flood the error log.

## Not checked live yet
No real phone scan, Vault link, MetaMask/Ledger link, or the thief-chain test has been run on the live site.
