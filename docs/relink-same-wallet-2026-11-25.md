# Re-link confirms the same wallet + Telegram time backfill (2026-11-25)

1. `replaceProblem` (src/lib/hme-link-rules.ts, tested) now refuses an HME Wallet link whose key (xpub) for any already-linked coin differs from the active link (REFUSE_OTHER_WALLET). Checked in /api/public/hme-link/submit before the challenge is burned or the old link retired. Before this, a different HME Wallet on pocket 1106 with the same coins silently replaced the link. Coin/Vault/outside-wallet links were already held or refused (key-signin keysDiffer / keyLinkProblem).
2. Security tab shows a "Re-link HME Wallet" button at all times (uses the existing link request flow).
3. Security card's withdrawal state now uses the same `readinessFor` (2FA + Telegram) as the Withdraw page, so they can't disagree.
4. Migration 0113: for 21 profiles whose verified Telegram chat predates the `telegram_verified_at` column, set it to that chat's `second_factor_trust.added_at` (same chat id). Profiles triggers disabled only for this UPDATE. The rule "link must be newer than 2FA and Telegram" is unchanged.
Not changed: pocket-send (P2P/exchange legs) still use the 2FA-only `withdrawLinkStateFor`; those sends need a Telegram tap each time.
