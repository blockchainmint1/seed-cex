import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEvmTokenRows } from "@/lib/evm.functions";
import { shortContract } from "@/lib/account/erc-tokens";
import { DEPOSIT_ASSETS } from "@/lib/account/deposit-options";
import type { TokenRow } from "@/lib/account/erc-tokens";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Search, Eye, EyeOff, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/use-session";
import { useTokenVisibility } from "@/components/account/use-token-visibility";
import { hiddenReason, type TokenChoice } from "@/lib/account/token-visibility";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { HmeWalletLinkCard } from "@/components/wallet/HmeWalletLinkCard";
import { fmtCoin, fmtUsd, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { Arriving } from "@/components/account/Arriving";
import { revokeCheck, listCoins } from "@/lib/pockets/hme-support";
import { rowKey, useSetAsides } from "@/components/account/use-set-asides";
import { swapPairForCoinSymbol, swapPairForToken, swapPairForRow, type SwapPair } from "@/lib/account/swap-link";

/** Coins with no THORChain/Maya pool: trade them on their Seeds TSD market instead. */
const NO_SWAP = new Set(["PLS", "HEX", "pHEX", "XLM", "SUI"]);
const PAGE = 25;
const CHAIN_LABEL = { ethereum: "Ethereum", base: "Base" } as const;

type Extra = { key: string; symbol: string; network: string; kind: "token" | "relink"; balance: number | null; token?: TokenRow };

export const Route = createFileRoute("/_authenticated/account/balances/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Spot balances — Seeds" },
      { name: "description", content: "Every coin in your HME trading pocket, with live balances, USD estimates and one-tap deposit, withdraw, trade and swap." },
      { property: "og:title", content: "Spot balances — Seeds" },
      { property: "og:description", content: "Live balances of your HME trading pocket on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpotBalances,
});

