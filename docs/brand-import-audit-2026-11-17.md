# Seeds /brand import — auditor handoff

## Scope
- Added the public `/brand` content page; no authentication, payments, trading, permissions, database or key-handling changes.
- Preserved the original 21-page supplied PDF through 1920 × 1080 WebP page renders and the downloadable original PDF, stored as CDN asset pointers.
- Added extracted document text for assistive technology and unique route metadata.
- Retained the existing site header/footer and provided a scrollable enlargement dialog for reading fine print on phones.
- Draft statements, mock balances and product examples remain part of the supplied document, not operational claims or implemented controls. No brand changes were applied elsewhere.

## Files
- `src/routes/brand.tsx`
- `src/assets/brand/*`
- `AGENTS.md`, `roadmap.md`
- This handoff

## Verification
- Preview build reports `build OK`.
- Browser at `/brand` found all 21 pages; every image successfully decoded.
- Original PDF returned HTTP 200 with `application/pdf`.
- Page enlargement opened successfully; mobile dialog permits horizontal scrolling at original image resolution.
- Desktop 1280 × 1800 and mobile 390 × 844 screenshots visually checked; mobile page has no horizontal overflow.
- First PDF-request check used a relative URL with the request client and failed; repeated with the localhost origin and confirmed success. No application change was needed.
- No new dependencies, server functions, external scripts or user-data collection.

## Review considerations
- Public brand document includes illustrative product flows that differ from current HME-only onboarding. Their source-document draft/illustrative labels are preserved.
- Page content is primarily images; extracted text is available to screen readers, while the PDF provides original-resolution access. On narrow screens enlargement is needed for small text.
- Existing site-wide HME/help scripts are unchanged and remain outside this import's scope.
- No publication performed. Third-party audit approval remains required before publication under workspace policy.