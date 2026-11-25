# Seeds: Stellar, TON and Sui native sends

## Review scope and current state

Bobby requested completion of the sending side for the three new 1106 key families, rather than balance-only support. This change builds native XLM, TON and SUI transfers and connects them to the existing withdrawal and deposit screens. **It does not activate unaudited money paths.** No mainnet payment was made during development; no publishing was performed.

The delivered auditor copy includes the exact latest commit. Review the whole commit, including the shared pocket-key ownership dispatcher and withdrawal confirmation watcher, not just the new transaction builders.

### Activation

`src/lib/pockets/ed-send-rules.ts`: `edSendStage()` currently returns `"review"`.

1. Independent review approves the implementation and dependency/runtime choices.
2. Change the stage to `"testers"` and deploy the reviewed version for funded tests. Roles are checked on the server; regular members remain blocked. Deposits also require the authenticated withdrawal context to pass all member-protection checks.
3. Make small, owner-approved mainnet sends for each chain, covering Stellar existing/new recipient, TON undeployed/deployed W5 source and destination trace, and Sui coin selection/gas. Confirm delivery independently and read it back in withdrawal history.
4. Change to `"open"` only after those tests pass. Existing email, authenticator, Telegram, link-age, pause and withdrawal-level checks remain required.

Do not treat unit tests, a valid signature or a network acknowledgement as a successful real withdrawal.

## Shared protection and storage

- Pocket remains 1106. No seed, new wallet branch, per-order address, custody address or new key export is introduced.
- Keys still open through `withPocketKey` → `decryptDelegatedKey(ciphertext, linkRef(link.id))`; KMS row binding is unchanged. The derived private byte buffer is wiped in the existing `finally` block.
- `addressOfKey` now recognizes XLM/TON/SUI as Ed25519 families. Previously this shared helper would have tried secp256k1 for these families. The builders also check the public/private address binding locally.
- No SDK keypair stores a member's private key. Noble signs XLM/Sui directly and supplies TON's signer callback. TON fee simulation uses a zero signature and is never submitted.
- All live reads, fee checks and unsigned simulation occur before the actual signing-key open.
- Existing authenticated request flow is reused: exact-details email code, fresh session authenticator proof, owner's Telegram tap, database reservation and claimed withdrawal, then release-time link/factor/role/pause rechecks.
- Transaction/message identifier is stored before one submission. No automatic replacement transaction is signed. New-chain failures after an identifier exists remain `unknown` unless a definite Stellar/Sui rejection was returned. The watcher checks the stored identifier.
- No schema changes, key migrations, secret changes or permissions changes are included.

## Stellar

- Official Stellar XDR builder; mainnet network passphrase; a single native payment or `createAccount` operation. No assets/trustlines, muxed addresses, account merges, memos or arbitrary operations.
- Exact seven-decimal integer conversion. Source sequence is read live and incremented by the SDK; two-minute time bounds.
- Current closed ledger must be within two minutes. Fee is twice its base fee, capped at 0.1 XLM.
- Available source balance excludes `(2 + subentries + sponsoring - sponsored) × base reserve` and native selling liabilities. A new recipient must receive at least two base reserves.
- Source master signer must be able to meet the medium threshold. Network validation remains authoritative.
- Local noble signature verification, persisted XDR transaction hash, one Horizon submission, hash/success checks and later closed-transaction lookup.
- Only personal G-addresses that require no memo are supported. The form warns against exchange destinations needing a memo.

## TON

- Official `WalletContractV5R1`, workchain 0, mainnet wallet ID `0x7fffff11`, same W5 address derivation as the wallet handoff.
- Active source code must match the pinned W5 code hash. Its live data must have signatures enabled, the same wallet ID/public key, no extensions or extra fields. Frozen/suspended or stale accounts are refused.
- Uninitialized source: the first transfer includes the official W5 StateInit. **SDK sequence-zero messages use `0xffffffff` expiry, not the requested two-minute expiry.** This is official W5 first-send behavior and must be considered in review; sequence replay protection still applies. Subsequent requests use two minutes.
- One plain native internal message, no payload/jettons, no sweep mode. Send mode is pay-gas-separately plus ignore-errors (3), as W5 requires the latter for external requests. Recipient is mainnet workchain 0; normalized own/burn/test addresses are refused. Non-bounceable delivery is used.
- Fee simulation includes deployment code/data when needed. Doubled source fee estimate must be at most 0.05 TON; 0.01 TON remains for wallet storage. These are conservative development defaults, not fees charged by Seeds, and need review.
- Identifier is the external message cell hash, not necessarily the eventual transaction hash. Review the TON explorer link and TONAPI trace-by-message-hash behavior in the funded tests.
- A submit acknowledgement or advancing seqno does not prove payment. Confirmation requires the matching incoming message, exact outgoing native amount/address and a successful destination child transaction. Emulated traces never confirm; absent child traces wait; skipped or aborted actions fail.
- TON fees are estimated, not constrained by an on-chain gas budget. Review that the margin/keep amount remains adequate under network changes.

