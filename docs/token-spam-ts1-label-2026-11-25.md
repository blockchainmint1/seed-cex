# Seeds — token spam controls: TS1 fix (suspected-spam rows hide the token's own lure text)

Date: 2026-11-25
Base commit reviewed by the auditor: `64e977a` (spam controls) on top of `df6db92` (TRON testers stage, TR1, LN2b).
This change: display-only. No migration, no server change, no coin movement, no new trading permission.

## What the auditor asked for (TS1, Info)

Airdropped spam tokens put a phishing lure in their own text ("Visit claim-something.com").
TS1 asked that a suspected-spam row not print that lure.

## What the code actually did

The row never printed the token's `name` — `name` is used only by the page's own search filter.
What the row did print, for every token including suspected-spam ones, was the token's `symbol`,
and a junk token is free to make its symbol the lure ("VISIT-CLAIM-X.COM"). The `aria-label`
of the restore / hide / spam / remove buttons repeated that same symbol.

## What changed

`src/lib/account/token-visibility.ts` (pure, browser-safe):
- `SPAM_ROW_LABEL = "Suspected spam token"` — the neutral label.
- `showsTokenSymbol(t, revealed)` — a suspected-spam token's raw symbol is shown only when the
  member has asked for it; every other token is unchanged.
- `tokenAriaName(t)` — tooltip and screen-reader text uses the short contract for a suspected-spam
  token, never its own lure text.

`src/routes/_authenticated/account.balances.index.tsx`:
- New `TokenName` component used by both the mobile list and the desktop table: a suspected-spam
  row shows `Suspected spam token` plus a `show name` button; clicking it reveals the token's own
  symbol as plain text. Rows with no token (the "Re-link to add" extras) and non-spam tokens are
  rendered exactly as before.
- `TokenActions` buttons now label themselves with `tokenAriaName(token)`.

Unchanged on purpose: hiding, restoring, marking as spam, removing, the per-account browser
storage rules and validation, the "no Swap link for unverified tokens" rule, and every balance,
valuation, set-aside, withdrawal, approval and signing path.

## Checks

- `bun test` full suite: 1,708 pass, 0 fail, 136 files (includes the new TS1 test in
  `src/lib/account/token-visibility.test.ts`, which asserts the neutral label, that the raw symbol
  needs a reveal, and that no tooltip/screen-reader text carries the lure).
- Typecheck clean; build OK.
- Signed-in browser check of the real page: the hidden list renders correctly (one unverified
  token, "Not checked by Seeds", restore / mark-as-spam / remove buttons, no Swap link).
- Not seen on screen: a suspected-spam row. The owner's pocket holds no token that Seeds flags as
  spam, and attempts to inject a fake one into the page's token read only broke that read
  (the server function's serialized response is not plain JSON), so the new label path is covered
  by the unit test and typecheck, not by a live screenshot.
