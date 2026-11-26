# Completed TON payment still counted open

## Summary
The owner's 12 USDT TONAPI invoice payment was credited but remained `sent` in withdrawal history. TONAPI returned the correct confirmed trace for Seeds' stored external-message hash, but the validator serialized the same incoming message body in a reference, producing a different `in_msg.hash`. Strict string equality rejected the correct trace.

## Correction
`ton-message-proof.ts` retains direct hash matching. For mismatches it parses the raw confirmed transaction using the existing @ton/core library, verifies its hash against the trace transaction hash, verifies the transaction account and incoming external-message destination, and hashes both valid message serializations. Both Seeds' stored ID and the reported incoming hash must match these serializations. Missing or malformed evidence returns false.

Both native TON and USDT trace readers use this helper. Existing exact recipient/amount checks, simulation refusal and delivery-state requirements remain unchanged. No signer, approval, retry, expiration, fee or send logic changed. The recipient's optional notification failure does not undo successful jetton receipt; confirmation continues to use recipient jetton-wallet delivery, not that later notification.

## Data repair
One pocket_withdrawals row, `04d8eda2-50ea-425a-b4b0-ac4701c8c12d`, changed from sent to confirmed / 1 confirmation. Guarded by its ID, prior status, coin, chain, exact units and stored message ID. Public TONAPI trace independently proves the exact 12,000,000 units reached the recipient jetton wallet. No funds sent or records removed.

## Verification
- Public confirmed transaction fixture reproduces the bug and now confirms.
- Regression tests cover wrong transaction hash, wallet, message, missing/corrupt evidence, simulated traces, wrong amount/recipient and jetton-vs-native separation.
- Full Bun suite: 1,736 passing, zero failing. Preview build OK.
- Signed in as owner; waited for real history to load: one Confirmed withdrawal and zero In progress. No new funded send requested.

## Independent review
Review message reconstruction and its fail-closed checks before publishing this code. Root AGENTS.md is at its size limit; no structural rule appended there. This note's delivery copy includes the latest commit identifier.