# Seeds Key page — build guide

The Seeds Key page is a **small separate website** that lets people open a Seeds account with
**a Cold Storage Coin** (by scanning the recovery-phrase QR) or **their own wallet** (MetaMask,
Rabby, Coinbase Wallet, Ledger and Trezor through those wallets, Phantom, and phone wallets through
WalletConnect).

It exists so **Seeds never sees a recovery phrase**. The page turns the phrase or the wallet's
signature into two things on the device, then forgets everything else:

1. a **sign-in signature** that proves who is signing in, and
2. the keys to **one trading pocket** (always pocket 1106, also after a revoke), sealed so only Seeds can open them.
   This is exactly the "instant access" payload HME Wallet sends today.

Seeds' side is already built and tested (`src/lib/key-signin/` in the Seeds project). This guide
covers the other side.

---

## Hard rules for the Seeds Key project

- **Never send, store or log the phrase**, not even in localStorage, IndexedDB, analytics or error
  reports. Wipe phrase strings and byte arrays as soon as the hand-off is done.
- **No third-party scripts**: no analytics, no chat widgets, no ad tags, no CDN-hosted JS. Use a
  strict Content-Security-Policy:
  `default-src 'self'; connect-src 'self' https://seeds.honest.money wss://relay.walletconnect.org https://*.walletconnect.org; img-src 'self' data:; frame-ancestors 'none'`
  (drop the WalletConnect hosts if you skip phone wallets).
