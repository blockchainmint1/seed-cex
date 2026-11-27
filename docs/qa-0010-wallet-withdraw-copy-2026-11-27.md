# QA-0010 — HME Wallet withdrawal instructions

## Scope
Presentation-only correction on the Seeds withdrawal page and matching help article/FAQ. No signing, approvals, withdrawal eligibility, balance calculations, network support, database permissions or HME Wallet code changed.

## Verified source
Read-only HME Wallet snapshot: `b289540f`.
- `src/components/wallet/TradingPocketCard.tsx`: the trading-site panel offers **Move back** and **Revoke**, not a pocket Send form.
- `src/lib/seeds/pocket.ts`: `sweepPocket` attempts to move supported native coins to the main wallet, less fees; it does not transfer TSD, USDC or other tokens. Results may include skipped coins.

## Correction
- Removed impossible “Trading pocket → pick coin → Send” steps.
- Retained Seeds as the chosen-amount/outside-address withdrawal path.
- Explained Move back’s all-supported-native-coins scope and main-wallet destination.
- Warned that tokens and unsupported chains are not moved, that native fee money must remain for token withdrawals, and that revocation must wait until coins that need Seeds have left.
- Corrected the swap-only fallback: swap to TSD, then withdraw TSD through Seeds, not an imaginary HME pocket Send button.
- Updated matching help and withdrawal metadata. Deposits and sending behavior are unchanged.

## Verification
- Existing help checks: 14 tests passed.
- Preview build: OK.
- Bobby’s signed-in TXC withdrawal page: expanded the corrected Move back section and checked the wallet link and warnings; no withdrawal requested.
- Phone-size check (390 × 844): section accessible, no horizontal page overflow.
- Matching public help guide rendered correctly.
- No screenshots taken on the private withdrawal page.

## Review and release
Independent review is required before publishing. QA-0010 remains awaiting tester confirmation after release; no status was changed in the live QA records. No funded transaction is needed to validate this copy-only change, and none was requested.