# Balances Swap links now open the swap form filled in — auditor note

**Date:** 2026-11-25
**Commit:** `056174c261f9698960ca532663414dfa345e3eb7`
**Requested by:** Bobby — "the swap link in the balances needs to go to the swap page with the default route already filled in, like from TSD to USDT on TON for this link"

## What changed

1. **New pure module `src/lib/account/swap-link.ts`** (with `swap-link.test.ts`, 12 tests).
   It turns a Balances row (coin symbol + network id) into the swap side the swap form
   understands, then picks the pair Seeds can actually plan (via `planSwap` in
   `src/lib/swap/plan.ts`):
   - you hold some of it and a route back to TSD exists → `from = coin, to = TSD`;
   - otherwise a TSD → coin route exists → `from = TSD, to = coin`;
   - TON you hold → `TON → USDT_TON` (its only swap);
   - USD₮ on TON → `TSD → USDT_TON` (the pair the member means; the form explains the
     one extra step);
   - no planned pair (TXC, ISK, ZCU, XMR, PulseChain coins, HEX, Stellar, the TSD row
     itself, tokens with no route) → **no pair**, so the row keeps its plain `/swap` link.
2. **`src/routes/_authenticated/account.balances.index.tsx`** — the four row Swap links
   (mobile list + desktop table, main rows + token rows) and the "swap back to TSD"
   stranded-coin note now use a `SwapLink` component that carries the pair in the URL
   search (`/swap?from=…&to=…`). Nothing else on the page changed; the `NO_SWAP`
   coin list is untouched.
3. **`src/routes/swap.tsx`** — when the form is opened on a pair that ends in USD₮ on TON
   (which has no direct route), the existing planner message is now followed by a
   **"Start with TSD → TON"** button that fills the form with the first leg. No quoting,
   reserving, signing or sending code was touched.

## Verified

- `bun test`: 1,601 pass / 0 fail (127 files); `oj typecheck -b --noEmit`: clean; build log: `build OK`.
- Live preview as the project owner (signed-in session), `/account/balances`:
  - `USDT | TON` → `/swap?from=TSD&to=USDT_TON` (the exact pair asked for)
  - `TON | TON` → `/swap?from=TSD&to=TON`
  - `HYPE | HyperEVM` → `/swap?from=TSD&to=HYPE`
  - `BTC`, `ETH (Ethereum)`, `USDC (Ethereum)`, `LTC` → `…&to=TSD` (held, so sell direction)
  - `USDT (Ethereum)` → `/swap?from=TSD&to=USDT` (zero balance, so buy direction)
  - `TSD`, `TXC`, `ISK`, `ZCU`, `XMR`, `ADA`, `AVAX`, `BNB`, `ETH/USDC/USDT on Base`,
    `USDC on BNB Chain` → plain `/swap` (no planned pair); `PLS`, `HEX`, `pHEX`, `XLM` → no link (as before).
- `/swap?from=TSD&to=USDT_TON` shows the "Get TON first…" message and the new button;
  tapping it fills the form with TSD → TON and a route appears.
- `/swap?from=TSD&to=TON` opens with TSD sent, TON received, route shown.

## Security assessment

- No money path was added or changed: no quoting, reserve, cap, Telegram, KMS, signing
  or broadcast code was modified. The swap form's own `validateSearch` still decides what
  a URL may ask for, and it rejects anything that is not a known side.
- A link can never offer a pair the planner can't quote (asserted by test), so the form
  never shows a fake route.
- The new module is pure and client-safe: it reads only the coin catalogs and the
  planner; it holds no member data, no keys and no addresses.

## Open item (not built here)

One-tap `TSD → USD₮ on TON` (TSD → ETH → TON → USD₮, three legs, Seeds running the
second leg after the first lands) is not implemented; it would need new stage-machine
work in the two-step/STON area and its own audit. Bobby was asked whether to build it.
