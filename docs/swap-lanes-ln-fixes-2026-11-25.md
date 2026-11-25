# Audit LN1 / LN2 / LN5 fixes — several swaps at once (2026-11-25)

Follow-up to the review of 6e579c9. LN3/LN4 are records only (no change).

## LN1 — USDC on Ethereum handed through by TSD steps
- `src/lib/swap/lanes.ts`: `OpenSwap` gains optional `passes` — coins a swap only hands through by exact amount.
  TSD routes pass `ETH:0xa0b8…eb48` (`TSD_PASSES`); a chain passes it until step 1 is over (`hypeChainPasses`: none once `mid|leg2|mid2|leg3`).
- `laneBlocker`: a pass conflicts only with a *watching* swap that has that coin as a lane. Passes never conflict with passes
  or with exact-amount swaps, so TSD+TSD and TSD→BTC beside a chain to USD₮ on TON stay allowed; a two-step through USDC
  is refused beside a TSD route or a chain still on step 1, and vice versa.
- Wired in `lanes.server.ts` (open rows) and the TSD route / chain start calls. Tests in `lanes.test.ts`.

## LN2 — one EVM send at a time per pocket, across engines
- Migration `0119_evm_sign_locks`: lease table `evm_sign_locks(lock_key, token, expires_at)` + `claim_evm_sign_lock` /
  `release_evm_sign_lock` (security definer, service_role only, TTL 1–300 s). Same pattern as `pocket_spend_locks`.
- `src/lib/evm/sign-lock.server.ts` `withEvmSignLock(chain, address, fn)`: key `chain:address`, 90 s lease, waits up to 20 s,
  else throws `EvmSignBusy` **before anything is signed** (the engine retries next tick; nothing recorded).
- Held from nonce fetch through broadcast in: THORChain/Maya EVM+ERC-20 send (`xchain/send.server.ts`, incl. approve steps),
  TSD route USDC transfer to TSD Bridge (`tsd-route.server.ts`), pool swap approvals and swap (`dex/swap.server.ts`),
  Relay deposit (`relay/relay.server.ts`). Record-before-broadcast, never-re-sign and the refusal handling are unchanged.
- Not wrapped (outside swaps, unchanged): withdrawals, pocket-send trades, EVM settlement, Seeds' own gas wallet (different address).

## LN5 — TSD in flight
- `tsdInFlight` counts every open buy route with a recorded `tsd_txid`, not only stage `bridging`.
- The rebroadcast caveat stays a team note: the "cancelled by another send" wording only appears after TSD Bridge has given up.

Tests: 213 pass across swap/xchain/dex/relay/hype-chain suites; typecheck clean.
