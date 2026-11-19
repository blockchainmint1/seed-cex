# src/lib/help

- Help center content lives only in content.ts (guides + FAQ as plain data; **bold** is the only markup, links go in `links` so tests can check them); /help, /help/$slug and /help/faq render it, and /sitemap.xml lists every guide. help-content.test.ts ties quoted prices, limits and dates to their source modules (withdraw-limits, listing, fee-prep, ignite-registration, launch, market-order) and fails on links to missing pages. Why: a help page must never promise a number or a button the app doesn't have; when a flow changes, edit its guide and HELP_REVIEWED.
