# Auditor review, Nov 23: "confirm it's you" + the AWS Vault key

**Overall:** the auditor passed both. Nothing blocks the Vault team from pinning the new key.
They found four small refinements (S1–S4) and one more AWS alarm to add. I checked each one against the code, and all are accurate.

The zip has the same 19 reports as before plus this new one. Only the new one needs reading.

## S1 — "Fresh sign-in" (Medium) — the one that matters
**Today:** "confirm it's you" accepts any sign-in from the last 15 minutes. A thief with a tab you opened 10 minutes ago passes without doing anything. (Our decisions note said 10 minutes; the code says 15.)
**Auditor's fix:** the sign-in has to happen *after* the thing being approved (after the new coin was scanned, after the new 2FA app was added).
**What it changes for members:**
- Linking a coin or wallet, or unlinking Telegram: one extra sign-in, even if you just signed in. For Honest.Money members that's usually one click.
- **The catch:** the welcome guide sets up 2FA and Telegram right after sign-up. Under the strict version, every new member's 2FA app and Telegram would show "Not confirmed yet" until they sign in a second time. Coin members with no email would have to scan their coin again.
**My suggestion:** strict for linking a pocket, unlinking Telegram and confirming a factor later on. A 2FA app or Telegram added within **10 minutes** of signing in is still trusted straight away, but **only on an account that has no 2FA app or Telegram yet**. A thief can't use that to add their own app to an account that already has one, and new members aren't slowed down.

## S2 — Confirming 2FA apps one at a time (Low)
**Today:** one Confirm button trusts *every* unconfirmed 2FA app at once. If a thief added their app, the member's confirm would trust it too.
**Fix:** a separate Confirm button for each app, showing when it was added, plus a Remove button for unconfirmed apps (no check needed, since removing makes the account safer).
**Impact:** none on normal use. Recommend: do it.

## S3 — Swapping in a new Telegram chat (Low)
**Today:** unlinking Telegram needs "confirm it's you", but connecting a *different* chat doesn't. The new chat can't approve any sends, so no coins can move. But your alerts would go to the thief's chat.
**Options:** (a) require "confirm it's you" before replacing a chat that's already connected (simpler, the auditor's pick), or (b) send the old chat a "This wasn't me" button.
**Impact of (a):** connecting Telegram for the first time is unchanged. Only switching to a different Telegram account gets the extra step. Recommend (a).

## S4 — AWS account number in the public record (Low)
The public key record now names our AWS account number and key number. Two days ago we took the alarm-topic address out of the roadmap for this same reason. The auditor's point is that we should pick one rule and stick to it. Vault only needs the key name, public key and fingerprint.
**Recommend:** take the AWS numbers out of the public record. They stay in your private hand-off note.

## Extra — Alarm on the new key
Add the new Vault key to the AWS alarms, so a burst of signatures (or anyone besides Seeds using it, or anyone changing or deleting it) reaches the Telegram group the same way the pocket-key alarms do. You'd run one more CloudShell script, which I'd write.

## Bug group
This was answered already: staff only, keep the tester's name and the full report. Please pass that to the auditor; they still have it marked as open.

## Still owed (no change)
Live tests once published: linking after a fresh sign-in, linking after a day-old Telegram tap, refused from an old session, a new 2FA app unable to approve a send until confirmed, and a Vault phone scan.
