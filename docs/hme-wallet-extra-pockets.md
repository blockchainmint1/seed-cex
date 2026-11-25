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

Every path uses pocket **1106**, always — also after a revoke. Seeds refuses any other pocket number (since Nov 22 2026).

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
- Revoking works as today. There is no pocket rotation any more: a new link after a revoke uses 1106 again and must hand over every coin.
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

---

## Nov 18 2026 update: five more coins, and how new chains get added from now on

Seeds now lists and accepts **Dash, Cosmos (ATOM), THORChain (RUNE), Cardano (ADA) and Monero (XMR)** as well. That's 11 optional coins, and `paths` may now contain up to 16 entries. Each `request_optional` entry now also has a `format` field naming the exact key method:

| chain | path (pocket 1106) | curve | format | public half (`xpubs[chain]`) | private half (sealed `xprvs[chain]`) |
|---|---|---|---|---|---|
| DOGE, BCH, ZEC, XRP, TRX, DASH, ATOM, RUNE | `m/44'/<coin>'/1106'` (DASH 5, ATOM 118, RUNE 931) | secp256k1 | `bip32` | account xpub, standard version bytes | account xprv |
| SOL | `m/44'/501'/1106'/0'` | ed25519 | `slip10-ed25519` | base58 32-byte key | hex 32-byte SLIP-0010 key |
| ADA | `m/1852'/1815'/1106'` | ed25519-bip32 | `cip1852-icarus` | hex(A 32 ‖ chain code 32), 128 hex chars | hex(kL ‖ kR ‖ chain code), 192 hex chars |
| XMR | `m/44'/128'/1106'` | ed25519 | `slip10-ed25519-monero-trezor` | Monero primary address (`4…`, 95 chars). hex(spendPub ‖ viewPub) is also accepted | hex 32 bytes: the SLIP-0010 key at that path, or the private spend key (same wallet either way) |

### Cardano: Icarus

