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
