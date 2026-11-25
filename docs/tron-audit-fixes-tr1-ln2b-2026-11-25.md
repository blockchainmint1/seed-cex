# USDT on TRON audit follow-up: testers stage, TR1, LN2b, TR2/TR3 wording (2026-11-25)

Responds to `seeds-usdt-tron-review-2026-11-25.md` (reviewed 6e579c9..a16f5eb). Owner approved all four items.

- **Stage → testers** (`tron-usdt.ts` `tronUsdtStage`): withdrawals and swaps open to beta testers (incl. admins) only. **Deposits stay closed until `open`** (`deposit-options.ts`), so a non-tester can never make a one-way deposit; testers fund via their TRX address (same 1106/0/0 pocket).
- **TR1** (`tron-usdt.server.ts` `usdtTronTxStatus`): when recorded `expiresAt` + 60 s has passed, two distinct finalized hosts each return empty objects for both `gettransactioninfobyid` and `gettransactionbyid`, and each host's `/walletsolidity/getnowblock` timestamp is past expiry + 60 s, the row closes as failed. Missing expiry evidence, any non-empty answer, a lagging solid node or host disagreement stays unknown. Tests in `tron-usdt.server.test.ts`.
- **LN2b**: EVM withdrawals (`withdraw/send.server.ts`) and pocket-send trade legs (`pocket-send/pocket.server.ts`) now hold `withEvmSignLock(chain, from)` from nonce read through broadcast, same lease as the swap engines.
- **TR2/TR3**: wording only. The 100 TRX ceiling is unchanged; its message now explains first-time-recipient cost. An unactivated TRON account (empty `getaccount`) now says the pocket needs TRX first.

Checks: typecheck, 1,700 tests pass. No funded TRON send run yet.