function SpotBalances() {
  const { user } = useSession();
  const { prefs, setHideSpam, choose } = useTokenVisibility(user?.id);
  const [showHidden, setShowHidden] = useState(false);
  const link = usePocketLink();
  const l = link.data;
  const { rows, total, unpriced, balances, refreshNow } = usePocketBalances(l?.addresses, l?.id);
  const held = useSetAsides(rows, Boolean(l));
  const [hideZero, setHideZero] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const tokenRead = useServerFn(getEvmTokenRows);
  const evm = l?.addresses?.["EVM"];
  const tokens = useQuery({
    queryKey: ["erc20-rows", evm],
    enabled: Boolean(evm),
    staleTime: 60_000,
    refetchInterval: 180_000,
    queryFn: () => {
      if (!evm) throw new Error("Link your trading pocket first.");
      return tokenRead({ data: { address: evm } });
    },
  });
  useEffect(() => setPage(0), [q, hideZero, showHidden, prefs.hideSpam]);

  if (link.isPending) return <p className="text-sm text-muted-foreground">Checking your trading pocket…</p>;
  if (!l)
    return (
      <div className="space-y-4">
        <TabTitle title="Spot balances" desc="Balances show here once your HME Wallet trading pocket is linked." />
        <HmeWalletLinkCard showBalances={false} />
      </div>
    );

  const term = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (showHidden) return false;
    if (hideZero && !((r.balance ?? 0) > 0) && !(r.arriving > 0)) return false;
    if (!term) return true;
    return [r.asset.symbol, r.asset.name, r.net.label].some((s) => s.toLowerCase().includes(term));
  });
  const have = new Set(rows.map((r) => `${r.asset.symbol}-${r.net.id}`));
  const extras: Extra[] = [
    ...(tokens.data ?? []).map((t): Extra => ({ key: `tok-${t.chain}-${t.contract}`, symbol: t.symbol, network: `${CHAIN_LABEL[t.chain]} · ${t.swappable ? "token" : `token ${shortContract(t.contract)} · ${t.suspectedSpam ? "suspected spam" : "not checked by Seeds"}`}`, kind: "token", balance: t.balance, token: t })),
    ...DEPOSIT_ASSETS.flatMap((a) => a.networks.filter((n) => !have.has(`${a.symbol}-${n.id}`)).map((n): Extra => ({ key: `relink-${a.symbol}-${n.id}`, symbol: a.symbol, network: n.label, kind: "relink", balance: null }))),
  ];
  const extrasShown = extras.filter((x) => {
    const hidden = x.token ? hiddenReason(x.token, prefs) !== null : false;
    if (hidden !== showHidden) return false;
    if (!showHidden && hideZero && !((x.balance ?? 0) > 0)) return false;
    if (!term) return true;
    return [x.symbol, x.network, x.token?.name ?? "", x.token?.contract ?? ""].some((s) => s.toLowerCase().includes(term));
  });
  const hiddenCount = (tokens.data ?? []).filter((t) => hiddenReason(t, prefs) !== null).length;
  type Item = { main: (typeof shown)[number] } | { extra: Extra };
  const all: Item[] = [...shown.map((r) => ({ main: r })), ...extrasShown.map((x) => ({ extra: x }))];
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const pageItems = all.slice(cur * PAGE, cur * PAGE + PAGE);
  const pageMain = pageItems.flatMap((i) => ("main" in i ? [i.main] : []));
  const pageExtra = pageItems.flatMap((i) => ("extra" in i ? [i.extra] : []));
  const extraNote = (x: Extra) => x.kind === "relink" ? "Re-link your wallet to add" : null;

  const stranded = revokeCheck(rows.filter((r) => r.net.pocket === r.asset.symbol).map((r) => ({ coin: r.asset.symbol, balance: r.balance }))).stranded;

  /** The pair this row's Swap link opens the form on (null = the plain Swap page). */
  const swapPair = (r: (typeof rows)[number]) =>
    swapPairForRow(r.asset.symbol, r.net.id, Math.max(0, (r.balance ?? 0) - (held.byRow[rowKey(r)] ?? 0)));
  const tokenPair = (x: Extra) => (x.token ? swapPairForToken(x.token.chain, x.token.contract, x.balance ?? 0) : null);
  const strandedPair = stranded.length ? swapPairForCoinSymbol(stranded[0]!.coin) : null;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Estimated value</p>
            <p data-qa-mask className="num mt-1 font-display text-3xl font-extrabold">{balances.isPending ? "…" : fmtUsd(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pocket #{l.account} · confirmed on-chain balances · live market prices, TSD at $1{unpriced ? " · coins without a price aren't counted" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link to="/account/balances/deposit"><ArrowDownToLine /> Deposit</Link></Button>
            <Button asChild variant="outline"><Link to="/account/balances/withdraw"><ArrowUpFromLine /> Withdraw</Link></Button>
            <Button variant="ghost" disabled={balances.isFetching} onClick={() => void refreshNow()}>
              <RefreshCw className={balances.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /> {balances.isFetching ? "Syncing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

      {rows.some((r) => r.arriving > 0) ? (
        <Note>
          Coins marked <strong>arriving</strong> are on their way to your pocket but aren't in a block yet. They show in your balance once they're
          confirmed — usually within minutes, longer if the sender paid a very low network fee. Until then they can't be traded, swapped or withdrawn,
          and they aren't counted in your estimated value.
        </Note>
      ) : null}

      {held.any ? (
        <Note>
          Some coins are <strong>in trades</strong>: set aside for your open orders, trades being paid, P2P sales, or withdrawals and swaps waiting for your approval (going out). They stay in your pocket, but Seeds
          won't withdraw, swap or promise them to another order until the order is cancelled or the trade finishes. If they leave your pocket another
          way (for example from HME Wallet), Seeds cancels the newest orders they no longer cover and tells you.{" "}
          <Link to="/activity" className="text-primary underline">See your open orders</Link>
        </Note>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search coins</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coin or network" className="w-full rounded-sm border border-border bg-background py-2 pr-3 pl-9 text-sm outline-none focus:border-primary" />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={hideZero} onCheckedChange={(checked) => setHideZero(checked === true)} /> Hide zero balances
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={prefs.hideSpam} onCheckedChange={(checked) => setHideSpam(checked === true)} /> Hide spam tokens
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap gap-2" aria-label="Token lists">
          <Button variant={showHidden ? "ghost" : "secondary"} size="sm" aria-pressed={!showHidden} onClick={() => setShowHidden(false)}>Balances</Button>
          <Button variant={showHidden ? "secondary" : "ghost"} size="sm" aria-pressed={showHidden} onClick={() => setShowHidden(true)}><EyeOff /> Spam / hidden ({hiddenCount})</Button>
        </div>
        <p className="text-xs text-muted-foreground">Token choices saved in this browser · coins stay in your pocket</p>
      </div>

      <ul className="divide-y divide-border rounded-md border border-border md:hidden">
        {pageMain.map((r) => (
          <li key={`${r.asset.symbol}-${r.net.id}`} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold">{r.asset.symbol}</span>
                <span className="block text-xs text-muted-foreground">{r.net.label}</span>
              </div>
              <div data-qa-mask className="text-right">
                <span className="num block">{r.balance == null ? (balances.isFetching ? "Checking…" : "—") : fmtCoin(r.balance)}</span>
                <span className="num block text-xs text-muted-foreground">{fmtUsd(r.usd)}</span>
                <Arriving amount={r.arriving} />
                {held.byRow[rowKey(r)] ? (
                  <span className="num block text-xs text-muted-foreground">
                    In trades {fmtCoin(held.byRow[rowKey(r)]!)} · Available {r.balance == null ? "—" : fmtCoin(Math.max(0, r.balance - held.byRow[rowKey(r)]!))}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-primary">
              <Link to="/account/balances/deposit" search={{ coin: r.asset.symbol, network: r.net.id }}>Deposit</Link>
              <Link to="/account/balances/withdraw" search={{ coin: r.asset.symbol, network: r.net.id }}>Withdraw</Link>
              {r.asset.market ? <Link to={r.asset.market}>Trade</Link> : null}
              {NO_SWAP.has(r.asset.symbol) ? null : <SwapLink pair={swapPair(r)} />}
            </div>
          </li>
        ))}
        {pageExtra.map((x) => (
          <li key={x.key} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="break-all font-semibold">{x.symbol}</span>
                <span className="block break-words text-xs text-muted-foreground">{x.network}</span>
                {showHidden && x.token ? <span className="block text-xs text-muted-foreground">{hiddenReason(x.token, prefs)}</span> : null}
              </div>
              <div data-qa-mask className="text-right">
                <span className="num block">{extraNote(x) ?? (x.balance == null ? (tokens.isFetching ? "Checking…" : "—") : fmtCoin(x.balance))}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!showHidden && x.token?.swappable ? <span className="text-xs font-semibold text-primary"><SwapLink pair={tokenPair(x)} /></span> : null}
              {x.token ? <TokenActions token={x.token} hidden={showHidden} choose={choose} /> : null}
            </div>
          </li>
        ))}
        {!all.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{showHidden ? "No hidden tokens match." : hideZero ? "No visible coins with a balance match." : "No coins match."}</li> : null}
      </ul>

      <div className="hidden overflow-x-auto rounded-md border border-border md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2.5">Coin</th>
              <th className="px-3 py-2.5 text-right">Balance</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right">In trades</th>
              <th className="px-3 py-2.5 text-right">Available</th>
              <th className="px-3 py-2.5 text-right">Value</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageMain.map((r) => {
              return (
                <tr key={`${r.asset.symbol}-${r.net.id}`} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="font-semibold">{r.asset.symbol}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.net.label}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    {r.balance == null ? (balances.isFetching ? "Checking…" : "Not available") : fmtCoin(r.balance)}
                    <Arriving amount={r.arriving} />
                  </td>
                  <td data-qa-mask className="num px-3 py-2.5 text-right text-muted-foreground">{held.byRow[rowKey(r)] ? fmtCoin(held.byRow[rowKey(r)]!) : "—"}</td>
                  <td data-qa-mask className="num px-3 py-2.5 text-right">{r.balance == null ? "—" : fmtCoin(Math.max(0, r.balance - (held.byRow[rowKey(r)] ?? 0)))}</td>
                  <td className="num px-3 py-2.5 text-right text-muted-foreground">{fmtUsd(r.usd)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link to="/account/balances/deposit" search={{ coin: r.asset.symbol, network: r.net.id }} className="px-1 text-xs font-semibold text-primary hover:underline">Deposit</Link>
                    <Link to="/account/balances/withdraw" search={{ coin: r.asset.symbol, network: r.net.id }} className="px-1 text-xs font-semibold text-primary hover:underline">Withdraw</Link>
                    {r.asset.market ? <Link to={r.asset.market} className="px-1 text-xs font-semibold text-primary hover:underline">Trade</Link> : null}
                    {NO_SWAP.has(r.asset.symbol) ? null : <SwapLink pair={swapPair(r)} className="px-1 text-xs font-semibold text-primary hover:underline" />}
                  </td>
                </tr>
              );
            })}
            {pageExtra.map((x) => (
              <tr key={x.key} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5">
                  <span className="break-all font-semibold">{x.symbol}</span>
                  <span className="block break-words text-xs text-muted-foreground">{x.network}</span>
                  {showHidden && x.token ? <span className="block text-xs text-muted-foreground">{hiddenReason(x.token, prefs)}</span> : null}
                </td>
                <td data-qa-mask className="num px-3 py-2.5 text-right">
                  {extraNote(x) ? <span className="text-xs text-muted-foreground">{extraNote(x)}</span> : x.balance == null ? (tokens.isFetching ? "Checking…" : "Not available") : fmtCoin(x.balance)}
                </td>
                <td className="num px-3 py-2.5 text-right text-muted-foreground">—</td>
                <td data-qa-mask className="num px-3 py-2.5 text-right">{extraNote(x) || x.balance == null ? "—" : fmtCoin(x.balance)}</td>
                <td className="num px-3 py-2.5 text-right text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {!showHidden && x.token?.swappable ? <SwapLink pair={tokenPair(x)} className="px-1 text-xs font-semibold text-primary hover:underline" /> : null}
                    {x.token ? <TokenActions token={x.token} hidden={showHidden} choose={choose} /> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!all.length ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">{showHidden ? "No hidden tokens match." : hideZero ? "No visible coins with a balance match." : "No coins match."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav aria-label="Balance pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {cur * PAGE + 1}–{Math.min(all.length, cur * PAGE + PAGE)} of {all.length} coins
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</Button>
            <span className="num text-muted-foreground">Page {cur + 1} of {pages}</span>
            <Button variant="outline" size="sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</Button>
          </div>
        </nav>
      ) : null}
      {stranded.length ? (
        <Note tone="warn">
          You hold {listCoins(stranded.map((s) => s.coin))} in this pocket. HME Wallet can't hold {stranded.length > 1 ? "these coins" : "this coin"} —{" "}
          <SwapLink pair={strandedPair} className="text-primary underline">swap back to TSD</SwapLink> before you revoke Seeds' access.
        </Note>
      ) : null}
      {balances.isError ? <Note tone="error">Balances could not be synced. Refresh to retry.</Note> : null}
      {tokens.isError ? <Note tone="error">Token lists could not be synced. <Button variant="link" size="sm" onClick={() => void tokens.refetch()}>Retry</Button></Note> : null}
      <p className="text-xs text-muted-foreground">
        These are the coins at your trading pocket's own addresses — your HME Wallet holds the keys. Tokens on Ethereum and Base marked "not checked by Seeds" were found in your pocket but aren't on Seeds' list — check them before trusting their value. Stellar, TON and Sui deposits and withdrawals await security review and small live send tests.
      </p>
    </div>
  );
}

function TokenActions({ token, hidden, choose }: { token: TokenRow; hidden: boolean; choose: (token: TokenRow, choice: TokenChoice) => void }) {
  const actions = [
    { choice: hidden ? "show" : "hide", label: hidden ? "Restore token" : "Hide token", Icon: hidden ? Eye : EyeOff },
    { choice: "spam", label: "Mark as spam", Icon: ShieldAlert },
    { choice: "remove", label: "Remove from balances", Icon: X },
  ] as const;
  return <TooltipProvider>{actions.map(({ choice, label, Icon }) => (
    <Tooltip key={choice}>
      <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={`${label}: ${token.symbol}`} onClick={() => choose(token, choice)}><Icon /></Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ))}</TooltipProvider>;
}

/**
 * A row's Swap link: opens the swap form already filled in on the pair this coin can
 * actually do (sell what you hold to TSD, otherwise buy it with TSD), falling back to
 * the plain Swap page when Seeds has no planned pair for it.
 */
function SwapLink({ pair, className, children = "Swap" }: { pair: SwapPair | null; className?: string; children?: ReactNode }) {
  return pair ? <Link to="/swap" search={pair} className={className}>{children}</Link> : <Link to="/swap" className={className}>{children}</Link>;
}
