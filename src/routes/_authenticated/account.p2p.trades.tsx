import { createFileRoute } from "@tanstack/react-router";
import { TradeList, useMyP2p } from "@/components/p2p/desk";
import { Card } from "@/components/account/ui";

export const Route = createFileRoute("/_authenticated/account/p2p/trades")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "My P2P trades — Seeds" },
      { name: "description", content: "Every peer-to-peer trade you've bought or sold on Seeds, with status and a link to each trade chat." },
      { property: "og:title", content: "My P2P trades — Seeds" },
      { property: "og:description", content: "Your P2P trade history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradesTab,
});

function TradesTab() {
  const { data } = useMyP2p();
  if (!data) return null;
  return (
    <Card title={`All my P2P trades${data.trades.length ? ` (${data.trades.length})` : ""}`}>
      {data.trades.length ? <TradeList trades={data.trades} /> : <p className="text-sm text-muted-foreground">No trades yet.</p>}
    </Card>
  );
}
