# Auditor note — USD₮ on TON + STON.fi TON→USD₮ (2026-11-25)

Scope (testers only; general members blocked by edSendStage "testers"):
1. Relay ETH→TON and TSD/coin→ETH→TON (one tap) — see docs/relay-ton-payouts-2026-11-25.md (commit 38fbd09).
2. USD₮ (Tether jetton) on TON: Balances row, deposit network, withdrawal kind `ton_usdt`.
3. TON→USD₮ swap on STON.fi v1 inside the member's own TON pocket.

Files: src/lib/pockets/ton-jetton.ts (+test), ton-usdt.server.ts, ton-tx.ts (optional Seeds-built body, bounceable), ed-send.server.ts (signAndSendTon refactor shared by native TON), src/lib/ston/*, withdraw catalog/rules/send/withdraw.server, deposit-options, pockets.functions, use-pocket, swap plan/page, TonUsdtResult. Migration 0107 (guard_withdrawal_send_meta accepts USDT/ton with TON evidence; txid freeze by chain; ton_swaps table, server-only, write-once).

Please check:
- Pinned addresses (USD₮ master EQCxE6…_sDs, STON router EQB3nc…TiUt, pTON wallet EQARUL…GH6aC, router USD₮ wallet EQBO7J…G9KQR) — router USD₮ wallet was derived identically by toncenter and TONAPI get_wallet_address.
- Swap body matches STON.fi SDK 2.7.0 RouterV1.getSwapTonToJettonTxParams / PtonV1 (read from the published package source). value = offer + 0.185 TON.
- USD₮ transfer: TEP-74, 0.05 TON attached, response = own pocket, forward 1 nanoton, no payload/comment. Destination must be a plain TON address; comment-required deposit addresses are not supported.
- Delivery: usdtTraceStatus walks TONAPI trace root → own jetton wallet → destination jetton wallet with jetton_internal_transfer of exact amount. TONAPI field names were not checked against a live USD₮ trace yet.
- Swap completion uses USD₮ balance delta vs baseline; an unrelated incoming USD₮ could mark it done early (no funds risk). STON.fi refunds are not detected automatically — after 30 min the row turns "unknown" for manual look. A swap may spend TON earmarked for a held TON withdrawal; that withdrawal then fails "not enough" (nothing lost).
- Own-pocket swap has no Telegram tap per Bobby's HC2 decision.

Verified: 1,562 tests pass; typecheck clean; live reads of USD₮ wallet/balance on both TON servers and STON.fi quote; Swap page shows 5 TON ≈ 4.59 USD₮. No transaction signed or sent.
