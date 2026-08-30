import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview } from "@/lib/admin.functions";
import { fmtAgo, fmtAmount, fmtPrice } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — Seeds" },
      {
        name: "description",
        content:
          "Operator view of Seeds accounts, authorizations, open orders, live trades and settlement health.",
      },
      { property: "og:title", content: "Admin Console — Seeds" },
      {
        property: "og:description",
        content:
          "Operator view of Seeds accounts, authorizations, open orders, live trades and settlement health.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AdminPage,
});

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[11px] font-bold tracking-[0.18em] text-foreground uppercase">
          {title}
        </h2>
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}

const short = (v: string | null) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "—");

function AdminPage() {
  const fetchOverview = useServerFn(getAdminOverview);
  const q = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
    retry: false,
  });

  if (q.isLoading) {
    return (
      <main className="mx-auto max-w-7xl px-5 py-10 font-mono text-xs text-muted-foreground">
        Loading admin console…
      </main>
    );
  }

  if (q.error) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="font-display text-2xl font-bold">Admin only</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          This console requires the admin role on your account.
        </p>
      </main>
    );
  }

  const d = q.data!;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Admin console</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          Snapshot {fmtAgo(d.generatedAt)} · auto-refreshes every 30s
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Accounts" value={String(d.totals.accounts)} />
        <Stat label="Vaults" value={String(d.totals.vaults)} />
        <Stat label="Live auths" value={String(d.totals.activeAuthorizations)} />
        <Stat label="Authorized cap" value={fmtAmount(d.totals.authorizedCapTotal)} />
        <Stat label="Open orders" value={String(d.totals.openOrders)} />
        <Stat label="Open trades" value={String(d.totals.openTrades)} />
        <Stat label="Trades 24h" value={String(d.totals.trades24h)} />
        <Stat label="Trades all" value={String(d.totals.tradesAll)} />
        <Stat label="Volume 24h (quote)" value={fmtAmount(d.totals.tradedQuoteValue24h)} />
        <Stat label="Volume all (quote)" value={fmtAmount(d.totals.tradedQuoteValueAll)} />
        <Stat label="Failed legs" value={String(d.totals.failedLegs)} />
        <Stat label="API keys" value={String(d.totals.apiKeys)} />
      </div>

      <Panel title="Accounts">
        <table className="w-full font-mono text-[11px]">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Vault</th>
              <th className="px-4 py-2 text-left">TXC</th>
              <th className="px-4 py-2 text-left">EVM</th>
              <th className="px-4 py-2 text-right">Auths</th>
              <th className="px-4 py-2 text-right">Cap</th>
              <th className="px-4 py-2 text-right">Open</th>
              <th className="px-4 py-2 text-right">Trades</th>
              <th className="px-4 py-2 text-right">Value</th>
              <th className="px-4 py-2 text-right">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {d.accounts.map((a) => (
              <tr key={a.userId} className="border-b border-border/50">
                <td className="px-4 py-2 text-foreground">{a.displayName}</td>
                <td className="px-4 py-2">{a.hasVault ? "yes" : "—"}</td>
                <td className="px-4 py-2">{short(a.txcAddress)}</td>
                <td className="px-4 py-2">{short(a.evmAddress)}</td>
                <td className="px-4 py-2 text-right">{a.activeAuthorizations}</td>
                <td className="px-4 py-2 text-right">{fmtAmount(a.authorizedCap)}</td>
                <td className="px-4 py-2 text-right">{a.openOrders}</td>
                <td className="px-4 py-2 text-right">{a.trades}</td>
                <td className="px-4 py-2 text-right">{fmtAmount(a.tradedQuoteValue)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {a.lastActivity ? fmtAgo(a.lastActivity) : "—"}
                </td>
              </tr>
            ))}
            {d.accounts.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={10}>
                  No accounts yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>

      <Panel title="Open trades">
        <TradeTable rows={d.openTrades} empty="No trades awaiting settlement." />
      </Panel>

      <Panel title="Open orders">
        <table className="w-full font-mono text-[11px]">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left">Pair</th>
              <th className="px-4 py-2 text-left">Side</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-right">Filled</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            {d.openOrders.map((o) => (
              <tr key={o.id} className="border-b border-border/50">
                <td className="px-4 py-2 text-foreground">{o.pair.replace("_", " / ")}</td>
                <td
                  className={`px-4 py-2 uppercase ${o.side === "buy" ? "text-primary" : "text-destructive"}`}
                >
                  {o.side}
                </td>
                <td className="px-4 py-2 text-right">{fmtPrice(o.price)}</td>
                <td className="px-4 py-2 text-right">{fmtAmount(o.amount)}</td>
                <td className="px-4 py-2 text-right">{fmtAmount(o.filled)}</td>
                <td className="px-4 py-2">{o.status}</td>
                <td className="px-4 py-2">{short(o.userId)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {fmtAgo(o.createdAt)}
                </td>
              </tr>
            ))}
            {d.openOrders.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                  Order book is empty.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>

      <Panel title="Recent trades">
        <TradeTable rows={d.recentTrades} empty="No trades yet." />
      </Panel>
    </main>
  );
}

function TradeTable({
  rows,
  empty,
}: {
  rows: {
    id: string;
    pair: string;
    side: string;
    price: number;
    amount: number;
    status: string;
    makerId: string | null;
    takerId: string | null;
    createdAt: string;
    legs: { leg: string; status: string; txid: string | null }[];
  }[];
  empty: string;
}) {
  return (
    <table className="w-full font-mono text-[11px]">
      <thead className="text-muted-foreground">
        <tr className="border-b border-border">
          <th className="px-4 py-2 text-left">Pair</th>
          <th className="px-4 py-2 text-left">Side</th>
          <th className="px-4 py-2 text-right">Price</th>
          <th className="px-4 py-2 text-right">Amount</th>
          <th className="px-4 py-2 text-left">Status</th>
          <th className="px-4 py-2 text-left">Legs</th>
          <th className="px-4 py-2 text-left">Maker</th>
          <th className="px-4 py-2 text-left">Taker</th>
          <th className="px-4 py-2 text-right">Age</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className="border-b border-border/50">
            <td className="px-4 py-2 text-foreground">{t.pair.replace("_", " / ")}</td>
            <td
              className={`px-4 py-2 uppercase ${t.side === "buy" ? "text-primary" : "text-destructive"}`}
            >
              {t.side}
            </td>
            <td className="px-4 py-2 text-right">{fmtPrice(t.price)}</td>
            <td className="px-4 py-2 text-right">{fmtAmount(t.amount)}</td>
            <td className="px-4 py-2">{t.status}</td>
            <td className="px-4 py-2">
              {t.legs.length
                ? t.legs.map((l) => `${l.leg}:${l.status}`).join(" · ")
                : "—"}
            </td>
            <td className="px-4 py-2">{short(t.makerId)}</td>
            <td className="px-4 py-2">{short(t.takerId)}</td>
            <td className="px-4 py-2 text-right text-muted-foreground">{fmtAgo(t.createdAt)}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td className="px-4 py-6 text-muted-foreground" colSpan={9}>
              {empty}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}
