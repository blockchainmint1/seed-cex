# HME Wallet → Seeds: extra trading pockets (no new chain support needed)

**From:** Seeds (seeds.honest.money) · **Date:** Nov 17 2026 · **Status:** Seeds side built and tested; waiting on HME Wallet

## The short version

Seeds now handles Dogecoin, Bitcoin Cash, Zcash, XRP, TRON and Solana itself: addresses, balances and signing. HME Wallet does **not** need to show, send or understand any of these coins. In an **instant access** link, it only needs to derive a few more pocket keys (one per coin) and include them in the sealed payload it already sends.

Nothing changes for the five pockets you send today (TXC, ISK, BTC, LTC, EVM). Older wallets keep working unchanged.

## What's new in the link manifest

`GET /api/public/hme-link/manifest/{id}` now includes an extra field next to `request`:

```json
"request_optional": [
  { "chain": "DOGE", "path": "m/44'/3'/1106'",     "curve": "secp256k1" },
  { "chain": "BCH",  "path": "m/44'/145'/1106'",   "curve": "secp256k1" },
  { "chain": "ZEC",  "path": "m/44'/133'/1106'",   "curve": "secp256k1" },
  { "chain": "XRP",  "path": "m/44'/144'/1106'",   "curve": "secp256k1" },
  { "chain": "TRX",  "path": "m/44'/195'/1106'",   "curve": "secp256k1" },
  { "chain": "SOL",  "path": "m/44'/501'/1106'/0'", "curve": "ed25519" }
]
```

As with `request`, replace `1106` with the pocket number you're actually using (1106–2105). Every path in one link must use the same pocket number.

## What the wallet sends (instant access only)

For each optional coin you include:

| Field | secp256k1 coins (DOGE, BCH, ZEC, XRP, TRX) | SOL |
|---|---|---|
| `paths[]` | the account path, e.g. `m/44'/3'/1106'` | `m/44'/501'/1106'/0'` |
| `xpubs[chain]` | account xpub (standard `xpub…` version bytes) | base58 32-byte ed25519 public key |
| sealed `xprvs[chain]` | account xprv for the same path | hex 32-byte SLIP-0010 private key at that path |

- The signed delegate message is unchanged. Its `Paths:` line just lists the extra paths too.
- Seeds checks that every private key matches its public half, then stores the keys encrypted, exactly like today.
- **Approve-every-trade links must not include optional coins.** HME Wallet can't sign them, so Seeds refuses with `"<CHAIN> needs instant access"`.
- Revoking and pocket rotation work exactly as today: rotating the pocket number rotates every coin.
- `paths` may now contain up to 11 entries.

Solana note: ed25519 (SLIP-0010) has no public-key derivation, which is why SOL sends a raw key instead of an xpub. Most HD libraries can do this in a few lines (e.g. `micro-key-producer/slip10`, the same library HME Vault already uses).

## Check your derivation with these test values

Recovery phrase `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`, no passphrase, pocket 1106. Receive address = child `0/0` of the account key (SOL: the account key itself).

| Chain | Receive address |
|---|---|
| DOGE | DGd9T3ziwKMXvB4Q5ea9zARewepMc8ER8i |
| BCH | bitcoincash:qrjldu6tua6hu2cafctlymwnp5s4htehc5wq4ejyak |
| ZEC | t1JmSHJ4tmAcXn16tDzT5pasbhMVYm7Aq2v |
| XRP | rJ2grn6pFak4hFP8a7QRiqPQDccxWQYY3x |
| TRX | TGeDLmuvGeJFV6Vc9ggnwX96mHR19avogD |
| SOL | DXTivYcF78Vznitg6f8JGXouZwsm3xioik1LGWj2H1jV |
| (existing) TXC | Tg7WMV1iBgw6w44Z8ZzftiSKPu1yEStXvy |
| (existing) EVM | 0x7231a79714ffD1b9f51216f79762fA38A40b4544 |

## What we're asking HME Wallet to show the user

When optional coins are included, add one line to the link consent screen, for example: *"Also lets Seeds trade from your DOGE, BCH, ZEC, XRP, TRON and Solana trading pockets. HME Wallet doesn't show these coins; you can see and move them on Seeds."* People need to know they won't see these balances inside HME Wallet.

## Why pocket keys instead of the whole seed

With these keys, Seeds can do everything with the trading pockets that it could do with the whole seed. A whole seed would also unlock the person's savings (account 0) and every other pocket, which Seeds never needs. If a seed ever does reach Seeds from elsewhere (HME Vault, typed in, or an operator seed), Seeds derives these same pocket keys and discards the seed immediately, so both routes end up stored the same way.
