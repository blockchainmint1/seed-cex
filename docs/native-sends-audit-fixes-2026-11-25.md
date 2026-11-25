# Seeds — native XLM / TON / SUI audit fixes and tester activation

Date: 2026-11-25. Baseline: `b4fb98668356d391863f7aeaa310fbadfb2510dc`.
The delivered auditor copy appends the exact implementation commit. Review that commit's full diff and migration, not only the builders.

## Owner approval and scope

Bobby approved the ES1–ES6 / HF1 fixes and **tester-only** native deposits and withdrawals. Independent review of `c3376cb` cleared small, owner-funded tester sends, not general access. `edSendStage()` now returns `testers`. Admins and beta members are checked server-side; everybody else remains blocked. Account readiness, email code, fresh authenticator proof, exact-details Telegram approval, link matching, KMS row binding, pauses and reservations are unchanged. No payment was made, no real key was unlocked for a send, and nothing was published during this work.

## Changes to evaluate

### ES1 — Stellar memo-required addresses

`stellarDestinationProblem` reads Horizon `data_attr["config.memo_required"]` and rejects `MQ==` during request preparation. The sender repeats the same check before opening the signing key. An unreadable recipient check fails closed. Seeds still does not send memos or support muxed destinations. New-account minimum-reserve enforcement remains in the sender.

### ES2 — Fees, bounded expiry and interrupted sends

- Stellar bids `max(2 * latest_ledger.base_fee_in_stroops, fee_stats.max_fee.p50)`, refusing above 0.1 XLM rather than silently reducing a required bid. The unsigned choice is included in the signed XDR.
- New nullable `pocket_withdrawals.send_meta` records non-secret signed expiry evidence atomically with the transaction ID before submission. A trigger refuses changes once present and only permits its first recording from a signing row, alongside a txid and matching coin. Existing table grants and owner-read policies remain unchanged. No private key or signed raw bytes are stored in this field.
- Stellar: only a transaction lookup returning HTTP 404 plus a Horizon indexed ledger closed more than 30 seconds beyond the recorded signed expiry produces terminal `failed` with zero confirmations and an explicit expiry reason. A timeout, 429 or 5xx is not negative evidence.
- TON: stores the actual W5 expiry, source sequence and public key. After a trace 404, sequence greater than zero, account sync time more than 30 seconds beyond expiry, and unchanged sequence verified by both toncenter and TONAPI permit expiry. Changed sequence, disagreement, stale reads or unavailable providers keep waiting.
- **TON first deployment remains a documented exception.** W5 sequence zero uses `0xffffffff` validity, not two minutes. It is never failed merely because the requested timeout passed; unresolved deployment submissions need chain/operator investigation. No automatic replacement is signed.
- Sui: both simulations and the final signed BCS now carry `Expiration::Epoch(currentEpoch + 1)`. The builder rejects epochs that cannot be represented exactly by the SDK. Only SDK `TransactionError(notFound)` for the same digest plus a current epoch strictly beyond the recorded signed epoch permit terminal expiry. Network errors remain unknown.
- Native requests killed before their catch block are swept after the existing ten-minute interrupted-send window: a recorded ID becomes `unknown` and is watched, never re-signed; no recorded ID becomes `failed` because submission is after awaited recording. Compare-and-set protects this recovery against a concurrent state change.
- The watcher rotates unresolved rows by `updated_at`, so the first 25 unknown rows cannot permanently starve later ones. Expiry notices are sent only when the terminal status update actually changes a waiting row. Legacy rows without expiry metadata remain conservative: no invented expiry.

### ES3 — Spendable excludes network money before approval

Live request reads subtract Stellar's chosen bid and reserve, or the conservative 0.05 TON / 0.05 SUI fee allowance (plus TON's 0.01 storage keep). Signing still re-reads and checks actual fees/reserves. A later network change can still safely refuse a send. Displayed portfolio balances are not reduced by these allowances; they apply to withdrawal preparation only.