## Sui

- Official SDK 3.0.1 Fetch-based gRPC client on mainnet, not retired JSON-RPC.
- Native SUI coin objects only. Explicit owner/version/digest checks, duplicate/cursor guards, at most 20 pages and 256 gas coins. Gas smashing is limited to selected SUI coins; no tokens, NFTs or arbitrary Move calls.
- Explicit sender/gas owner, selected gas payments, one gas split with exact u64 amount and one transfer to the exact recipient. Full transaction builds offline from provided references.
- Initial gas budget/selection requires amount plus 0.05 SUI. Final budget comes from simulation using the SDK computation floor, storage cost/rebate and 1,000 gas-unit margin; capped at 0.05 SUI. This can conservatively refuse very small pockets even if the final fee might be lower.
- Both initial and final bytes are simulated with checks enabled and automatic gas selection disabled. Mocked gas or failed simulation is refused before opening the key.
- Noble Ed25519 signs BLAKE2b-256 of the TransactionData intent bytes. The public SDK formats/verifies the signature; the exact transaction digest is computed before submission.
- Execution and watcher verify that the chosen recipient gained exactly the native SUI amount. Stale coin objects may fail safely; unknown execution outcomes wait for the recorded digest, never an immediate re-sign.
- This version spends coin objects, not newer address-balance-only funds. Assess this limitation in review; no unsupported objects are silently spent.

## Integration and dependency review

- New builders: `src/lib/pockets/{stellar,ton,sui}-tx.ts`.
- I/O: `src/lib/pockets/ed-send.server.ts`; pure limits/gate: `ed-send-rules.ts`; delivery evidence: `ed-confirm-rules.ts`.
- New service addresses are centralized in `src/lib/nodes.server.ts`.
- Withdrawal kinds/catalog, destination checks, integer live balance reads and dispatch updated in `src/lib/withdraw/`.
- New coins are normal catalog rows on Balances, Deposit and Withdraw. Duplicate former "coming soon" rows removed. No Swap action for these three because no implemented provider route exists.
- New-symbol withdrawal price lookups include the selected XLM/TON/SUI symbol for ordinary member limits.
- Production dependencies promoted and pinned: `@stellar/stellar-base` 15.0.0, `@ton/core` 0.62.0, `@ton/ton` 15.3.1, `@mysten/sui` 3.0.1. Existing noble 2.2.0 pins unchanged. The lockfile also contains resolver deduplication of MIME packages; inspect it as part of dependency review.
- Preview compilation/typecheck is green. Actual published Worker execution of the new network SDK paths remains a live-test item; do not infer that from Node/Bun tests alone.

## Verification completed

- Full `bun test`: **1,514 passed, zero failed**, 119 test files.
- New tests cover activation stages, each catalog network/decimal precision, exact reserves/fee ceilings, uncertainty classification, XDR payment/sequence/expiry/signature, TON action/deployment/mainnet/own-address checks and independent SDK signature equivalence, Sui BCS amount/recipient/digest/signature/gas, and TON/Sui delivery evidence.
- Signed-in browser check on Bobby's actual account: exactly one row per new coin, Deposit/Withdraw links, no unsupported Swap link; all three withdrawal screens show the review hold, all three deposit screens hide the copy/receive address. No uncaught browser errors. Mobile at 390px has no page overflow. This verifies the **review stage**, not actual sending.
- Live read-only network checks: current Stellar ledger fee/reserve data, TON address-info response, Sui mainnet gRPC reference-gas-price response. No secret or member key was sent to a provider.

## Outstanding, not claimed complete

- Independent security audit and published Worker/native SDK validation.
- Funded real deposit/send/history tests on all three networks, with explicit owner approval.
- TON message-ID lookup/explorer behavior and finalized recipient trace on first/subsequent sends.
- Wider activation after the reviewed tester sends pass.
- No new XLM/TON/SUI order books, liquidity, token senders or automatic bridge routes are introduced in this change; those are separate from native withdrawals. Existing broader swap-route work is not declared complete here.

## Rollback

Return `edSendStage()` to `"review"`; both new deposits and withdrawal requests stop. Existing recorded sends must still be monitored, not removed or re-signed. Keys and balance displays remain intact. Do not delete withdrawal/link history or alter KMS records.