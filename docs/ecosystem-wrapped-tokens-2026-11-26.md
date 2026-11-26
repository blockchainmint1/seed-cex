# Auditor note: wTXC / wISK / wZCU swap support (2026-11-26)
Scope: display/list change only. No new coin-moving code.
- src/lib/dex/ecosystem-tokens.ts: hardcoded Ethereum contracts — wTXC 0x9FC65df3997073B8551Ffd617154B5102fACbb88 (8 dp), wISK 0xFB38867D064Df981F159b886007F1273a346b0BB (8 dp), wZCU 0x61b1F4D5db2436C089593828C26F21e25c4A9C9d (18 dp), copied from the three Wrap projects.
- starters.ts: listed at the top of the Ethereum swap coin list. Swaps use the existing audited Uniswap path (re-quote, caps, Telegram tap, exact approval, own-pocket recipient).
- erc-tokens.ts: treated as listed (not "not checked"), and their symbols join the impostor list so look-alike tokens are flagged.
- Test: src/lib/dex/ecosystem-tokens.test.ts.
Check: confirm the three contract addresses match the issuers' published tokens.
