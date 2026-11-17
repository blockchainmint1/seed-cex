# Auditor handoff: Seeds multichain trading pockets (Nov 17 2026)

## Scope of the change
Seeds can now derive keys, compute addresses, read balances and sign sends for six more coins (DOGE, BCH, ZEC, XRP, TRX, SOL) without HME Wallet supporting them. **No send path is wired up yet:** no route, server function or job calls the new signers, and there is no broadcast code for these coins.

### New files (`src/lib/pockets/`)
| File | Role |
|---|---|
| `coins.ts` | Pocket registry and paths; `validPocket` limits pockets to accounts 1106–2105 (savings account 0 is never derived) |
| `encode.ts` | Address encoders: Base58Check P2PKH (1- and 2-byte versions), CashAddr, XRP, TRON, EIP-55, Solana |
| `slip10.ts` | SLIP-0010 ed25519, hardened-only |
| `derive.ts` | `pocketsFromMnemonic`/`pocketsFromSeed`: seed in, pocket keys out; the seed buffer and HD roots are wiped in `finally`. `pocketKeysMatch` checks a private key against its public half before storage |
| `utxo-sign.server.ts` | DOGE (legacy SIGHASH_ALL) and BCH (BIP-143 + FORKID 0x41) P2PKH signer; outputs ordered [vault, change, OP_RETURN]; dust, 80-byte memo and funds checks |
| `xrp-sign.server.ts` | XRPL Payment canonical serialization; fee capped at 1 XRP; fully-canonical flag |
| `tron-sign.server.ts` | TRON TransferContract protobuf built locally (never signs a node-built transaction); 10-minute expiry |
| `sol-sign.server.ts` | Solana legacy message: System transfer + Memo v2; refuses sending to self |
| `io.server.ts` | Read-only balances: NowNodes Blockbook (DOGE/BCH/ZEC), xrplcluster/s1.ripple (XRP), TronGrid, Solana public RPC; 8 s timeouts; errors return null |
| `pockets.functions.ts` | Authenticated balance read for the **caller's own** link only; addresses are derived server-side, so it can't be used to look up arbitrary addresses |
| `pockets.test.ts` | 25 tests with pinned vectors |

### Modified
- `hme-link.server.ts`: accepts optional pocket paths; validation goes through `pocketKeysMatch` (adds SOL raw-key support).
- `api/public/hme-link/submit.ts`: up to 11 paths; **optional coins are refused in approve mode**, since the wallet can't sign them.
- `api/public/hme-link/manifest.$id.ts`: adds `request_optional`. The required list is unchanged.
- `hme-link.functions.ts`, `HmePocketBalances.tsx`: show the extra pockets when a link includes them.
- Removed `hme-pocket.ts` (replaced by `pockets/derive.ts`).

## How correctness was checked
Address derivation and every signer were cross-checked against independent reference libraries in a scratch environment that isn't shipped:
- Addresses (all 11 key families, pocket 1106 of the BIP-39 test phrase) match `@bitgo/utxo-lib`, `ripple-keypairs`, TronWeb and `micro-key-producer` + `@solana/web3.js`.
- DOGE/BCH: bitgo parsed our transactions, recomputed each input's sighash with its own code and verified our signatures; txids matched.
- XRP: `ripple-binary-codec` decoded our blob and `ripple-keypairs.verify` accepted the signature over its own signing encoding.
- TRON: TronWeb deserialized our raw_data, and its signature over our txID is byte-identical to ours.
- Solana: `@solana/web3.js` parsed the transaction, verified the signature and decoded the transfer and memo.
- SLIP-0010 official test vector 1 (m/0') passes.
- Balance reads tested live against THORChain vault addresses on all six networks.

## Security properties / decisions to review
1. **Seeds stores pocket keys, never seeds.** Whatever the source, a seed is reduced to pocket branches and wiped. Storage reuses the existing encrypted `hme_links.key_ciphertext`.
2. **More coins means more keys held.** Instant-access links can now carry up to 11 pocket keys. Each one covers only that coin's trading pocket, and revocation deletes all of them. The main residual risk is unchanged: keys are briefly decrypted in server memory while signing.
3. **Users can't spend these coins in HME Wallet.** Before deposits are encouraged, Seeds must offer a re-authenticated "send out" for each new coin, or funds can only be moved by Seeds or by importing the seed into another wallet at account 1106.
4. **Zcash signing is not implemented** (v5 / ZIP-244). Addresses and balances only.
5. **THORChain specifics still to confirm before enabling sends:** Solana instruction order (transfer then memo), and that TRON's memo is read from `raw_data.data`. Sends must keep the existing `/swap` gates (memoSafe, limitOk, two-server vault check, halt check).
6. Third-party reads (Blockbook, TronGrid, XRPL and Solana public RPC) are used for display only; none of them drives settlement.

## Not done / next
Broadcasting and fresh-state fetches (UTXOs, XRP sequence, TRON reference block, Solana blockhash); wiring sends into the swap and settlement guard (`settle-guard.server.ts` caps and single-claim); Zcash v5 signing; per-coin withdrawals; any seed-entry screen.
