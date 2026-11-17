# Seeds Locked Trading Balance: spec for HME Wallet and the auditor

Status: **draft, 2026-11-17.** Seeds has built the lock rules and tested them. Nothing touches settlement yet, and no member funds have been locked. This needs three things before it goes live: (1) the HME Wallet changes in section 6, (2) one small real-money test on TEXITcoin (section 8), and (3) auditor review (section 9).

## 1. Problem
On TEXITcoin, a seller can approve a trade and then broadcast a conflicting, higher-fee transaction that moves the same coins somewhere else. Until the settlement confirms, the buyer isn't safe. Today the only fix is to wait for confirmations (about 6 minutes for two).

## 2. Idea
Each member gets a **lock address** on TEXITcoin (and later ISK). Coins and Omni tokens (TSD #39, wBTC #43, wLTC #44, wETH #45) at that address can move only:
- **together**: the member's trading-pocket key AND Seeds' key sign, or
- **by the member alone** after the coins have sat unmoved for `csvBlocks` blocks (default 14,400 blocks, about 30 days at TXC's measured ~181-second blocks). This is the automatic refund if Seeds disappears.

The member can't move locked coins without Seeds, so a trade signed out of the lock can't be double-spent. Seeds treats it as final the moment both signatures exist, with no confirmation wait. Seeds can't move the coins without the member, so the worst Seeds could do is refuse to sign until the timer runs out.

## 3. Script (exact template)
P2WSH (segwit v0). The witness script:
```
OP_IF
  <seedsPub:33> OP_CHECKSIGVERIFY
OP_ELSE
  <csvBlocks: minimal scriptnum, 17..65535> OP_CHECKSEQUENCEVERIFY OP_DROP
OP_ENDIF
<memberPub:33> OP_CHECKSIG
```
Bytes: `63 21 <seedsPub> ad 67 <len> <csv LE> b2 75 68 21 <memberPub> ac`.

- `memberPub` is the trading pocket's receive key: public child 0/0 of the account xpub the wallet submitted (account 1106–2105, whatever the wallet sends; pockets rotate).
- `seedsPub` is derived by Seeds per member, chain and generation from one server secret (HMAC-SHA256, `seeds-lock/v1/<chain>/<member>/<generation>/<ctr>`). Seeds stores nothing per member. The generation goes up when a lock is rebuilt, for example after pocket rotation.
- Address: bech32 with HRP `txc` (ISK: `isk`), e.g. `txc1q…` (62 chars).
- Reference vector, checked against the live TEXITcoin node with `decodescript`: seedsPub = G, memberPub = 2G, csv = 4320 gives `txc1q94kwcsezvh935egqskkcnsn853qhplwdpcdj7z4l5eyvqgk7wn7q80vvkj`.

Network facts checked on the live nodes today: TXC (TexitCoinCore 0.26.2, Omni 1.0.0) and ISK (IskanderCore 1.1.3, Omni 0.9.1) both have CLTV, CSV, segwit and taproot active since block 0.

## 4. Flows
All spends use SIGHASH_ALL only, transaction version 2, and every input comes from the lock address. That last rule matters because Omni picks the sender from the inputs, so a stray input from another address could make the wrong address the token sender.

| Flow | Inputs | Outputs | Who signs | Final when |
|---|---|---|---|---|
| **Lock** | pocket | Omni send to lock address + TXC fee reserve at lock | member (HME Wallet, the same as any pocket send today) | 1 confirmation |
| **Trade** | lock (seller) | Omni send to the buyer's lock address, TXC change back to the seller's lock | member + Seeds (cooperative path) | **immediately** (can't be double-spent) |
| **Unlock** | lock | Omni send to pocket | member + Seeds | 1 confirmation |
| **Refresh** | lock | the same lock address (resets coin age) | member + Seeds | 1 confirmation |
| **Refund** | lock (coins ≥ csvBlocks old, input nSequence = csvBlocks) | anywhere the member chooses | **member only** (refund path) | any time after the delay |

Witnesses, bottom to top: cooperative `[memberSig, seedsSig, 0x01, witnessScript]`; refund `[memberSig, <empty>, witnessScript]`.

**Lock strength.** A coin at the lock address becomes refundable once it has `csvBlocks` confirmations. Seeds settles instantly only while every coin there is younger than `csvBlocks − 960` (about 2 days of margin). Past that, Seeds asks for a Refresh. Active traders refresh automatically, because each trade spends the old coins and creates new change. Until a refresh confirms, that member's trades wait for confirmations, exactly like today.

## 5. Custody: what we can honestly say
- **Approve-every-trade members:** the member's key stays in HME Wallet and Seeds holds one key that can't move funds alone. This is collaborative / non-custodial. US FinCEN guidance (FIN-2019-G001 §4.2.2) treats a provider that only adds a second signature, without independent control, as not a money transmitter. Counsel still needs to confirm this for Seeds.
- **Instant-access members:** Seeds already holds a sealed copy of the pocket key, so with a lock Seeds would hold **both** keys. That is custody, with limits. We must not call it non-custodial. Proposed label: "Seeds can trade this balance for you, up to your limit."
- **Recommended default:** lock plus approve on phone. Market orders settle the moment the member taps Approve. Limit orders that fill while the member is away send a phone alert with a short approval window, and the match is skipped if it lapses.

## 6. What HME Wallet needs to change
Checked against HME Wallet snapshot `3c80bec3`. Today, `src/lib/seeds/trades.ts` (`inspectTrade` and `approveTrade`) only recognises pocket inputs whose script is a plain pocket P2PKH/P2WPKH (`pocketScriptMap`). A lock input would be refused with "Nothing in this trade is spent from your Trading pocket", and the lock address would show as "(script)". Requested changes:

1. **Recognise lock inputs.** If a PSBT input has `witnessUtxo` + `witnessScript`, parse the script with the exact template above. Treat it as "your locked balance" only when `memberPub` equals one of this link's pocket keys and `sha256(witnessScript)` matches the input's scriptPubKey. Then sign it with `psbt.signInput` (bitcoinjs handles P2WSH with witnessScript) using SIGHASH_ALL. Never sign any other template.
2. **Show it plainly.** "From your locked trading balance" / "To your locked trading balance" for outputs paying the member's own lock address. Keep the Omni token decode (TSD amounts) working for P2WSH senders and recipients.
3. **Save the lock description on the phone** (`seedsPub`, `csvBlocks`, chain, generation, address) when the member first approves a Lock. Without it, the wallet can't rebuild the address if Seeds is gone.
4. **"Recover locked funds" button that works without Seeds.** Once the coins are old enough, it builds the refund spend (version 2, nSequence = csvBlocks, refund witness) and broadcasts it through the wallet's own node access. Show a countdown in days until it's available.
5. **Lock / Refresh / Unlock approvals** use the existing approve-trade endpoints. Seeds sends a PSBT with a summary; nothing new on the protocol side.
6. **Out of scope:** EVM assets (USDC/ETH). Those need a contract, not this script.

## 7. What Seeds has built (commit on main, not wired in)
- `src/lib/lock/script.ts`: template build/parse (exact match), P2WSH address, per-member Seeds key derivation, BIP143 sighash, signing and verification, cooperative and refund witnesses, version 2 segwit serialisation, lock-strength rule.
- `src/lib/lock/script.test.ts`: 17 tests, including a byte-for-byte match with the live TEXITcoin node, the official BIP143 test vector, the amount-commitment check and the refund-delay rules.
- A side fix found while checking: Seeds rejected real TEXITcoin/ISK shared (P2SH) addresses. Their version bytes are 65 ("T…") and 44 ("J…"), confirmed on each node. They're accepted now (`src/lib/txc/tx.server.ts`, tests in `src/lib/txc/address.test.ts`).

## 8. Open risk: Omni on segwit addresses (must test before building further)
All 198 current TSD holders are on legacy "T…" addresses. None of them is on a segwit address, so it's unproven that TEXITcoin's Omni 1.0.0 reads a **P2WSH sender**. The node does accept P2WSH addresses for balance queries. Proposed test, costing a few cents: lock 1 TSD into a test lock, do one cooperative send, and do one refund with a short test delay (e.g. 20 blocks). If Omni can't read P2WSH senders, fall back to the same script inside **legacy P2SH** ("T…" address; Omni has long supported P2SH senders). The catch with P2SH is transaction-id malleability on back-to-back unconfirmed trades.

## 9. Questions for the auditor
1. Template and witness review; any MINIMALIF or standardness issues with the 0x01 / empty branch selectors?
2. Is 14,400 blocks with a 960-block margin reasonable? Does lock strength measured as max(confirmations) over the address's coins cover every way the member could refund alone?
3. Seeds key derivation from one HMAC master secret: where should it live (hot server secret vs. HSM/KMS)? Rotation plan?
4. Omni sender rule: is "all inputs from the lock address" enough, or should Seeds also check the sender with `omni_decodetransaction` before co-signing?
5. Labelling: is the custody split in section 5 acceptable for marketing "non-custodial" for approve-mode members only?

---

## Revision 2 (2026-11-17, after the auditor's design review)

The auditor signed off on the design with conditions. All of them are now enforced in code (`src/lib/lock/rules.ts` and `lock.server.ts`); none is left to the UI.

| Auditor condition | How Seeds enforces it |
|---|---|
| Default to legacy **P2SH** on TEXITcoin until the live test proves Omni reads P2WSH senders | `DEFAULT_WRAPPER = "p2sh"`. "T…" addresses (version 65; ISK "J…" 44, both checked with `validateaddress` on each node). Same redeem script as section 3. scriptSig coop `<memberSig> <seedsSig> OP_1 <redeem>`, refund `<memberSig> OP_0 <redeem>`. Legacy SIGHASH_ALL. HME Wallet must supply `nonWitnessUtxo` for P2SH lock inputs |
| P2SH txids are malleable | Lock spends only use coins with ≥ 1 confirmation |
| Deposit reorg risk | A member's own deposit becomes tradable only after 6 confirmations (up to $1,000), 12 (up to $10,000) or 24 (above). Co-signed trade receipts are exempt |
| Seeds must never co-sign one coin twice | Permanent insert-only `lock_signed_outpoints` (primary key txid+vout). `reserve_lock_outpoints()` reserves every input of a set of spends in one all-or-nothing statement before Seeds signs |
| No replace-by-fee on trades | Cooperative inputs use nSequence `0xffffffff`. A stuck trade gets re-signed, never fee-bumped in place |
| Pending sends reduce what's tradable | `tradableAmount = confirmed − pending signed − immature deposits` |
| Refresh must sweep every coin, including dust | **Every** lock spend (trade, unlock, refresh) must spend exactly every confirmed coin at the lock, so each trade is also a refresh. Leaving any coin behind is refused |
| Keep a TXC fee reserve for the refund | Every spend must return ≥ 0.01 TXC to the lock. Miner fee is capped at 0.005 TXC. First deposit sends 0.05 TXC along with the tokens |
| Sign only what Seeds built; decode with Omni before signing | Seeds builds the transaction on its own node and stores `unsigned_hex` + its SHA-256. It co-signs only that transaction, taking only signatures from the wallet, never a PSBT. Before signing it requires `omni_decodetransaction` to show sender = lock, reference = expected recipient, property and amount exact, type = simple send, and no extra outputs |
| Atomic two-leg settlement (audit C2) | `pairReady`: both members' signatures are verified before Seeds signs either leg, and both legs are broadcast together after both pass `testmempoolaccept` |
| Seeds key in KMS/HSM | **Open.** Today: HMAC derivation from the `SEEDS_LOCK_MASTER` server secret. Before launch, move signing into AWS KMS (secp256k1 key, digest signing) |
| Say the 30-day freeze out loud | Required in member-facing copy when the feature ships |

Trade-off accepted with P2SH: a lock spends at most once per block (~3 minutes), because its next spend must wait for its coins to confirm.

**Live test** (`scripts/lock-live-test.ts`, operator-only, 20-block test delay). Funding address `TiwXXpo37QWNnykS1LTHVfmJArTvSETNX5`. Test locks: P2SH `TLQq2kuVHciy3QA6Au9Emsty2PzMpYqfQv`, P2WSH `txc1qrrsjnvtc7at974mew76txyn9xfm6gs45jgur6ct87klq2wr0j58qj8nm6r`. Steps: deposit to each lock, co-signed send P2SH→P2WSH and P2WSH→P2SH (also proves the ledger refuses a second co-sign), then member-only refunds after 20 blocks. Results get appended here.

### Live test results (2026-11-17, TEXITcoin mainnet)
| Step | Result | Tx |
|---|---|---|
| 0.5 TSD into P2SH lock `TLQq2kuV…YqfQv` | Credited by Omni | `8a8255c4a6f08babad3cc1923460018baa098822f2de55c1cc1bf675f776bf7e` |
| 0.5 TSD toward P2WSH lock `txc1qrrsj…nm6r` | **Omni ignored the P2WSH output; the reference fell back to the sender, so the TSD stayed home.** 0.05 TXC did land at the P2WSH address | `c5e06fde11c8cbdb90144ade653cb61c7c737042087642390f0670cef6e8c743` |
| Seeds-built co-sign P2SH → P2WSH | Refused by Seeds before signing: the Omni decode showed recipient = sender | n/a |
| Co-signed 0.25 TSD P2SH lock → member address | Omni valid, sender = P2SH lock, recipient correct | `1d80fc2ae99595474467a6e905119f1937222bf933865509a24d793a9f1e8726` |
| Second co-sign of the same coins | Refused by `reserve_lock_outpoints` | n/a |
| Member-only refund (20-block test delay) | Pending until the change coin is 20 blocks old | |

**Decision:** token locks are P2SH only. `buildLockSpend` refuses token spends from P2WSH locks. HME Wallet only needs the legacy P2SH path.
