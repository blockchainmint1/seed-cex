<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- HME Wallet trading links (hm-link-delegate) live in src/lib/hme-link.server.ts + src/routes/api/public/hme-link/*; always trust the account/paths the wallet submits (pockets rotate 1106→2105), never assume 1106. Why: wallet retires pockets on revoke.
- P2P marketplace logic lives in src/lib/p2p.server.ts (lock + watch: reserve against the live trading-pocket balance, flag if it drops; release via withdrawAsset). Why: Seeds never takes custody, so safety comes from on-chain checks and seller score.
- Account is the canonical HME trading-pocket and settings surface; /wallet redirects there while legacy vault code stays intact for existing data. Why: avoid presenting Seeds as a standalone wallet or deleting prior funds/access records.
- HME pocket receive addresses derive public child 0/0 from the wallet-submitted account xpubs; display native balances separately from settlement assets. Why: pocket rotation must not reuse static legacy derivation paths or mislabel trading liquidity.
- HME authentication helpers live in hme-auth.server.ts; verify ticket issuer/site, single-use nonce and expiry, send the Seeds site header, and resolve local accounts by the uniquely indexed hm_member_id before updating contact email. Why: credentials are site-bound and email changes must never merge or recreate accounts.
- Test files (*.test.ts) are excluded from the app tsconfig and run with `bun test`; never install @types/bun. Why: Bun globals override Workers fetch types and break the app typecheck.
- orders/trades/escrows/profiles are server-written only (no client INSERT/UPDATE grants); leg amounts are derived from immutable trade terms. Why: audit C1/C3 — settlement must never trust browser-editable rows.
- Every key-spending path goes through src/lib/settle-guard.server.ts (cumulative cap reserve, single claim per leg, payer-only send) and autosettle preflights both legs before sending anything. Why: audit C2/H2/H6.
- Ignite registration lives in src/lib/ignite.functions.ts + nectarpay.server.ts; rows are server-written, seats are confirmed only by a signed NectarPay invoice.confirmed webhook re-checked against the invoice API. Why: payment state must never come from the browser.
