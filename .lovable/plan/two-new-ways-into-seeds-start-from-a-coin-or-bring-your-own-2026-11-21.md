# Two new ways into Seeds: start from a coin, or bring your own wallet

## The idea in one line
Today the only way in is HME sign-in plus an HME Wallet link. Both new paths give Seeds what it gets today, and nothing more: a sign-in proof and the keys to one small trading pocket. Seeds still never sees a recovery phrase.

## Path 1: start from a Cold Storage Coin (the important one)

```text
Event attendee            "Seeds Key" page (separate site)              Seeds
--------------            --------------------------------              -----
taps "Start with a coin" ---------------------------------------------> shows a one-time request
                          opens, phone camera scans the coin's QR
                          works out, on the phone only:
                            - a sign-in signature from the coin
                            - trading-pocket keys (same pocket number
                              HME Wallet would use for that phrase)
                          forgets the phrase, sends only those two ---> checks signature, creates or
                                                                         opens the account, saves the
                                                                         pocket keys (same as HME today)
lands in /account, ready to deposit and trade <------------------------
```

- **The phrase never reaches Seeds.** Scanning happens on a separate, single-purpose page on its own address. It has no ads, no outside scripts and no saved data, and it can be audited on its own. Seeds receives exactly what HME Wallet sends today.
- **The coin is the key.** You need the coin to open the account, and again on any new device or after you sign out. On a device you already used, you stay signed in like you do now.
- **Same pocket rules.** The trading pocket is the same one HME Wallet would use if that phrase were imported later. If someone moves to HME Wallet one day, their coins and history carry over.
- **Joining Honest.Money later.** A coin account works without an HME membership. If the person signs in with Honest.Money later, while signed in with their coin, the membership attaches to the same account. It never matches by email alone, the same rule as today.
- **Coins already loaded with TXC.** The Seeds Key page can offer to move some coins from the coin into the trading pocket. That move happens on the phone, before the phrase is forgotten.

### What a coin account can and can't do at first
- Deposit, trade, swap, P2P and AI plans work the same way. Every send still needs a Telegram tap.
- Withdrawals to outside addresses stay locked until the person adds and confirms an email address in Profile. The withdrawal rules need an email code, plus 2FA and Telegram, and nothing about those rules changes.
- Ignite seats, referrals and other HME-only features still need an Honest.Money membership.

### Risk to accept
Anyone holding the coin, or a photo of its QR, can open the account. That's already true of the money on the coin. The welcome screen will say: treat the coin like cash, and move funds before you give it away.

## Path 2: other wallets (MetaMask, Ledger, Trezor, Phantom, phone wallets)

Outside wallets will never hand over keys, so there are three possible levels:

1. **Sign in with your wallet.** The wallet signs a one-time message and that's the whole login. Seeds already has an unused version of this for MetaMask that can be reused. This is identity only.
2. **Full Seeds account, made from a signature (recommended).** On the same Seeds Key page, the wallet signs one fixed Seeds message. That signature is turned into the trading-pocket keys on the device, and the rest of the flow matches Path 1. The same wallet can rebuild the pocket any time by signing again. dYdX used this pattern for years. It works with MetaMask, Rabby, Coinbase Wallet, Ledger and Trezor (through MetaMask or directly), Phantom, and phone wallets through WalletConnect. Some smart-contract wallets give a different signature every time. The page checks for that by asking for two signatures and turns those wallets away.
3. **Swap straight from your own wallet.** Each trade gets approved in MetaMask or on the Ledger, so Seeds never holds a pocket key. It covers Uniswap-style and THORChain swaps only. The order book, P2P and AI plans need Seeds to sign quickly, so they can't work this way.

Recommendation: build level 2, which includes level 1. Level 3 can come later as a "quick swap" button.

## What gets built where

- **Seeds (this project):** "Start with a coin" and "Use another wallet" choices on the sign-in page. One-time sign-in requests. Signature checks for coins (TXC-style) and wallets (Ethereum, Solana). Accounts that carry a coin or wallet identity instead of an HME member id. The pocket-key intake reuses the existing link format. "Join Honest.Money" attaches a membership later. The email-before-withdrawal gate. Admin → Users shows how each person signed up. Tests for every rule.
- **Seeds Key page (separate project):** camera scan, on-device key work, wallet signing, and optionally moving coins into the pocket. I'll write a complete build guide plus test vectors that you paste into that project, like the HME Wallet handoffs.
- **Auditor:** a review note, because this adds a new way to create accounts and a new source of pocket keys.

## Technical details
- Profiles gain `identity_kind` (hme | coin | wallet) and a uniquely indexed `identity_address`. `hm_member_id` stays the HME key and is attached later only through a proven sign-in on both sides (the same pattern as legacy-claim).
- Sign-in uses a server-issued single-use nonce with a 5-minute expiry. The key page returns `{signature, identity address, sealed pocket payload}` in the existing hm-link-delegate access-mode format (X25519 + HKDF + AES-GCM), with a domain-bound message. Sessions are minted the same way as `/sso`.
- Coin identity uses a fixed non-spending address from the phrase, so pocket rotation (1106→2105) never changes who the person is. Seeds tells the key page which pocket number to use, so a revoked pocket is never reused.
- Pocket seed for the wallet path = HKDF of a deterministic signature over a fixed, domain-bound Seeds message. The two-signature determinism check runs before anything is sent. Phantom uses its ed25519 signMessage.
- Account creation is rate-limited per IP and per day, because anyone can make a phrase. "Genuine coins only" mode (if chosen) checks the coin against the Cold Storage Coins registry.
- The core memory that HME is required changes to: an HME membership or a coin/wallet identity.
