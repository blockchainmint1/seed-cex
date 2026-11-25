# USDT on TRON — auditor handoff

## Scope and release state

Bobby requested native-pocket USDT on TRON support on November 25, 2026. This extends the already-present TRX key derivation, address and node configuration; it does not create a new wallet, change pocket 1106/0/0, change HME key delegation or move any existing funds.

**Not published; new money paths are deliberately locked in `review`.** The new balance row, network choice and prefilled Swap links can be checked now. No new USDT-on-TRON deposit address is exposed by the deposit flow; withdrawals and both swap directions refuse before funds leave. Independent security review, approval to enable tester sends, then owner-approved funded tests are required before widening access. No credentials, email codes, Telegram approvals or funded transactions were generated for testing.

The implementation commit ID is appended to the shareable copy after the commit is created. Baseline: `4443b2424ed6a2620138cf0a1a5d41ce1fd6b03d`.

## What is wired

- **Balances:** pinned Tether USDT, six decimals, read on TRON's finalized state. `USDT_TRON` is a distinct display reading from native `TRX` and `USDT_TON`, although it uses the existing TRX pocket address. Display caching is unchanged; sends bypass it.
- **Withdrawals:** `USDT:trx` in the common catalog and all existing email-code, session-TOTP, Telegram, readiness, pause, limit, cancellation and hold checks. Live send re-checks permissions, amount and fees before opening the scoped key. USDT-on-TON payment-note handling is unchanged; TRON payment links/comments are not added.
- **Swaps:** `USDT.TRON` now has a `trc20` send source for THORChain only. Existing direct cross-chain swaps and one-tap TSD buy/sell routes use it. The TSD path is still TSD Bridge ↔ Ethereum-pocket USDC ↔ THORChain ↔ TRON-pocket USDT; no additional manual swap or new bridge is introduced. Existing quote, minimum-output, vault, parent, reservation, lane and history logic stays in charge.
- **Navigation:** the USDT/TRON Balances Swap link opens the existing form on `USDT.TRON → TSD` when held, otherwise `TSD → USDT.TRON`. The form's existing network-based balance matching picks the new row. History/status still uses the existing swap records and per-step views.
- **Recovery:** the revoke check recognizes a held or unreadable TRON USDT balance instead of ignoring the token because its ID is not a native pocket family. Revoking remains possible; only the warning/acknowledgment changes. The same mapping also recognizes the existing `USDT_TON` reading.

## Contract and signed bytes

