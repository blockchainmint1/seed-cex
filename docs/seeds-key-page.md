# Seeds Key page — build guide

The Seeds Key page is a **small separate website** that lets people open a Seeds account with
**a Cold Storage Coin** (by scanning the recovery-phrase QR) or **their own wallet** (MetaMask,
Rabby, Coinbase Wallet, Ledger and Trezor through those wallets, Phantom, and phone wallets through
WalletConnect).

It exists so **Seeds never sees a recovery phrase**. The page turns the phrase or the wallet's
signature into two things on the device, then forgets everything else:

1. a **sign-in signature** that proves who is signing in, and
2. the keys to **one trading pocket** (pocket 1106 and up), sealed so only Seeds can open them.
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
  look-alike site could hand the page its own manifest and collect pocket keys.
- Show the site name from the manifest (`app_name`, `origin`) before anything is signed.
- Keep it tiny: two screens (coin, wallet), one success screen.

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
  "expires_at": "…", "submit_url": "https://seeds.honest.money/api/public/key-signin/submit",
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
| `coinIdentityKey(words)` | private key of TXC `m/44'/696969'/0'/0/0` (the coin's sign-in key — the same address HME Wallet signs links with) |
| `signTxcMessage(key, message)` | Bitcoin-style signed message → `{ address, signature }` (base64) |
| `walletPocketWords(signature, host)` | turns a wallet's signature over `walletPocketMessage(host)` into a 24-word pocket phrase |
| `buildHandoff({ manifest, words, kind, identity, account? })` | derives every pocket key, seals them, and returns `{ message, body }` ready to sign and POST |

## Coin flow (`kind=coin`)

1. Camera scan. A Cold Storage Coin's QR holds the 12- or 24-word phrase as plain text (also accept
   SeedQR "standard" digit form if you like). Validate with BIP-39; never show the words on screen.
2. `key = coinIdentityKey(words)`, `identity = signTxcMessage(key, "x").address`.
3. `h = await buildHandoff({ manifest, words, kind: "coin", identity })`.
4. `{ signature } = signTxcMessage(key, h.message)`.
5. `POST manifest.submit_url` with `{ ...h.body, message: h.message, signature }`.
6. If the answer is `409 { error: "use_pocket", account: N }`, repeat steps 3–5 with `account: N`.
   This happens when the person revoked Seeds' access before, so Seeds uses the next pocket and
   never reuses old keys.
7. On `200`: wipe `words` and `key`, then show "You're signed in on Seeds". The Seeds tab that
   started it signs itself in within ~2 seconds. If this page was opened in that same tab, send the
   person back to `manifest.origin + "/key-signin?kind=coin"`.

*(Later, optional: offer to move some TXC from the coin's own address into the trading pocket
before wiping. The Seeds side doesn't need any change for that.)*

## Outside-wallet flow (`kind=wallet`)

1. Connect: EIP-1193 (`window.ethereum`) for browser wallets including Ledger/Trezor inside
   MetaMask, WalletConnect v2 for phone wallets, `window.phantom.solana` for Phantom.
2. Ask for **two** signatures of `walletPocketMessage(location.host)`. EVM uses `personal_sign`;
   Solana uses `signMessage` (UTF-8 bytes). **If the two signatures differ, stop**: smart-contract
   and passkey wallets can't rebuild the same pocket, so explain that and offer the coin route or
   HME Wallet instead.
3. `words = walletPocketWords(signatureBytes, location.host)`. EVM: the 65 signature bytes. Solana:
   the 64 bytes.
4. `identity` = the wallet address (EVM `0x…`, Solana base58). `kind` = `"evm"` or `"sol"`.
5. `h = await buildHandoff({ manifest, words, kind, identity })`. Then sign `h.message` with the
   wallet (third prompt): EVM → `personal_sign`, hex signature; Solana → `signMessage`, hex or
   base58 signature.
6. POST, then handle `use_pocket` and success the same way as the coin flow.

The pocket depends on the Seeds Key site's **host name**. Never change the host once people use it,
or their wallets will rebuild a different (empty) pocket. If you ever must move, keep the old host
working as a recovery page.

## Submit endpoint answers

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `{ signed_in: true, new_account, pocket }` | Done |
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

Outside wallet. EVM private key `4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318`,
`personal_sign(walletPocketMessage("key.example"))` =
`0x974236d70f173f89e79c18ef8695f55923b95377e4831b0ce902e8f28b407fb144a55c70ecd32f4c9945c7759e04da2d89f538d317efbc49386abbde0d02c5591c`
→ `walletPocketWords(…, "key.example")` =
`recall oil illness fancy announce curtain kiwi body certain blouse drill shock diary purchase fortune arrest police neutral define trash degree tourist adapt scissors`.

Seeds' own tests (`src/lib/key-signin/handoff.test.ts`) check these values and that Seeds' server
opens what `buildHandoff` seals.

## Switching it on in Seeds

The Seeds Key page's permanent home is **`https://key.seeds.honest.money`** — chosen November 21,
2026. This address can never change once members use it: outside-wallet pockets are rebuilt from a
signature of a message naming this host, so moving the page would strand their coins. Seeds' server
secret `SEEDS_KEY_URL` is already set to it. The "Start with a coin" page links there as soon as the
secret is present; until the page itself is deployed at that address, the link leads nowhere, so
deploy the page before announcing the feature.