### ES4 — Quote cache

XLM, TON and SUI join the ordinary `TRACKED` quote set. The finished-value CMC cache also matches a canonical symbol-list key, preventing a subset read from hiding a coin requested later. No cross-request promises or permission changes were introduced.

### ES5 / HF1 — Endpoint configuration and TON independent state

- All toncenter balance, account, fee-estimate and submission calls share `tonEndpoint()` and send `TONCENTER_API_KEY` only in `X-API-Key`.
- TONAPI raw account and trace lookups share a separate endpoint and optionally use `TONAPI_API_KEY` in an Authorization header. The raw account's canonical address, W5 code, signatures-enabled flag, wallet ID, public key, extension absence and sequence are checked independently before signing. toncenter and TONAPI must agree on the sequence.
- Stellar and Sui use the existing `NodeEndpoint` shape with optional administrator-configured HTTPS endpoint/header credentials (`STELLAR_HORIZON_URL` / `_API_KEY`, `SUI_GRPC_URL` / `_API_KEY`). URL userinfo and insecure schemes are refused. Sui credentials enter the fetch-based gRPC client's request metadata, not a URL. No new credentials were created or requested.
- **Operational residual:** Stellar and Sui still default to their verified public services; TONAPI defaults to public access unless configured. No paid service or second independent Sui/Horizon server was provisioned. Rate limits/outages fail closed or keep the stored send unknown, not reroute a submission. Header credentials for custom services require their documented header scheme; this implementation uses `x-api-key`.

### ES6 — Exact TON delivery evidence

An outgoing message to the chosen destination with an unsafe JSON-number amount or unparsable integer yields `null` (continue watching), not a false definitive failure. Exact string amounts above 2^53 are accepted. Sui successful transactions without verified payout evidence also keep waiting rather than report an unproven failure.

### Deposit readiness message

The tester-stage deposit screen preserves the actual server readiness blocker instead of incorrectly labelling an eligible tester as a non-tester. Missing context still closes deposits; the review-stage blanket hold remains available as rollback.

## Validation and remaining release gates

- Full suite: 1,537 passed, zero failed, 122 files. Current preview compilation is clean. The delivered copy appends the exact implementation commit.
- Regression tests exercise tester/non-tester gates, deposit fail-closed context, memo-required recipient checks both before request and before key access, live median fees, reserve/fee deduction, signed Sui epoch, expiry boundaries, interrupted sends, TON large-value evidence, keyed endpoints, and CMC cache isolation.
- Network-level mocked tests distinguish missing Stellar transactions from provider outages and preserve indefinite TON sequence-zero uncertainty.
- Live read-only checks succeeded against Stellar, toncenter, Sui mainnet gRPC and TONAPI's raw account endpoint. No send was made.
- Bobby's signed-in account and all three deposit/withdraw screens were inspected, with no uncaught browser errors. **His existing Telegram connection is verified but has no trusted verification timestamp; the existing withdrawal readiness rule therefore blocks all three.** No account-security state was changed or bypassed. Telegram must be confirmed under the existing flow before a subsequent wallet link can satisfy readiness. This was not a ready-account or real-send end-to-end test.
- No withdrawal-page screenshots were taken, in accordance with the project's privacy rule.
- Independent re-review of this diff/migration, then publication and personally approved funded tests remain required. Cover Stellar existing/new and memo-required recipients; TON undeployed/deployed sends and actual trace-by-external-message lookup; Sui single/multiple coin objects; and interrupted submission/expiry/history read-back on every chain.
- General access stays closed until those tests pass and the owner approves opening. Q1 needs Honest.Money's asymmetric-ticket work; Monero server checks, Relay payout review and unrelated automatic-swap work are not declared complete here.

## Rollback

Set `edSendStage()` to `review` to stop new deposits and requests for all three chains. Continue watching existing recorded IDs; never delete history, change metadata/KMS bindings or re-sign uncertain sends. Leave the additive evidence column in place.