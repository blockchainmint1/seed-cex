# QA-0011 — confirmed TSD receipts missing from deposit history

## Summary and reproduced cause
The deposit-history reader called `omni_gettransaction` as a batch at the node root. The live TEXITcoin node replied to both reported transactions: “Wallet file not specified (must request wallet RPC through /wallet/<filename> uri-path).” Individual Omni confirmation reads already used a wallet-specific path; deposit batches did not.

The reader silently skipped the failed Omni replies and could mark the history backfill complete. Previously recorded native TXC transactions could then stop later scans before missing TSD receipts were reached.

## Changes
- `rpc.server.ts`: optional wallet path on `rpcBatch`; omitted paths retain the original endpoint, request and response handling.
- `omni.server.ts`: share the existing wallet-path resolver with deposit-history reads. No change to transaction confirmation criteria or signing.
- `activity/deposits.server.ts`: wallet-scoped Omni batches; a recovery marker in the existing backfill JSON schedules historical rereads, passing already-known native transactions. Failed reads keep recovery incomplete; successful backfills are marked complete only after history rows save successfully. Existing history upserts remain idempotent.
- `activity/deposit-rules.ts`: failed batch entries do not masquerade as completed history, while valid entries can still be recorded.
- Regression tests and activity-area instructions document the behavior.

No migrations, authentication changes, permissions, deposit eligibility, available balances, trade amounts, signing, withdrawals or sending behavior changed. No signing operation was requested and no coins were sent. The root instructions file was left untouched because its existing size budget is exhausted.

## Verified real receipts
The existing normal `syncDeposits` function recovered the records; no direct/manual insert was used.

| Transaction | Confirmed TSD received | History label |
| --- | ---: | --- |
| `cbc94327bff9b47cf19bdd3c5e70993ec98628b395db8b59b7be30c3736a6ff0` | 1.2 | Seeds trade |
| `58098490dd0b746b26139feeb70e8350fb5f581021dcda96ba4c82cd02c55a06` | 1.3 | Ordinary deposit |

Both node replies were valid property-39 simple sends to the corresponding member's pocket, with positive confirmations. Subsequent database reads confirmed the exact TSD amounts, transaction IDs and labels. The native carrier output was not listed as a TXC deposit.

## Verification
- 1,748 tests passed, zero failures across 143 test files.
- Added tests for wallet-scoped batch endpoints, unchanged unscoped endpoints, the exact reported 1.2 TSD receipt and failed-batch recovery.
- Real-node reproduction failed before the fix; the fixed shared-path batch returned both real receipts.
- Bobby's signed-in Activity → Deposits showed real TSD rows and TXC explorer links after the existing checker ran.
- Mobile viewport 390 × 844: deposit rows/filter accessible; no horizontal page overflow.
- Existing “Include coins delivered by Seeds swaps and trades” filter remains unchanged: the 1.2 TSD trade receipt is visible with it enabled; the plain 1.3 TSD deposit needs no such filter.

## Review and remaining limitations
Independent review is required before publishing, followed by tester confirmation on the released update. The live QA report status was not changed.

History reads keep the existing bounded pagination and two-minute refresh interval. This change does not redesign the history pagination system or add history support to other chains. Recovery affects history records only, never funds or spending decisions.