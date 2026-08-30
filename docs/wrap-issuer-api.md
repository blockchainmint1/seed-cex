# Wrap Desk — Issuer API Spec (what Seeds needs from TSD Swap)

Seeds is a **client only**. It holds no issuer key, never mints or burns, and
never touches the BTC reserve. All issuance authority stays on the TSD Swap side.

## Auth

Every call: `x-api-key: <key>` (issue Seeds one partner key, same hashed-key
scheme as the existing `/api/public/v1/cashout/*` routes).
Base URL is configured on Seeds as `WRAP_ISSUER_URL`.

## Endpoints

### `GET /api/public/v1/wrap/assets`
Returns supported wrappable assets and live desk health.

```json
{
  "online": true,
  "assets": [
    {
      "asset": "BTC",
      "wrapped": "wBTC",
      "decimals": 8,
      "minAmount": 0.0005,
      "confirmations": 2,
      "reserve": 1.2345,
      "supply": 1.2345,
      "paused": false
    }
  ]
}
```

### `POST /api/public/v1/wrap/orders`
```json
{
  "direction": "wrap" | "unwrap",
  "asset": "BTC",
  "amount": 0.01,
  "payoutAddress": "…",
  "refundAddress": "…",
  "reference": "<Seeds order uuid — use for idempotency>"
}
```
- `wrap`: issuer returns a **BTC deposit address**; `payoutAddress` is the
  user's TEXITcoin shared trading address where wBTC should be granted.
- `unwrap`: issuer returns a **TXC/Omni deposit address** to receive the wBTC
  being burned; `payoutAddress` is the user's BTC address for the release.
- Re-posting the same `reference` must return the same order, not a new one.

### `GET /api/public/v1/wrap/orders/{id}`
Same order shape as the POST response.

## Order shape (both endpoints)

```json
{
  "id": "issuer-order-id",
  "status": "awaiting_deposit",
  "depositAddress": "…",
  "payoutAddress": "…",
  "amountExpected": 0.01,
  "amountReceived": null,
  "amountDelivered": null,
  "depositTxid": null,
  "deliveryTxid": null,
  "expiresAt": "2026-09-01T00:00:00Z",
  "error": null
}
```

Status values Seeds understands (anything else maps to `created`):
`awaiting_deposit | pending | open`,
`deposit_detected | detected | seen`,
`deposit_confirmed | confirmed`,
`processing | minting | burning | releasing | issuing`,
`complete | completed | minted | released | settled`,
`failed | error | cancelled`, `expired | timeout`.

Seeds polls `GET /orders/{id}` — no webhook required, though one is welcome later.

## Non-negotiables

1. **Mint only after N confirmations of the real deposit.** Never on order
   creation or on any signal from Seeds — Seeds cannot prove funds arrived.
2. **Burn before release** on unwrap; two-phase, same as the existing TSD burn path.
3. **1:1 invariant with auto-pause**: `wBTC supply <= BTC reserve`. If the
   invariant breaks, pause minting and report `paused: true` on `/assets`.
4. **Public reserve attestation** for BTC/wBTC, same signed format as TSD's,
   so Seeds can link it from `/proof`.
5. Cold/multisig reserve and issuer keys; hot balance only for redemption float.

## New work on the TSD Swap side

- Bitcoin mainnet support (there is none today — the `bitcoinjs-lib` usage is
  TXC-only): deposit address derivation, mempool/confirmation watcher, reserve
  spend path for releases.
- A new Omni property on TEXITcoin for wBTC (8 decimals, managed/divisible,
  same issuer pattern as TSD #39).
- Generalize the bridge order state machine so `asset` is a parameter rather
  than the current TSD-destination assumption.
- Extend reserves/attestation modules past their EVM-token assumptions to cover
  a UTXO reserve.

## Then on Seeds

Set `WRAP_ISSUER_URL` and `WRAP_ISSUER_API_KEY` and the wrap desk on `/wallet`
goes live. Registering wBTC as a tradable asset needs the Omni property ID.
