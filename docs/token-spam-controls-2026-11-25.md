# Seeds token spam controls — auditor handoff

## Scope
Account → Balances now defaults to hiding all unverified Ethereum/Base tokens, including suspicious names and impersonated symbols. Listed swap tokens and main supported coins remain visible. A searchable Spam / hidden list lets the member restore, hide, mark as spam, or remove a token from balances.

“Remove” is a persistent display dismissal, not a burn or transfer. Removed tokens remain recoverable in Spam / hidden. The member's choices are scoped to their signed-in account in this browser's local storage; they do not sync between devices. No shared/global spam registry or administrative blocklist was introduced.

## Security boundaries
- Existing authenticated own-address guard and IP rate limits remain unchanged on getEvmTokenRows.
- The display read now calls tokenRows with includeSuspicious=true. The default helper behavior still excludes suspicious tokens for any other callers.
- Unknown and suspicious contracts are display-only, never swappable, including after restore. Main balance calculations, valuations, reservations, withdrawals, approvals and signing are unchanged.
- Contract names remain React text, never HTML or clickable URLs. Names are capped; unknown decimals display no numerical balance; invalid contracts/raw amounts are excluded.
- Choices are keyed by chain and lowercase contract, never symbol. Saved data is validated and never treated as evidence of token trust or spendability.
- SSR renders the safe default; browser preferences load after hydration. Storage failures show an explicit save warning, and changes in another tab are reconciled.
- No migration, new permission, private key handling or external script.

## Files to review
- src/lib/account/token-visibility.ts and token-visibility.test.ts
- src/lib/account/erc-tokens.ts and erc-tokens.test.ts
- src/lib/evm.functions.ts
- src/components/account/use-token-visibility.ts
- src/routes/_authenticated/account.balances.index.tsx
- src/lib/account/AGENTS.md and roadmap.md

## Verification
- Full Bun suite: **1,707 passed, 0 failed**, 136 files.
- Focused token rules: **14 passed**, including default hiding, explicit restore, manual hiding/spam/removal independent of the default toggle, network-specific persistence, invalid saved data, and suspicious rows remaining display-only.
- Preview build log: build OK. No manual build/typecheck was run.
- Signed-in browser check with the owner's actual held NIZA token: default-hidden → restore → mark spam → remove → reload confirms removal persists → restore. No money moved.
- Desktop screenshots confirmed the hidden list and controls. Mobile viewport 390 × 844 had no horizontal page overflow. No runtime errors observed.

## Limitations and release
This is conservative filtering, not proof that a token is malicious or safe. Unknown-token discovery currently covers Ethereum and Base only, as before. Local choices can be lost by clearing browser storage. Independent review is required before publishing; this batch was not published.