The master key is CIP-3 Icarus (PBKDF2 over the words' entropy), not the BIP39 seed. Seeds' receive address is the Shelley base address: payment key `account/0/0`, stake key `account/2/0`. HME Wallet's `cardanoAccountKey` already does exactly this. Seeds derives byte-for-byte the same public key from HME's own code.

### Monero: Trezor's method

There are two incompatible ways to make a Monero wallet from the same 12 words. Seeds uses **Trezor's**, the same as HME Wallet:

```text
key seed  = SLIP-0010 ed25519 private key at m/44'/128'/N'
spend sec = key seed mod l
view sec  = keccak256(spend sec) mod l
address   = Monero base58( 0x12 ‖ spendPub ‖ viewPub ‖ keccak4 )
```

Ledger's way (BIP32 secp256k1 at `m/44'/128'/N'/0/0`, then converted) gives a **different wallet**. Someone who restores their words in Ledger Live won't see these coins. Seeds' revoke email says so in the recovery line. Seeds refuses a Ledger-style key because it doesn't match the submitted address.

### Check your derivation with these test values

Recovery phrase `abandon … about`, no passphrase, pocket 1106:

| Chain | Receive address |
|---|---|
| DASH | Xp6ThXaCd19dsRMhGtmbBotUHpSzvquubJ |
| ATOM | cosmos1wqmetx3wwm7tqwj990kf8xjpg8gwp9gcsly57y |
| RUNE | thor176rxh2dcfpfjfxmrdatl5057e3satvr8dzj5sw |
| ADA | addr1q8r6rzvltgh2xq32knz39gn6pv4td7hvsey7g26w9pl2lqzw930gs3rpl924spt83xkr6v5xnhpzjg744v7l252azxksxm68ze |
| XMR | 4A4meFan68GQTKM2GJemCwBkfbVP2UsH2ZLPxWKquxhF93ruBpNL3PjSQzkKWFX5ELS8P4MKc4DVqb5sDFuswXJFCRuGsea |

Monero against Trezor's own firmware test (`alcohol woman abuse must during monitor noble actual mixed trade anger aisle`):

| Path | Address |
|---|---|
| m/44'/128'/0' | 4Ahp23WfMrMFK3wYL2hLWQFGt87ZTeRkufS6JoQZu6MEFDokAQeGWmu9MA3GFq1yVLSJQbKJqVAn9F9DLYGpRzRAEXqAXKM |
| m/44'/128'/1' | 44iAazhoAkv5a5RqLNVyh82a1n3ceNggmN4Ho7bUBJ14WkEVR8uFTe9f7v5rNnJ2kEbVXxfXiRzsD5Jtc6NvBi4D6WNHPie |

### What Seeds does with them today

The keys are checked and stored encrypted, like every other pocket. Seeds shows **no deposit address** for these five until it can send each coin back out, so a deposit is never a one-way trip.
- Balances are read for DASH, ATOM, RUNE and ADA.
- Monero balances need a private view-key scan that Seeds doesn't run.
- No THORChain or Maya pool exists for Monero.

### How a new chain gets added from now on

1. **Seeds** adds the coin to its list with the exact key format and test vectors from an outside reference. It cross-checks against HME Wallet's derivation code, then lists the coin in `request_optional`.
2. **HME Wallet** adds the derivation whenever it's ready. Until then it simply **skips** optional coins it doesn't know, which is already in `validateDelegate`. Older wallets keep linking normally.
3. **Seeds ships first, always.** Seeds refuses a whole link that contains a key path it doesn't know, so a wallet must wait for Seeds' written go-ahead before sending a new coin.
4. **Members who are already linked** get the new coin by linking again from Seeds. Seeds asks for the same pocket number, and HME reuses it for the same site.

**One fix needed on the HME Wallet side:** a new link to the same site on the same pocket should replace the old link record. Today both records stay in the wallet. Seeds has already retired the old one, but if the member later revokes the stale record, the wallet retires the pocket the new link is using.

## Adding coins to an existing link (18 Nov 2026)

- Account → Security shows **Add new coins** to a linked member whenever Seeds accepts coins their active link doesn't hold (`coinsToAdd` in `src/lib/hme-link-rules.ts`). It starts a normal fresh link request while the current link stays active; the manifest asks for the active link's pocket number.
- Submit refuses, with HTTP 409 and nothing changed, (1) a different pocket number while a link is active and (2) any link that leaves out a coin the active link holds (older wallet build, or approve-every-trade over an instant-access link with extra coins).
- On a successful replace the old link is retired as `replaced`, its sealed key is cleared, and its pending trade approvals are closed.

---
## Nov 25 2026 update: Stellar, TON and Sui (accept-and-hold)

Seeds now accepts **Stellar (XLM), TON and Sui** keys in links. That's 14 optional coins, and `paths` may now contain up to **19** entries. All three are plain SLIP-0010 ed25519 at pocket 1106 — the same derivation as SOL, with a different address encoding per chain:

| chain | path (pocket 1106) | curve | format | public half (`xpubs[chain]`) | private half (sealed `xprvs[chain]`) |
|---|---|---|---|---|---|
| XLM | `m/44'/148'/1106'` | ed25519 | `slip10-ed25519-stellar-g-address` | the Stellar address itself (`G…`, SEP-0005 strkey) | hex 32-byte SLIP-0010 key |
| TON | `m/44'/607'/1106'` | ed25519 | `slip10-ed25519-ton-w5-hex-pubkey` | lowercase hex 32-byte public key | lowercase hex 32-byte SLIP-0010 key |
| SUI | `m/44'/784'/1106'/0'/0'` | ed25519 | `slip10-ed25519-sui-0x-address` | the Sui address itself (`0x…`, 64 lowercase hex chars) | lowercase hex 32-byte SLIP-0010 key |

All hex values (public halves, private halves, and the Sui address) must be **lowercase** — Seeds refuses uppercase at parse.

- **XLM:** the address *is* the public key (strkey-encoded), so the address doubles as the public half.
- **TON:** the address is derived from the wallet contract, so the public half is the raw hex public key. Seeds uses wallet type **W5 (v5R1)**, workchain 0, shown non-bounceable (`UQ…`) — the same contract version Tonkeeper uses. That does **not** mean the phrase can be restored in Tonkeeper to see these coins: the path is pocket 1106, not Tonkeeper's default, so only a wallet deriving this exact path will ever see this address.
- **SUI:** the address is `blake2b-256(0x00 ‖ pubkey)`, so the address doubles as the public half.

### Check your derivation with these test values

Recovery phrase `abandon … about`, no passphrase, pocket 1106:

| Chain | Receive address |
|---|---|
| XLM | GARWV2LPPTIXJYVWMINIZHNKNUCR3FDVANOPTZXGYV3765UZKSHWV5AI |
| TON | UQCsq4rzqzuJvOOkCj00SPdMru6-SHmeDuGf2_ecmdjlNwcm |
| SUI | 0xc103715616f6451c7d969ef90d20d1016924dad27e9c36cd3c1bd5ee5c36b8a1 |

Seeds' tests cross-check every address against the chain's own reference library (`@stellar/stellar-base`, `@ton/ton` WalletContractV5R1, `@mysten/sui`).

### What Seeds does with them today

**Accept-and-hold only.** The keys are checked and stored encrypted, like every other pocket, but Seeds shows **no deposit address and no balance** for these three until its own signer ships and is audited — a deposit is never a one-way trip. As with every optional coin, a wallet that doesn't know them simply skips them, and a wallet must wait for Seeds' written go-ahead before sending them.
