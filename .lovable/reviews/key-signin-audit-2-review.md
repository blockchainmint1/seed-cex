# Auditor follow-up on coin & wallet sign-in (Nov 21) — my review

**Short version:** the auditor checked our K1–K8 fixes and says all eight are done properly. They found one real
problem, and I confirmed it in our code. It only matters for people who sign in with an **outside wallet**
(MetaMask, Phantom and the like). People who start with a **coin** aren't affected. Nothing is live yet, because the
Seeds Key page isn't built, so no member is at risk today and fixing it costs nobody anything.

## 1. The real problem: a fake site could take over a wallet member's Seeds account

**How it works (I checked each step in our code, it's accurate):**
1. A fake "Seeds Key" site asks the member's wallet to sign Seeds' sign-in message. Right now that message is plain
   text, so MetaMask and Phantom **don't warn** that it's the wrong website.
2. The scammer sends that signature to Seeds along with **trading-pocket keys the scammer made up**. Seeds can't tell
   those aren't the member's real keys, because wallet pockets are built from a second signature that never reaches Seeds.
3. Seeds treats it like a normal repeat sign-in. It drops the member's real pocket link, stores the scammer's keys,
   and signs the scammer's browser into the member's account.
4. No email or Telegram message says "your pocket keys were just replaced". There's only the optional "new sign-in"
   alert, and only for members who turned it on.

**What the scammer could and couldn't do:**
- **Couldn't** withdraw coins already in the pocket: withdrawals still need the email code, the 2FA code and the Telegram tap.
- **Could** see the account, place orders and P2P ads, and, worst of all, receive **every future deposit**. The
  member's "deposit" address would now be a scammer-controlled address.

**Fix A, the sign-in message (auditor's fix, I agree):** for wallet sign-ins, write the message in the standard
"Sign-In with Ethereum / Solana" layout, naming key.seeds.honest.money as the only valid site. Wallets then show a
red warning on any look-alike site. Coin sign-ins keep their current message, since the Key page signs those itself.
- *Member impact:* none. Members see a cleaner, standard sign-in prompt.

**Fix B, a sign-in that brings different pocket keys.** The auditor suggests warning the member by Telegram and email,
and asking for a fresh 2FA code when 2FA is on. I'd go **stricter**:
- The same coin or the same wallet **always** produces the same pocket keys. So a real member never shows up with
  different keys. Only a scammer, or broken software, does.
- My recommendation: **refuse** any sign-in that brings different keys than the active pocket link, and alert the
  member (Telegram + email when they have them). The account and its pocket stay exactly as they were.
- Why go further than the auditor: with their version, a member **without** 2FA still loses the pocket. They only get
  told about it afterwards.
- This also protects a rare case: a few "shared-custody" wallets can sign differently each time. With the auditor's
  version, those members would silently get a new, empty pocket and their coins would be stranded in the old one.
  With mine, they're stopped and told to contact support.
- *Member impact:* normal members, none. A member who really wants a fresh pocket can still revoke the old link in
  Account → Security, then sign in again.

## 2. Small fix: the sign-up burst alarm (auditor's K6 note, I agree)
The "500 new accounts in an hour" alarm only fires when the count lands on **exactly** 500, 1,000 and so on. Two
sign-ups finishing at the same moment could jump from 499 to 501 and skip it. The fix is to alarm whenever the count
is 500 or more, at most once every 10 minutes.
- *Member impact:* none (admins only).

## 3. Solana's built-in sign-in button (this is for the Key page, not built yet)
Phantom only warns about look-alike sites when the page uses Solana's built-in **sign-in** request, not the generic
"sign this message" request. My recommendation: the Key page uses the built-in request whenever the wallet supports
it, checks the wallet signed **exactly** Seeds' standard text (so the pocket always comes out the same), and falls
back to the generic request only for wallets that don't support it.
- *Member impact:* Phantom and Solflare members get the warning. Rare older Solana wallets still work, just without it.

## 4. Before publishing (auditor): one real-wallet test
Once the Key page exists, sign both messages with MetaMask on a page at a different address and confirm MetaMask
shows its warning. I can't run MetaMask in my test browser, so this needs a person with a real wallet.

## What I'd skip
Nothing. Every point holds up.

## Decisions (Bobby, Nov 21)
- Fix B: the auditor's version (warn first; fresh authenticator code when two-factor is on), not the stricter refusal.
- Fix A, the alarm fix and the Solana note: yes, all three.
