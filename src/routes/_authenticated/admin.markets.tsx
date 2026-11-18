import { createFileRoute } from "@tanstack/react-router";
import { TabTitle } from "@/components/account/ui";
import { Loading, Panel, TradeTable, short, useAdminOverview } from "@/components/admin/ui";
import { fmtAgo, fmtAmount, fmtPrice } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/markets")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Orders & trades — Seeds admin" },
      { name: "description", content: "Open orders, trades waiting to settle and recent trades on Seeds." },
      { property: "og:title", content: "Orders & trades — Seeds admin" },
      { property: "og:description", content: "Order book and settlement health for operators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MarketsPage,
});

function MarketsPage() {
  const q = useAdminOverview();
  const d = q.data;
  return (
    <div className="space-y-5">
      <TabTitle title="Orders & trades" desc="Live order book, trades still settling, and the last 50 trades." />
      {q.isPending ? <Loading /> : !d ? <p role="alert" className="text-sm text-destructive">Couldn't load markets. Refresh to retry.</p> : (
        <>
          <Panel title={`Open trades · ${d.openTrades.length}`}><TradeTable rows={d.openTrades} empty="No trades awaiting settlement." /></Panel>
          <Panel title={`Open orders · ${d.openOrders.length}`}>
            <table className="w-full whitespace-nowrap font-mono text-[11px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left">Pair</th><th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Filled</th><th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">User</th><th className="px-4 py-2 text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {d.openOrders.map((o) => (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="px-4 py-2 text-foreground">{o.pair.replace("_", " / ")}</td>
                    <td className={`px-4 py-2 uppercase ${o.side === "buy" ? "text-primary" : "text-destructive"}`}>{o.side}</td>
                    <td className="px-4 py-2 text-right">{fmtPrice(o.price)}</td>
                    <td className="px-4 py-2 text-right">{fmtAmount(o.amount)}</td>
                    <td className="px-4 py-2 text-right">{fmtAmount(o.filled)}</td>
                    <td className="px-4 py-2">{o.status}</td>
                    <td className="px-4 py-2">{short(o.userId)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmtAgo(o.createdAt)}</td>
                  </tr>
                ))}
                {d.openOrders.length === 0 ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={8}>Order book is empty.</td></tr> : null}
              </tbody>
            </table>
          </Panel>
          <Panel title="Recent trades"><TradeTable rows={d.recentTrades} empty="No trades yet." /></Panel>
        </>
      )}
    </div>
  );
}