- **Only talk to Seeds.** Accept a manifest URL (`r=`) only when its origin is on this list:
  `https://seeds.honest.money` and the Seeds preview (`https://id-preview--0ce4bcf5-5883-4de0-96d3-b161585d1bf4.lovable.app`).
  The manifest's `submit_url` must have the same origin as the manifest URL. Without this, a
  look-alike site could hand the page its own manifest and collect pocket keys. This check is
  code, not just text: call `manifestProblem(r, manifest)` from the reference before showing
  anything, and `buildHandoff` refuses on its own when it fails. After the POST, reload the page
  so key material leaves memory (JavaScript can't wipe strings).
- Show the site name from the manifest (`app_name`, `origin`) before anything is signed.
- **Show the match code first.** Before scanning or signing, show `pairingCode(manifest.challenge)`
  (also sent as `manifest.pairing_code`; they must agree) in large digits with: *"Your Seeds screen
  shows a match code. Only continue if it's the same three digits. If you didn't start this on your
  own Seeds screen, stop."* — and a **Continue** button. This stops a stranger's QR (or a QR seen over
  someone's shoulder) joining the wrong coin to the wrong screen.
- **Show who is signing in** after the scan / wallet connect: `shortKeyName(kind, identity)` (for
  example `Coin TZZC…xsVd`). The Seeds tab shows the same name and asks the member to confirm it.
- If submit answers `409 already used` or `410 expired`, say: *"This sign-in was already used or ran
  out. If you didn't finish it yourself, someone else may have used your code — on Seeds, tap
  "No, that's not mine" and start again."*
- Keep it tiny: two screens (coin, wallet), one success screen.

## Make the page checkable (auditor finding K4)

Members are trusting this page with a whole recovery phrase, so "Seeds never sees the phrase" must
be checkable, not just promised:

- Static site only (no server code), built reproducibly from a public repository.
- Publish the SHA-256 of every built file (and the git commit) on the page's own "About" screen and
  in the repository's README. Anyone can rebuild and compare.
- Subresource Integrity (`integrity="sha384-…"`) on every script and stylesheet tag.
- Never offer to *generate* a new phrase for people without a coin — that would be a new custody
  product and needs its own review.
- Seeds always opens this page itself (button or QR); members are told never to type the address.

## Entry point

Seeds opens (or shows as a QR) a link like this:

```text
https://key.seeds.honest.money/?kind=coin&r=https%3A%2F%2Fseeds.honest.money%2Fapi%2Fpublic%2Fkey-signin%2Fmanifest%2F<id>
```

- `kind` is `coin` or `wallet`.
- `r` is the manifest URL. Validate it with the allow-list above, then `GET` it (CORS is open).

Manifest (`GET`, 404 when expired or used):

```json
{
  "type": "seeds-key-signin", "version": 1, "app_name": "Seeds Exchange",
  "origin": "https://seeds.honest.money", "domain": "seeds.honest.money",
  "challenge_id": "…", "challenge": "…", "recipient_pubkey": "<X25519, base64url>",
  "key_host": "key.seeds.honest.money", "issued_at": "…", "expires_at": "…",
  "submit_url": "https://seeds.honest.money/api/public/key-signin/submit",
  "kinds": ["coin", "evm", "sol"], "pocket": 1106,
  "request": [{ "chain": "TXC", "path": "m/44'/696969'/1106'", "curve": "secp256k1", "format": "bip32" }, "…"],
  "request_optional": ["…DOGE, BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA, XMR…"]
}
```

## Code to copy from Seeds (exact files, unchanged)

```text
src/lib/pockets/coins.ts  encode.ts  slip10.ts  cardano.ts  monero.ts  derive.ts
src/lib/key-signin/rules.ts
src/lib/key-signin/seeds-key-reference.ts
```

Dependencies: `@noble/curves@2.2.0`, `@noble/hashes@^2.2.0`, `@scure/base@^2.2.0`,
`@scure/bip32@^2.2.0`, `@scure/bip39@^2.2.0`. Keep the import paths the same (`../pockets/…`) so
updates copy straight across.

`seeds-key-reference.ts` exports everything you need:

| Function | What it does |
| --- | --- |
| `coinIdentityKey(words, passphrase = "")` | private key of TXC `m/44'/696969'/0'/0/0` (the coin's sign-in key — the same address HME Wallet signs links with). `passphrase` = optional BIP39 extra password, NFKD-normalised via `seedPassphrase`; `""` = none |
| `signTxcMessage(key, message)` | Bitcoin-style signed message → `{ address, signature }` (base64) |
| `walletPocketWords(signature, host)` | turns a wallet's signature over `walletPocketMessage(host, kind, address)` into a 24-word pocket phrase |
| `pairingCode(challenge)` (rules.ts) | the three-digit match code the Seeds tab also shows |
| `shortKeyName(kind, identity)` (rules.ts) | the short name both screens show, e.g. `Coin TZZC…xsVd` |
| `buildHandoff({ manifestUrl, manifest, words, kind, identity, account?, passphrase? })` | derives every pocket key, seals them, and returns `{ message, body }` ready to sign and POST. Pass the **same** `passphrase` as `coinIdentityKey`; it is never sent |

## Coin flow (`kind=coin`)

1. Camera scan. A Cold Storage Coin's QR holds the 12- or 24-word phrase as plain text (also accept
   SeedQR "standard" digit form if you like). Validate with BIP-39; never show the words on screen.
2. `key = coinIdentityKey(words)`, `identity = signTxcMessage(key, "x").address`.
3. `h = await buildHandoff({ manifestUrl: r, manifest, words, kind: "coin", identity })`.
4. `{ signature } = signTxcMessage(key, h.message)`.
5. `POST manifest.submit_url` with `{ ...h.body, message: h.message, signature }`.
6. If the answer is `409 { error: "use_pocket", account: N }`, repeat steps 3–5 with `account: N`.
   Seeds always uses pocket 1106, so this should never happen; keep it only as a defensive retry
   with the number Seeds returns.
7. On `200`: wipe `words` and `key`, then show "You're signed in on Seeds". The Seeds tab that
   started it signs itself in within ~2 seconds. If this page was opened in that same tab, send the
   person back to `manifest.origin + "/key-signin?kind=coin"`.

*(Later, optional: offer to move some TXC from the coin's own address into the trading pocket
before wiping. The Seeds side doesn't need any change for that.)*

## Outside-wallet flow (`kind=wallet`)

1. Connect: EIP-1193 (`window.ethereum`) for browser wallets including Ledger/Trezor inside
   MetaMask, WalletConnect v2 for phone wallets, `window.phantom.solana` for Phantom.
2. `identity` = the wallet address (EVM `0x…`, Solana base58). `kind` = `"evm"` or `"sol"`.
   Ask for **two** signatures of `walletPocketMessage(location.host, kind, identity)`. **If the two
   signatures differ, stop**: smart-contract, passkey and shared-custody (MPC) wallets can't rebuild
   the same pocket, so explain that and offer the coin route or HME Wallet instead.
   The message is in the standard **Sign-In with Ethereum (EIP-4361) / Sign-In with Solana**
   layout with every field fixed (fixed nonce, fixed issued-at), so it never changes for a wallet.
   Wallets that understand the layout warn the member when the site asking isn't
   `key.seeds.honest.money` — that warning is the protection against look-alike sites (auditor K1).
   - **EVM:** `personal_sign` of the UTF-8 text.
   - **Solana (auditor follow-up):** Phantom and Solflare only check the site for their built-in
     **sign-in** request, not for `signMessage`. So when the wallet offers it (Wallet Standard
     `solana:signIn`, or `window.phantom.solana.signIn`), call it with the message's own fields —
     `domain`, `address`, `statement`, `uri`, `version: "1"`, `chainId: "mainnet"`, `nonce`,
     `issuedAt` (and `expirationTime` / `resources` when the message has them) — then **check that
     the returned `signedMessage` bytes equal the UTF-8 of Seeds' message exactly**. If they don't,
     stop and use `signMessage` instead (a wallet that formats differently must not produce a
     different pocket). Wallets without `signIn` use `signMessage`; for those, show a line asking the
     member to check the address bar says `key.seeds.honest.money` before signing.
   **Before launch, confirm in MetaMask, Rabby, Coinbase Wallet and Phantom that the real page
   shows a normal sign-in request and a page on another host shows the mismatch warning.**
3. `words = walletPocketWords(signatureBytes, location.host)`. EVM: the 65 signature bytes. Solana:
   the 64 bytes.
4. Show `shortKeyName(kind, identity)` so the member can compare it with the Seeds tab.
5. `h = await buildHandoff({ manifest, words, kind, identity })`. `h.message` is also in the
   Sign-In with Ethereum / Solana layout (domain = `manifest.key_host`, nonce = the one-time
   challenge, issued-at / expiration = the request's times, pocket, paths and payload hash listed
   under `Resources`), so wallets warn on a look-alike page at this step too. Sign it with the wallet
   (third prompt) exactly like step 2: EVM → `personal_sign`, hex signature; Solana → `signIn` with
   the byte-for-byte check, else `signMessage`; hex or base58 signature.
6. POST, then handle `use_pocket` and success the same way as the coin flow. If the answer has
   `needs_confirm: true`, say: "Finish on the Seeds screen — it will ask you to confirm replacing your
   pocket keys." (see below).

The pocket depends on the Seeds Key site's **host name**. Never change the host once people use it,
or their wallets will rebuild a different (empty) pocket. If you ever must move, keep the old host
working as a recovery page.

## Submit endpoint answers

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `{ signed_in: true, new_account, pocket }` | Done |
| 200 | `{ signed_in: false, needs_confirm: true, pocket }` | This sign-in brought **different** pocket keys than the member's active link. Nothing changed yet: the member was told on Telegram/email, and the Seeds screen must approve (with an authenticator code when they use two-factor) |
| 503 | `{ error: "Wallet sign-in isn't switched on yet." }` | Seeds has no Seeds Key address configured |
| 409 | `{ error: "use_pocket", account }` | Derive again on that pocket number |
| 409 | `{ error: "This key is already linked to an Honest.Money account…" }` | This phrase is already an HME member's linked pocket. They should sign in with Honest.Money |
| 410 | `{ error: "expired" }` | Start again on Seeds (requests last 10 minutes and work once) |
| 400 | `{ error: "message mismatch", expected }` | The signed text differs; `expected` shows Seeds' version |
| 401 | `{ error: "bad signature" }` | The signature doesn't match the identity |
| 429 | Too many new accounts from this network this hour | |

## Test vectors (must match exactly)

Phrase: `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`

| What | Value |
| --- | --- |
| Coin identity (TXC `m/44'/696969'/0'/0/0`) | `TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd` |
| Pocket 1106 TXC receive | `Tg7WMV1iBgw6w44Z8ZzftiSKPu1yEStXvy` |
| Pocket 1106 ISK receive | `KC4qNWsaf9soCJSmzNXjjWDcYwbedST1ht` |
| Pocket 1106 BTC receive | `bc1q49kxnqa4uuh2ej0k6ys2vrd26nq338pwaf3r30` |
| Pocket 1106 LTC receive | `LdydRYQJ1fQ4vwpqYn1tUzfLzdfQxZS6cP` |
| Pocket 1106 EVM receive | `0x7231a79714ffD1b9f51216f79762fA38A40b4544` |
| Pocket 1106 SOL | `DXTivYcF78Vznitg6f8JGXouZwsm3xioik1LGWj2H1jV` |

Outside wallet. EVM private key `4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318`
(address `0x2c7536E3605D9C16a7a3D7b1898e529396a65c23`),
`personal_sign(walletPocketMessage("key.example", "evm", address))` =
`0xfb124074c5b142a7fd343341e1b7b0daab2d21761635b82c52e43dbaf9d6d88709a5754319c0595ec99cf2d791c3ee3e02786934a05147f1c79866f3cde4a4511c`
→ `walletPocketWords(…, "key.example")` =
`educate unveil nation talent turtle mother satisfy diesel nerve huge riot disorder video belt romance caught morning escape canoe top crystal various real same`.

The real message for that wallet on the live host reads exactly:

```text
key.seeds.honest.money wants you to sign in with your Ethereum account:
0x2c7536E3605D9C16a7a3D7b1898e529396a65c23

Open my Seeds trading pocket. Only sign this on key.seeds.honest.money: anyone with this signature can open that pocket. It moves no coins from this wallet.

URI: https://key.seeds.honest.money
Version: 1
Chain ID: 1
Nonce: SeedsPocket2
Issued At: 2026-11-21T00:00:00.000Z
```

(Checked with the official `siwe` parser: it parses, round-trips byte-for-byte and verifies.)
Match code: `pairingCode("c".repeat(48))` = `673`.

Seeds' own tests (`src/lib/key-signin/handoff.test.ts`) check these values and that Seeds' server
opens what `buildHandoff` seals.

## Switching it on in Seeds

The Seeds Key page's permanent home is **`https://key.seeds.honest.money`** — chosen November 21,
2026. This address can never change once members use it: outside-wallet pockets are rebuilt from a
signature of a message naming this host, so moving the page would strand their coins. Seeds' server
secret `SEEDS_KEY_URL` is already set to it. The "Start with a coin" page links there as soon as the
secret is present; until the page itself is deployed at that address, the link leads nowhere, so
deploy the page before announcing the feature.

The wallet message's fixed fields (`WALLET_POCKET_NONCE`, `WALLET_POCKET_ISSUED_AT`, the statement,
the HKDF label `seeds-key wallet pocket v2`) are permanent for the same reason. Version 1 of the
message was never used by any member.

## Link mode (Nov 22 2026) — no Seeds Key change needed

A member already signed in with Honest.Money can link a coin, HME Vault or outside wallet as their trading pocket.
Seeds starts the same request and manifest; the Key page does exactly what it does for a sign-in. The submit reply
for a new key is `{ signed_in: false, needs_confirm: true }` (same as a held key change): show "Finish on your Seeds
screen". The same key again replies `{ signed_in: true }`. Refusals come back as a 409 `error` string to show as-is.
