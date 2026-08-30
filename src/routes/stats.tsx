import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicStats } from "@/lib/stats.functions";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Live Exchange Stats — Seeds" },
      {
        name: "description",
        content:
          "Real-time Seeds exchange stats: market volume, open orders, settled on-chain legs, vaults created, and delegated keys currently held.",
      },
      { property: "og:title", content: "Live Exchange Stats — Seeds" },
      {
        property: "og:description",
        content: "Volume, open orders, on-chain settlements and custody counts, published live.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ stats: await getPublicStats() }),
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-3xl px-5 py-16 font-mono text-sm text-destructive">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-5 py-16 font-mono text-sm">Not found.</div>
  ),
  component: StatsPage,
});

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-sm border border-border bg-surface p-5">
      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 font-mono text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatsPage() {
  const { stats } = Route.useLoaderData();
  const n = (v: number) => v.toLocaleString("en-US");
  const p = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 8 }));

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-5 py-14">
      <header className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Proof</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          Live exchange stats
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Everything below is read straight out of the exchange at page load — no marketing math.
          Snapshot taken {new Date(stats.generatedAt).toUTCString()}.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Markets" value={n(stats.totals.pairs)} hint="Live trade pairs" />
        <Metric label="Trades (24h)" value={n(stats.totals.trades24h)} hint={`${n(stats.totals.tradesAll)} all time`} />
        <Metric label="Open orders" value={n(stats.totals.openOrders)} hint="Resting on the book" />
        <Metric label="Vaults" value={n(stats.totals.vaults)} hint="Browser-encrypted seeds" />
        <Metric label="Settled legs" value={n(stats.totals.settledLegs)} hint="Confirmed on-chain" />
        <Metric label="Pending legs" value={n(stats.totals.pendingLegs)} hint="Awaiting confirmation" />
        <Metric label="Failed legs" value={n(stats.totals.failedLegs)} hint="Retryable" />
        <Metric label="API keys" value={n(stats.totals.apiKeys)} hint="Bot keys — trade only" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Keys held now" value={n(stats.custody.keysHeld)} hint="Delegated trading branches" />
        <Metric
          label="Next expiry"
          value={stats.custody.nextExpiry ? new Date(stats.custody.nextExpiry).toUTCString().slice(5, 22) : "—"}
        />
        <Metric
          label="Last sweep"
          value={stats.custody.lastSweep ? new Date(stats.custody.lastSweep).toUTCString().slice(5, 22) : "—"}
        />
        <Metric label="Keys wiped" value={n(stats.custody.keysWipedTotal)} hint="Destroyed at expiry" />
      </section>

      <section className="overflow-hidden rounded-sm border border-border">
        <table className="w-full">
          <thead className="bg-surface">
            <tr className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              <th className="px-4 py-3 text-left">Market</th>
              <th className="px-4 py-3 text-right">Last</th>
              <th className="px-4 py-3 text-right">Bid</th>
              <th className="px-4 py-3 text-right">Ask</th>
              <th className="px-4 py-3 text-right">Base vol 24h</th>
              <th className="px-4 py-3 text-right">Quote vol</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stats.markets.map((m) => (
              <tr key={m.pair}>
                <td className="px-4 py-4 font-mono text-sm">{m.label}</td>
                <td className="px-4 py-4 text-right font-mono text-sm tabular-nums">{p(m.lastPrice)}</td>
                <td className="px-4 py-4 text-right font-mono text-sm tabular-nums">{p(m.bid)}</td>
                <td className="px-4 py-4 text-right font-mono text-sm tabular-nums">{p(m.ask)}</td>
                <td className="px-4 py-4 text-right font-mono text-sm tabular-nums">{p(m.baseVolume)}</td>
                <td className="px-4 py-4 text-right font-mono text-sm tabular-nums">{p(m.quoteVolume)}</td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={m.route as "/trade/tsd-txc"}
                    className="inline-flex rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-wider uppercase transition-colors hover:border-primary hover:text-primary"
                  >
                    Trade
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="font-mono text-xs text-muted-foreground">
        Machine-readable versions of this data live at{" "}
        <Link to="/api-docs" className="text-primary hover:underline">
          /api-docs
        </Link>{" "}
        — ticker, depth, klines and trades are all public, no key required.
      </p>
    </div>
  );
}
