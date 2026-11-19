import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { HmeWalletLinkCard } from "@/components/wallet/HmeWalletLinkCard";
import { fmtCoin, fmtUsd, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { revokeCheck, listCoins } from "@/lib/pockets/hme-support";
import { withdrawRoute } from "@/lib/account/deposit-options";

/** Coins with no THORChain/Maya pool: trade them on their Seeds TSD market instead. */
const NO_SWAP = new Set(["PLS", "HEX", "pHEX"]);

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
  const { rows, total, unpriced, balances } = usePocketBalances(l?.addresses, l?.id);
  const [hideZero, setHideZero] = useState(false);
  const [q, setQ] = useState("");

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
    if (hideZero && !((r.balance ?? 0) > 0)) return false;
    if (!term) return true;
    return [r.asset.symbol, r.asset.name, r.net.label].some((s) => s.toLowerCase().includes(term));
  });
  const stranded = revokeCheck(rows.filter((r) => r.net.pocket === r.asset.symbol).map((r) => ({ coin: r.asset.symbol, balance: r.balance }))).stranded;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Estimated value</p>
            <p className="num mt-1 font-display text-3xl font-extrabold">{balances.isPending ? "…" : fmtUsd(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Pocket #{l.account} · confirmed on-chain balances · live market prices, TSD at $1{unpriced ? " · coins without a price aren't counted" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link to="/account/balances/deposit"><ArrowDownToLine /> Deposit</Link></Button>
            <Button asChild variant="outline"><Link to="/account/balances/withdraw"><ArrowUpFromLine /> Withdraw</Link></Button>
            <Button variant="ghost" disabled={balances.isFetching} onClick={() => balances.refetch()}>
              <RefreshCw className={balances.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /> {balances.isFetching ? "Syncing…" : "Refresh"}
            </Button>
          </div>
        </div>
      </Card>

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

      <ul className="divide-y divide-border rounded-md border border-border sm:hidden">
        {shown.map((r) => (
          <li key={`${r.asset.symbol}-${r.net.id}`} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="font-semibold">{r.asset.symbol}</span>
                <span className="block text-xs text-muted-foreground">{r.net.label}{withdrawRoute(r.net) !== "hme" ? " · not in HME Wallet" : ""}</span>
              </div>
              <div className="text-right">
                <span className="num block">{r.balance == null ? (balances.isFetching ? "Checking…" : "—") : fmtCoin(r.balance)}</span>
                <span className="num block text-xs text-muted-foreground">{fmtUsd(r.usd)}</span>
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
        {!shown.length ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{hideZero ? "No coins with a balance yet." : "No coins match."}</li> : null}
      </ul>

      <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 font-mono text-[11px] text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Coin</th>
              <th className="px-4 py-3">Network</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const route = withdrawRoute(r.net);
              return (
                <tr key={`${r.asset.symbol}-${r.net.id}`} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-semibold">{r.asset.symbol}</span>
                    <span className="block text-xs text-muted-foreground">{r.asset.name}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.net.label}
                    {route !== "hme" ? <span className="ml-2 whitespace-nowrap rounded-sm border border-warn/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground">Not in HME Wallet</span> : null}
                  </td>
                  <td className="num px-4 py-3 text-right">{r.balance == null ? (balances.isFetching ? "Checking…" : "Not available") : fmtCoin(r.balance)}</td>
                  <td className="num px-4 py-3 text-right text-muted-foreground">{fmtUsd(r.usd)}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Link to="/account/balances/deposit" search={{ coin: r.asset.symbol, network: r.net.id }} className="px-2 text-xs font-semibold text-primary hover:underline">Deposit</Link>
                    <Link to="/account/balances/withdraw" search={{ coin: r.asset.symbol, network: r.net.id }} className="px-2 text-xs font-semibold text-primary hover:underline">Withdraw</Link>
                    {r.asset.market ? <Link to={r.asset.market} className="px-2 text-xs font-semibold text-primary hover:underline">Trade</Link> : null}
                    {NO_SWAP.has(r.asset.symbol) ? null : <Link to="/swap" className="px-2 text-xs font-semibold text-primary hover:underline">Swap</Link>}
                  </td>
                </tr>
              );
            })}
            {!shown.length ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">{hideZero ? "No coins with a balance yet." : "No coins match."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {stranded.length ? (
        <Note tone="warn">
          You hold {listCoins(stranded.map((s) => s.coin))} in this pocket. HME Wallet can't hold {stranded.length > 1 ? "these coins" : "this coin"} —{" "}
          <Link to="/swap" className="text-primary underline">swap back to TSD</Link> before you revoke Seeds' access.
        </Note>
      ) : null}
      {balances.isError ? <Note tone="error">Balances could not be synced. Refresh to retry.</Note> : null}
      <p className="text-xs text-muted-foreground">
        These are the coins at your trading pocket's own addresses — your HME Wallet holds the keys. Coins on other networks your pocket hasn't shared don't show here.
      </p>
    </div>
  );
}
