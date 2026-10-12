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
