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
