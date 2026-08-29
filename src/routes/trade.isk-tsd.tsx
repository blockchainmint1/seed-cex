import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/isk-tsd")({
  head: () => ({
    meta: [
      { title: "ISK / TSD Order Book — Seeds" },
      { name: "description", content: "Live Iskandercoin/Texas Stable Dollar order book and peer-to-peer settlement through our own node." },
      { property: "og:title", content: "ISK / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live Iskandercoin/Texas Stable Dollar order book and peer-to-peer settlement through our own node." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="ISK_TSD" />,
});
