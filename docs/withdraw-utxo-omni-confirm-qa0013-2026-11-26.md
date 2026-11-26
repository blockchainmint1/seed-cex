# QA-0013 — TXC/ISK/LTC/TSD withdrawals stuck at "Sent – confirming"

Cause: the confirmation sweep in `advanceWithdrawals` only checked evm/xlm/ton/sui/ton_usdt/tron_usdt, so utxo and omni rows never moved to `confirmed`.

Fix (display/status only — no signing, sending or amounts touched):
- `txStatus` (send.server.ts): `utxo` → `confirmationsFor` (node / LTC book); unknown to the node returns null (keep waiting, never fail). `omni` → `fetchOmniTx`; unmined → pending, mined + `valid === false` → failed, otherwise success.
- Sweep kind list adds `utxo`, `omni`. Confirmed at ≥1 confirmation (existing non-EVM rule).
- Other kinds (btc, doge, bch, xrp, trx, sol, ada, xmr) still have no status checker and stay "Sent" — unchanged, separate follow-up.
