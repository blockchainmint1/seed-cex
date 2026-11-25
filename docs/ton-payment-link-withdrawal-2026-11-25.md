# Seeds — TONAPI USDt refill-link withdrawal review

Date: 2026-11-25
Baseline: `9eca24029e2516822d3244c0d87b81618a5ec908`
Requested by Bobby: accept the supplied `ton://transfer` link in the withdrawal address field, without losing the requested payment details.
Publication: not performed; this batch changes withdrawal message contents and needs independent review.

## What the supplied link requests

- Destination: `UQDdUeSv2MQ9GahvwFegT6n4vUlWfuNn-6ppQKaYrPnRSJgA`.
- Jetton master: the existing pinned Tether USDt master, `EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs`.
- Amount: `12000000` base units, exactly **12 USDt** at six decimals (not 12 TON).
- Plain payment comment: **TON Console: Refill** (`+` decoded to spaces, `%3A` to colon).

The destination's ownership and whether TONAPI credits this invoice after payment were not independently verified. It is Bobby's supplied invoice, not a destination invented by Seeds.

## Changes and security boundaries

### Paste and server-side parsing

`src/lib/withdraw/ton-payment-link.ts` recognises `ton://transfer/<one-friendly-address>` only. Bare addresses keep their previous behaviour. Accepted query fields are `jetton`, `amount`, and `text`; duplicates, unknown fields, binary/init payloads, fragments, credentials, malformed URL/UTF-8, invalid checksums, testnet/burn destinations and non-workchain-zero destinations are refused.

Only the pinned USDt master is accepted for a jetton invoice. Native TON links without notes are supported at nine decimals; native TON comments remain unsupported and fail explicitly rather than being dropped. Amounts must be positive integer base units under the existing jetton amount bound, converted with BigInt rather than floating-point arithmetic.

The form fills address, amount and comment for the already-selected coin/network, clears previous codes and the address-confirmation checkbox, and requires fresh review. An invoice for another coin/network is refused with a clear selection message, never silently used as a different asset. Changing coin/network remounts the form to discard stale payment details. The server independently reparses any pasted URI and rejects conflicting asset/network, amount or note.

`src/lib/pockets/ton-payment.ts` is browser-safe and is the single source for the USDt master, decimals, friendly-address checksum validation and plain-comment validation. Existing imports through ton-jetton.ts remain valid via re-exports. Signing/message builders stay out of the browser parser's dependency graph. The small address decoder checks the TON CRC16, mainnet bounceable/non-bounceable flags, workchain zero and nonzero account hash; the send path still applies the existing TON SDK destination validation.

### Emailed code, stored note and Telegram approval

The comment is bound into `detailsText` and the existing HMAC-protected emailed code. No-comment details retain their old exact format, so existing codes are not invalidated by the deployment.

Migration **0114_withdrawal_ton_payment_comment.sql** was applied to the shared project database. It adds `pocket_withdrawals.payment_comment` with an empty default, a USDt/TON-only constraint and a trigger allowing an initial note only while the withdrawal is approving with no approval attached. Once set, it cannot change or be removed; once approval is attached, an empty note cannot be replaced. Existing grants/RLS are unchanged, and all existing rows receive the empty default. This is additive and compatible with the already-published app, which still makes no-comment withdrawals.

Request flow saves the note with a checked update before requesting Telegram approval. Failure cancels the reserved request and sends nothing. Email and Telegram show the note; Telegram metadata carries the same `payment_comment`. The tap blocker checks it against the withdrawal row. Continuation checks it again and supplies the note as required approval metadata when consuming the approval. The background sender again compares the used approval metadata against the stored note before any spend. Missing metadata is permitted only for legacy no-comment requests.

All existing email/TOTP/Telegram, wallet-link age, caps/holds, set-asides, destination, live balance, fee and one-broadcast checks remain in place. No new signer, provider, account role, API key or third-party code was added.

### Message contents

`usdtTransferBody` now optionally builds a TEP-74 `forward_payload` reference with a zero 32-bit text-comment opcode and the validated UTF-8 note. Plain notes are limited to 120 UTF-8 bytes, with control characters rejected. Destination, amount, response address, query id, custom-payload flag, one-nanoton forwarding amount, attached jetton gas and existing send/expiry evidence are unchanged. When the note is empty, the former inline empty payload remains byte-for-byte unchanged.

`sendUsdtTon` and the existing withdrawal sender pass this plain comment to the same audited `signAndSendTon` path. No caller-supplied Cell, BoC, binary payload or transaction is accepted. Notes do not change the STON.fi swap message.

## Verification

- New `ton-payment-link.test.ts` tests Bobby's exact invoice, native units, bare addresses, wrong asset/network, conflicting terms, alternate friendly master spelling, unsupported tokens/payloads, duplicates, malformed/testnet destinations, comment limits, email-code binding, legacy codes, Telegram metadata matching and the actual outgoing TEP-74 body fields/comment.
- Focused withdrawal/jetton suites: 54 passed, 0 failed.
- Full suite: 1,655 passed, 0 failed across 131 files.
- Preview diagnostics: build OK; no separate manual typecheck was run.
- Signed-in browser verification on Bobby's real withdrawal form: paste filled **12 USDT**, the supplied destination and **TON Console: Refill**; confirmation reset; the code button enabled only after fresh address confirmation. A `bin` payload was refused and the code button stayed disabled. No page errors on the successful run.
- No withdrawal screenshot was captured, following the project's privacy rule. No emailed code was requested, no TOTP was submitted, no Telegram approval was requested and no coins were sent.

## Auditor / funded-test follow-up

Review the migration's immutable-note trigger and the initial note write preceding approval, all three metadata comparisons, preservation of existing no-comment withdrawals, and the TEP-74 comment layout. Negative tests should confirm that changing the note invalidates the email code or approval, removing/changing it after attachment is rejected by the database, and unsupported binary/init payloads never reach signing.

A funded USDt payment with a comment and TONAPI's actual invoice-credit readback remain unverified and need the owner's approval and wallet/account access. The unrelated previously reported withdrawal-readiness issue was not bypassed or relaxed.