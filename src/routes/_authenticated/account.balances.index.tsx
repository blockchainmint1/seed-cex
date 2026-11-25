import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEvmTokenRows } from "@/lib/evm.functions";
import { shortContract } from "@/lib/account/erc-tokens";
import { DEPOSIT_ASSETS } from "@/lib/account/deposit-options";
import type { TokenRow } from "@/lib/account/erc-tokens";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { HmeWalletLinkCard } from "@/components/wallet/HmeWalletLinkCard";
import { fmtCoin, fmtUsd, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { Arriving } from "@/components/account/Arriving";
import { revokeCheck, listCoins } from "@/lib/pockets/hme-support";
import { rowKey, useSetAsides } from "@/components/account/use-set-asides";

/** Coins with no THORChain/Maya pool: trade them on their Seeds TSD market instead. */
const NO_SWAP = new Set(["PLS", "HEX", "pHEX"]);
const PAGE = 25;
/** Coins Seeds is adding next; shown so members see the full list (no balance or actions yet). */
const COMING_SOON = [
  { symbol: "XLM", name: "Stellar" },
  { symbol: "TON", name: "Toncoin" },
  { symbol: "SUI", name: "Sui" },
];
const CHAIN_LABEL = { ethereum: "Ethereum", base: "Base" } as const;

type Extra = { key: string; symbol: string; network: string; kind: "token" | "relink" | "soon"; balance: number | null; token?: TokenRow };

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
    queryFn: () => tokenRead({ data: { address: evm! } }),
  });
  useEffect(() => setPage(0), [q, hideZero]);

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
    if (hideZero && !((r.balance ?? 0) > 0) && !(r.arriving > 0)) return false;
    if (!term) return true;
    return [r.asset.symbol, r.asset.name, r.net.label].some((s) => s.toLowerCase().includes(term));
  });
  const have = new Set(rows.map((r) => `${r.asset.symbol}-${r.net.id}`));
  const extras: Extra[] = [
    ...(tokens.data ?? []).map((t): Extra => ({ key: `tok-${t.chain}-${t.contract}`, symbol: t.symbol, network: `${CHAIN_LABEL[t.chain]} · ${t.swappable ? "token" : `token ${shortContract(t.contract)} · not checked by Seeds`}`, kind: "token", balance: t.balance, token: t })),
    ...DEPOSIT_ASSETS.flatMap((a) => a.networks.filter((n) => !have.has(`${a.symbol}-${n.id}`)).map((n): Extra => ({ key: `relink-${a.symbol}-${n.id}`, symbol: a.symbol, network: n.label, kind: "relink", balance: null }))),
    ...COMING_SOON.map((c): Extra => {
      const got = balances.data?.extra.find((x) => x.coin === c.symbol);
      return { key: `soon-${c.symbol}`, symbol: c.symbol, network: got ? `${c.name} · ${got.address.slice(0, 6)}…${got.address.slice(-4)}` : c.name, kind: "soon", balance: got?.balance ?? null };
    }),
  ];
  const extrasShown = extras.filter((x) => {
    if (hideZero && !((x.balance ?? 0) > 0)) return false;
    if (!term) return true;
    return [x.symbol, x.network, x.token?.name ?? ""].some((s) => s.toLowerCase().includes(term));
  });
  type Item = { main: (typeof shown)[number] } | { extra: Extra };
  const all: Item[] = [...shown.map((r) => ({ main: r })), ...extrasShown.map((x) => ({ extra: x }))];
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const pageItems = all.slice(cur * PAGE, cur * PAGE + PAGE);
  const pageMain = pageItems.flatMap((i) => ("main" in i ? [i.main] : []));
  const pageExtra = pageItems.flatMap((i) => ("extra" in i ? [i.extra] : []));
  const extraNote = (x: Extra) => x.kind === "soon" ? (x.balance != null ? null : "Coming soon") : x.kind === "relink" ? "Re-link your wallet to add" : null;

  const stranded = revokeCheck(rows.filter((r) => r.net.pocket === r.asset.symbol).map((r) => ({ coin: r.asset.symbol, balance: r.balance }))).stranded;

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
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> Hide zero balances
        </label>
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
              {NO_SWAP.has(r.asset.symbol) ? null : <Link to="/swap">Swap</Link>}
            </div>
          </li>
        ))}
        {pageExtra.map((x) => (
          <li key={x.key} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold">{x.symbol}</span>
                <span className="block text-xs text-muted-foreground">{x.network}</span>
              </div>
              <div data-qa-mask className="text-right">
                <span className="num block">{extraNote(x) ?? (x.balance == null ? (tokens.isFetching ? "Checking…" : "—") : fmtCoin(x.balance))}</span>
              </div>
            </div>
            {x.token?.swappable ? <div className="mt-2 text-xs font-semibold text-primary"><Link to="/swap">Swap</Link></div> : null}
          </li>
        ))}
        {!all.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{hideZero ? "No coins with a balance yet." : "No coins match."}</li> : null}
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
                    {NO_SWAP.has(r.asset.symbol) ? null : <Link to="/swap" className="px-1 text-xs font-semibold text-primary hover:underline">Swap</Link>}
                  </td>
                </tr>
              );
            })}
            {pageExtra.map((x) => (
              <tr key={x.key} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5">
                  <span className="font-semibold">{x.symbol}</span>
                  <span className="block text-xs text-muted-foreground">{x.network}</span>
                </td>
                <td data-qa-mask className="num px-3 py-2.5 text-right">
                  {extraNote(x) ? <span className="text-xs text-muted-foreground">{extraNote(x)}</span> : x.balance == null ? (tokens.isFetching ? "Checking…" : "Not available") : fmtCoin(x.balance)}
                </td>
                <td className="num px-3 py-2.5 text-right text-muted-foreground">—</td>
                <td data-qa-mask className="num px-3 py-2.5 text-right">{extraNote(x) || x.balance == null ? "—" : fmtCoin(x.balance)}</td>
                <td className="num px-3 py-2.5 text-right text-muted-foreground">—</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {x.token?.swappable ? <Link to="/swap" className="px-1 text-xs font-semibold text-primary hover:underline">Swap</Link> : null}
                </td>
              </tr>
            ))}
            {!all.length ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">{hideZero ? "No coins with a balance yet." : "No coins match."}</td></tr>
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
          <Link to="/swap" className="text-primary underline">swap back to TSD</Link> before you revoke Seeds' access.
        </Note>
      ) : null}
      {balances.isError ? <Note tone="error">Balances could not be synced. Refresh to retry.</Note> : null}
      <p className="text-xs text-muted-foreground">
        These are the coins at your trading pocket's own addresses — your HME Wallet holds the keys. Tokens on Ethereum and Base marked "not checked by Seeds" were found in your pocket but aren't on Seeds' list — check them before trusting their value. Stellar, TON and Sui show your balance, but deposits stay closed until Seeds can send them back out.
      </p>
    </div>
  );
}