Mainnet contract: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`.

Decoded address: `41a614f803b6fd780986a42c78ec9c7f77e6ded13c`.

Only `TriggerSmartContract` calling this contract's `transfer(address,uint256)` is built. The ABI destination omits the `41` network byte and is padded to 32 bytes; amount is exact six-decimal base units. A transfer contains no native `call_value`, approvals, token allowance, arbitrary supplied calldata or node-built transaction. Withdrawal destinations require Base58Check/mainnet-prefix validation and refuse the own pocket, burn address and USDT contract. Amounts outside a positive uint256 are refused; a swap source with more than six decimals is refused rather than silently rounded.

THORChain TRON-USDT deposits use this direct token transfer to the freshly checked vault. The quote's already-validated memo is UTF-8 in **outer `raw_data.data`**, not appended calldata and not a router argument. No EVM-style router/approval is used. The TRON scanner and current SwapKit implementation corroborate this mechanism.

TAPOS reference bytes/hash are from a fresh mainnet block; current preparation time is the signed timestamp; expiry is exactly timestamp + 180,000 ms. Key ownership is checked through the existing `withPocketKey`, which binds AWS KMS to the link, derives the receive key and wipes it. Signatures match TronWeb `r || s || (recovery + 27)` using the existing noble implementation. Native TRX signing is unchanged.

**Independent byte verification:** official packaged TronWeb 6.5.2 encoded the same public test JSON, computed the same raw bytes and txid, produced the same ECDSA signature, and decoded/re-serialized the complete signed protobuf identically, both with and without a memo. The no-memo raw bytes are retained as a concrete regression fixture; TronWeb is not a Seeds dependency.

## Read, permission and fee preflight

Before any KMS unlock, token sends require:

1. The shared TRON-USDT activation gate.
2. Two successful node reads from distinct configured hosts, excluding `backupOnly` entries. Paid Alchemy/NowNodes remain first; public fallbacks remain available. No endpoint containing credentials is logged or returned.
3. On each node, finalized and latest token balances; the smaller is usable. `decimals()` must be exactly six. Both nodes must agree on token and native TRX balances. A missing/unreadable token response is never fabricated as zero.
4. Exactly the existing owner key with sufficient owner-permission weight; changed/multisig permissions fail closed.
5. Simulation for the exact sender, recipient and base-unit amount. RPC success alone is insufficient: an explicit failed `contractRet` or a false/malformed returned boolean is refused. The pinned Tether non-standard ABI may return no boolean. Simulation `energy_used` already includes the dynamic penalty; it is not added twice.
6. Live `getEnergyFee`, `getTransactionFee` and, for a swap memo, `getMemoFee`, plus a fresh block reference. No free-tier resource constants are used to decide a send.
7. A conservative full-burn budget: rounded-up 20% energy headroom, a 1,500-byte bandwidth allowance and any memo fee. Available stake/delegation is deliberately not credited, so this can refuse a send that would actually be cheaper. **Operator-chosen safety ceiling: 100 TRX total budget**, not a Seeds fee and not an estimate of normal cost; auditor/owner should confirm this ceiling. Signed `fee_limit` bounds energy burn; the budget also accounts for bandwidth/memo fees.

Withdrawals simulate before issuing an email code and repeat the entire preflight at release. New token swaps repeat it after the common swap reservation but before decrypting a key. Incoming purchases use the existing Ethereum-side fee preflight. Members may still need TRX in their TRON pocket to send USDT out later; no automatic TRX top-up or energy-rental service is introduced.

## Reservations and interrupted sends

The existing server-only withdrawal/swap reservations and owner approval protections remain unchanged. For token swaps, live tester status is read for the named member even on a background child leg; `Boolean(leg)` cannot silently bypass the token's tester stage.

`record` must succeed before broadcasting. Withdrawals persist the public signed raw bytes and expiry with the txid. A unique token-specific txid index in each outgoing-record table refuses two identical records before submission; this prevents identical simultaneous requests from counting one network transaction twice. No global in-memory lock or request promise is introduced.

Any error after a TRON USDT txid was recorded stays **unknown**, even if broadcast returned an error: never encourage an immediate duplicate send. Interrupted signing rows adopt the recorded id; they are not re-signed. The existing TRON broadcaster only fails over when a node did not answer and submits the same signed bytes; an actual rejection never becomes a fresh signature elsewhere.

Withdrawal confirmation requires two agreeing **solidified** node receipts and:

- Matching txid and a real inclusion block.
- SHA-256 of fetched `raw_data_hex` equals the recorded txid; raw bytes equal the immutable recorded evidence.
- One pinned USDT `TriggerSmartContract`, exact sender/recipient/base units and no native value.
- No top-level `FAILED`, `receipt.result = SUCCESS` and exactly one matching pinned-USDT `Transfer` log.

A failed finalized execution can close as failed. Missing, inconsistent or ambiguous evidence stays unknown. **Automatic expiry closure is deliberately not enabled for missing TRON transactions**; no wall-clock timeout permits a re-send. Existing THORChain/TSD status tracking still determines swap delivery/refund, rather than treating broadcast acceptance as completion.

## Applied additive migrations

- `0120_tron_usdt_withdrawal_evidence.sql`: preserves Stellar/TON/Sui protections; accepts public TRON evidence only with a signing USDT/TRX row, a matching txid and complete raw-data/expiry shape; evidence and a recorded token txid become immutable. The existing guard function remains server-only. No access grants or member data ownership rules are widened.
- `0121_tron_usdt_unique_sends.sql`: unique lower-case token txid indexes on `pocket_withdrawals` and `swap_sends`, restricted to USDT-on-TRON source records.

Both migrations were applied to the shared database, are backward-compatible with the published app and do not activate a sending path. No user rows were seeded or modified.

## Verification performed

- Full suite: **1,695 tests across 135 files passed**, including the new concrete protobuf fixture, contract/decimals/pocket checks, one-tap plans, prefilled links, separate token/native balances, review gates, simulation failures, fee math/cap, exact receipt matching and the preflight gate's zero network/recorder side effects.
- Harness typecheck/build: **build OK** after the changes.
- Signed-in browser as the owner: USDT/TRON row appears; its Swap link opens `TSD → USDT.TRON`; the selected token visibly says `USDT · TRON`; Deposit and Withdraw show the review blocker. No browser runtime errors. No Withdraw/Security/sign-in screenshots were captured. No code, approval or funded send was requested.
- Official TronWeb 6.5.2 cross-check: exact unsigned/signed bytes, hash, signature and protobuf roundtrip with and without the outer memo.

## Required independent review and funded sequence

1. Review the token-specific gates on withdrawal prepare/release, TSD buy/sell starts, direct swaps and background child sends, including a member removed from the tester group mid-route.
2. Re-check the exact TRC-20 protobuf, signature recovery byte, memo placement, fresh vault checks, six-decimal conversion and fee accounting against current TRON/THORChain interfaces.
3. Exercise DB evidence/txid immutability and duplicate-record refusal, including a callback failure and a crashed request after recording but before/after broadcast.
4. Confirm mainnet provider response formats for normal owner permissions, finalized/latest balances, non-standard Tether simulation returns and exact finalized Transfer logs. Distinct operators are assumed from the configured provider/host list; service identities are not independently attested by TRON RPC.
5. After audit and explicit activation, owner-approved small USDT withdrawal with enough TRX; confirm recipient credits and actual network fee. Then a small TSD → USDT/TRON route and USDT/TRON → TSD route, confirming each leg through history and on chain.
6. Test same-pocket simultaneous token swaps/withdrawals, changed permissions, low TRX, stale or inconsistent nodes, USDT contract refusal/blacklist conditions, bad checksum/burn/contract destinations, dropped/ambiguous broadcast and exact/no/incorrect receipt logs.
7. Test the re-link and revoke warning with TRON USDT present. Confirm the existing 1106 address never changes and no coin disappears from the view.

**Not independently verified here:** a funded TRON-USDT transfer, current THORChain vault/quote liquidity under this route, recipient credit, refunds, resource consumption under live contention, or broad release. No claim of funded completion is made.

## Files to review

Core: `src/lib/pockets/tron-usdt.ts`, `tron-usdt.server.ts`, `tron-usdt.test.ts`, `tron-usdt.server.test.ts`, `ed-send-rules.ts`, `pockets.functions.ts`, `hme-support.ts`, `AGENTS.md` in that folder.

Withdrawals: `src/lib/withdraw/catalog.ts`, `rules.ts`, `send.server.ts`, `withdraw.server.ts`; migrations 0120/0121 and their generated journal/snapshot entries.

Swaps/navigation: `src/lib/xchain/send-rules.ts`, `send-rules.test.ts`, `send.server.ts`, `tsd-route.ts`; `src/lib/account/deposit-options.ts`; `src/components/account/use-pocket.ts`; `src/components/swap/CrossChainResult.tsx`; `src/components/wallet/RevokeSeedsDialog.tsx`.

No new content routes, third-party scripts, chain-provider credentials, wallet key families, custody accounts, admin powers, fees or sign-in flows were introduced. Existing page metadata, header/footer and brand artwork are unchanged.

## Authoritative references checked

- [TRON solidified transaction receipt API](https://developers.tron.network/reference/gettransactioninfobyid-1)
- [TRON transfer simulation](https://developers.tron.network/reference/triggerconstantcontract)
- [TRON energy and bandwidth](https://developers.tron.network/docs/bandwidth-and-energy)
- [TRON fee_limit](https://developers.tron.network/docs/set-feelimit)
- [TronWeb crypto/signature implementation](https://github.com/tronprotocol/tronweb/blob/master/src/utils/crypto.ts)
- [SwapKit TRON transfer/memo implementation](https://github.com/swapkit/SwapKit/blob/develop/packages/toolboxes/src/tron/toolbox.ts)
- [THORChain TRON scanner implementation diff](https://gitlab.com/thorchain/thornode/-/merge_requests/3913.diff)
- [THORChain native TRX/USDT announcement](https://blog.thorchain.org/tron-integration-complete-native-trx-usdt-swaps-live-on-thorchain)
- [Honest.Money partner reference](https://honest.money/api)