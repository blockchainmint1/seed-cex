# Coin & wallet sign-in — auditor review (Nov 21), what it means for Seeds

The auditor found **no way to take over an existing account**. Everything they flagged is about
the parts Seeds' server can't see. Nothing here is live yet (the Seeds Key page isn't built),
so fixing now costs nothing for members. None of the fixes touch HME sign-in, trading or P2P.

| # | Auditor's point | Do I agree? | What changes for members |
|---|---|---|---|
| **K1 High** | The text a MetaMask/Phantom user signs is the key to their Seeds pocket, and a fake site can ask for the same text | **Yes, fix now.** Once anyone uses it, it can never change | The signing screen switches to the standard "Sign in with Ethereum / Solana" format. MetaMask, Phantom and Rabby then **show a red warning on a fake site**. Same wallet still always rebuilds the same pocket |
| K1 extra | Mix in a secret Seeds keeps, so a stolen signature alone opens nothing | **I recommend skipping** | It would mean members can't rebuild their pocket without Seeds — closer to Seeds holding their money. See question |
| **K2 Med** | Someone who sees your QR (or shows you theirs) could link the wrong coin to the wrong screen | **Yes** | A 3-digit match code shows on both screens, plus "Signed in as Coin Tchb…vXyz — is this your coin?" before the account opens. About 5 extra seconds |
| **K3 Med** | Adding an email to a coin/wallet account needs no 2FA code and no Telegram alert | **Yes** | If 2FA is on, adding an email asks for the code; Telegram gets a notice. Optional 24-hour wait — see question |
| **K4 Med** | Fake copies of the Key page could steal whole coin phrases | **Yes, partly ours** | Seeds always opens the Key page for you; sign-in screen and Help center state the one true address and "never type it, never use a link someone sends you". Build guide: open, verifiable page with a published fingerprint |
| K5 Low | Old sign-in requests are never cleaned up | Yes | None (daily clean-up) |
| K6 Low | Mass account creation by many computers | Yes, alarm only | None. Admins get an alert if more than **500 coin/wallet accounts in an hour** (my number — events may need more). Public stats don't show member counts, so that half doesn't apply |
| K7 Low | Email code very slightly favours low numbers | Yes | None (reuse the withdrawal code generator) |
| K8 Low | Two test accounts in the real database | Checked | Both used random throwaway keys never published; the coin phrase was never saved; neither pocket was funded. I'd revoke their pocket keys and block both sign-ins |

## Why I'd skip the "Seeds-held secret" (K1 extra)
- Today a wallet member can rebuild their pocket anywhere with just their wallet — even if Seeds disappeared.
- With the secret, losing Seeds = losing the way back into the pocket. That makes Seeds a gatekeeper of member money, which we've avoided everywhere else.
- The standard sign-in format plus the warning wallets show covers most of the phishing risk. A fake site could equally ask a member to sign a transaction that empties their main wallet, so the pocket isn't the biggest prize.

## Not verified
- I haven't tested the warnings in real MetaMask/Phantom/Rabby; the build guide will tell the Key page builder to confirm each one before launch.
- Hardware wallets (Ledger/Trezor screens) show the text only — the warning comes from MetaMask in front of them.
