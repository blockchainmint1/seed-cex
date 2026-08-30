import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelOrder, getMyOrders, getMyTrades } from "@/lib/trading.functions";
import { getPair, type PairId } from "@/lib/chains";
import { LegPanel } from "@/components/trade/LegPanel";
import { fmtAgo, fmtAmount, fmtPrice } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/trades")({
  head: () => ({
    meta: [
      { title: "My Trades & Orders — Seeds" },
      { name: "description", content: "Manage open orders and review your settled trade history across every Seeds market." },
      { property: "og:title", content: "My Trades & Orders — Seeds" },
      { property: "og:description", content: "Manage open orders and review your settled trade history across every Seeds market." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TradesPage,
});

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[11px] font-bold tracking-[0.18em] text-foreground uppercase">
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function pairLabel(pairId: string): string {
  try {
    return getPair(pairId as PairId).label;
  } catch {
    return pairId;
  }
}

function pairSlug(pairId: string): string {
  try {
    return getPair(pairId as PairId).slug;
  } catch {
    return "tsd-txc";
  }
}

function TradesPage() {
  const queryClient = useQueryClient();
  const fetchMyOrders = useServerFn(getMyOrders);
  const fetchMyTrades = useServerFn(getMyTrades);
  const killOrder = useServerFn(cancelOrder);

  const orders = useQuery({
    queryKey: ["my-orders", "all"],
    queryFn: () => fetchMyOrders(),
    refetchInterval: 15_000,
  });
  const trades = useQuery({
    queryKey: ["my-trades", "all"],
    queryFn: () => fetchMyTrades(),
    refetchInterval: 15_000,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => killOrder({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-orders"] }),
  });

  const allOrders = orders.data ?? [];
  const openOrders = allOrders.filter((o) => o.status === "open" || o.status === "partial");
  const pastOrders = allOrders.filter((o) => o.status !== "open" && o.status !== "partial");
  const allTrades = trades.data ?? [];

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <header className="mb-8 border-b border-border pb-6">
        <p className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
          Portfolio
        </p>
        <h1 className="font-display text-3xl font-black tracking-tight text-foreground">
          Trades &amp; Orders
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every resting order and settled fill across all Seeds markets. Fills settle
          wallet-to-wallet on-chain the moment they match — no deposits, no escrow hold.
        </p>
      </header>

      <div className="space-y-6">
        <Panel
          title="Open orders"
          right={
            <span className="font-mono text-[10px] text-muted-foreground">
              {openOrders.length} live
            </span>
          }
        >
          {openOrders.length === 0 ? (
            <p className="p-4 font-mono text-xs text-muted-foreground">
              Nothing resting on the book.{" "}
              <Link to="/trade/tsd-txc" className="text-primary underline-offset-4 hover:underline">
                Pick a market
              </Link>{" "}
              to place one.
            </p>
          ) : (
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                  <th className="px-4 py-2 text-left">Market</th>
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Filled / Size</th>
                  <th className="px-4 py-2 text-right">Placed</th>
                  <th className="px-4 py-2 text-right">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="px-4 py-2">
                      <Link
                        to={`/trade/${pairSlug(o.pair)}` as string}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {pairLabel(o.pair)}
                      </Link>
                    </td>
                    <td className={`px-4 py-2 ${o.side === "buy" ? "text-bid" : "text-ask"}`}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtPrice(o.price)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtAmount(o.filled, 4)} / {fmtAmount(o.amount, 4)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmtAgo(o.created_at)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{o.status}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => cancel.mutate(o.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel
          title="Trade history"
          right={
            <span className="font-mono text-[10px] text-muted-foreground">
              {allTrades.length} fill{allTrades.length === 1 ? "" : "s"}
            </span>
          }
        >
          {allTrades.length === 0 ? (
            <p className="p-4 font-mono text-xs text-muted-foreground">No fills yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {allTrades.map((t) => (
                <li key={t.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                    <Link
                      to={`/trade/${pairSlug(t.pair)}` as string}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {pairLabel(t.pair)}
                    </Link>
                    <span className={t.side === "buy" ? "text-bid" : "text-ask"}>
                      {t.side.toUpperCase()}
                    </span>
                    <span className="tabular-nums">{fmtAmount(t.amount, 4)}</span>
                    <span className="tabular-nums">@ {fmtPrice(t.price)}</span>
                    <span className="text-muted-foreground">{t.role}</span>
                    <span className="rounded-sm border border-border px-2 py-0.5 tracking-wider uppercase">
                      {t.status.replace(/_/g, " ")}
                    </span>
                    <span className="ml-auto text-muted-foreground">{fmtAgo(t.createdAt)}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {t.escrows.map((e) => (
                      <LegPanel key={e.leg} tradeId={t.id} leg={e} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {pastOrders.length > 0 ? (
          <Panel title="Closed orders">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                  <th className="px-4 py-2 text-left">Market</th>
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Filled / Size</th>
                  <th className="px-4 py-2 text-right">Status</th>
                  <th className="px-4 py-2 text-right">Placed</th>
                </tr>
              </thead>
              <tbody>
                {pastOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="px-4 py-2">{pairLabel(o.pair)}</td>
                    <td className={`px-4 py-2 ${o.side === "buy" ? "text-bid" : "text-ask"}`}>
                      {o.side.toUpperCase()}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtPrice(o.price)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtAmount(o.filled, 4)} / {fmtAmount(o.amount, 4)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{o.status}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmtAgo(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
