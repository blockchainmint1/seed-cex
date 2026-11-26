# TON / TRON deposit access — audit handoff

Date: 2026-11-26. Baseline: `7a8de28c11f8b448f8b5b335d07d5fb68ff30b8f`.
Exact delivered commit appears in the shareable file's final section.
No publishing, migrations, secrets, sends or infrastructure changes.

## Request and diagnosis

Bobby asked why TON/TRON USDT networks show unavailable on Deposit, and asked to open them.

1. Deposit picker used the currently selected network's withdrawal blocker for every sibling network. When the coin needed a network selection first, no withdrawal query ran, so Seeds-sent TON/TRON networks could be labelled unavailable simply because no check had run. A sibling's blocker could also affect unrelated networks.
2. USDT-TRON had a blanket deposit prohibition unless its stage was `open`, even for admins/beta testers already allowed to send it back out. Owner reproduction: selecting TON provided Copy address, selecting TRON showed the blanket prohibition and no address.

## Changes

- `src/lib/account/deposit-options.ts`: keep TRON review-stage prohibition. At testers/open stage, use the existing authenticated per-member withdrawal blocker; only an explicit null clearance permits a Seeds-sent network. Unknown/omitted clearance, blocked member, missing link or absent pocket address still refuses. The TRON sender remains tester-stage. No broad public withdrawal or swap authorization changed.
- New pure `depositStates` in the same module computes each network's receive eligibility from its own blocker. An Ethereum/TON clearance cannot approve TRON or vice versa.
- `src/routes/_authenticated/account.balances.deposit.tsx`: issue the existing protected `getWithdrawals` read for each Seeds-sent network belonging to the chosen coin, using `useQueries`, existing withdrawal cache keys and 20-second refresh. Both network labels and the selected receive state use the same per-network map. Unknown checks show Checking rather than a false permanent unavailable label, and do not display a receive address until cleared.
- `src/lib/account/deposit-options.test.ts`, `src/lib/pockets/tron-usdt.test.ts`: add concrete cases for TON receive readiness, tester TRON receive access, non-tester refusal, missing/unknown readiness, no link/address and sibling isolation. Unchanged TRON send/swap gate tests still enforce testers-only access.
- Area AGENTS and roadmap reflect the member-specific deposit gate.

## Security impact / boundaries

The only widened receive access is for members already authorized by the existing server to withdraw USDT-TRON. That endpoint verifies role/stage, account freeze, wallet access/key/address, confirmed email where needed, authenticator/Telegram readiness and link timing. The browser cannot use this change to authorize a send. Transaction building, KMS, fee budgets, exact receipts, expiry, reservations, withdrawal codes and Telegram approvals are untouched.

This is not approval to open TRON-USDT withdrawals to every member. Native TRX has its existing support; native TON and TON USD₮ use their already-open stage from the prior batch. Monero/Zcash restrictions are unchanged.

Multiple authenticated status reads replace the selected-network-only read, but only for the currently chosen coin's Seeds-sent networks, not the whole catalog. Public unauthenticated reads were not introduced.

## Verification

- Before change, reproduced signed in as owner: TON receive available once selected, TRON-USDT blanket refusal.
- After change, signed-in real owner account: native TON, native TRX, USD₮ on TON and USDT on TRON each display Copy address. From USDT with no network selected, both network buttons finish as TON / TRON without unavailable labels; clicking TRON displays the receive address.
- Network-button-only screenshots inspected. No withdrawal/Security/sign-in screenshots, member addresses or credentials exported.
- Browser reported no page exceptions.
- Focused tests: **35 pass**. Full Bun suite: **1,730 pass, 0 fail**, 140 files. Latest automatic app validation: **build OK**.
- Ordinary-member TRON denial is tested through the unchanged rule and per-network blocker, not through a funded ordinary-member browser test.
- No new deposit or withdrawal was sent by the agent. Owner funds and any approval taps remain owner actions.
- Deposit leaf metadata remains app-specific; no new content route added.

## Review before publishing

Evaluate the shift from blanket tester deposit prohibition to member-specific sender readiness, sibling isolation and unknown-readiness refusal. Confirm the existing server blocker remains the authoritative source and all original send guards still apply. Requires independent review before publication; no published state was changed here.