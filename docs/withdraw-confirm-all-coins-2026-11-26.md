# Withdrawal confirmations for every coin (follow-up to QA-0013)

Status display only. No change to how, when or whether coins are sent.

`txStatus` (src/lib/withdraw/send.server.ts) now answers for BTC, DOGE, BCH, XRP, TRX, SOL, ADA and XMR. Raw network answers are read by pure rules in `src/lib/withdraw/confirm-rules.ts` (tested in `confirm-rules.test.ts`). The withdrawal job no longer skips any coin kind.

| Coin | Source | Confirmed when | Failed only when |
|---|---|---|---|
| BTC/DOGE/BCH | NowNodes Blockbook `/tx` | ≥1 confirmation | never (keeps waiting) |
| XRP | `tx` on Seeds' XRPL servers | validated + tesSUCCESS | validated + tec* |
| TRX | `/walletsolidity/gettransactionbyid` | solidified SUCCESS | solidified with another result |
| SOL | `getSignatureStatuses` | finalized, no error | finalized with an error |
| ADA | Koios `tx_status` | ≥1 confirmation | never |
| XMR | watch wallet `get_transfer_by_txid` (no refresh, Monero lease, 5 s wait) | ≥10 confirmations (XMR_CONFIRMATIONS) | never |

Unreachable servers, missing transactions and unclear answers all return null = keep waiting. A "failed" mark already never re-sends anything.

Tests: 1,713 pass. Typecheck clean.
