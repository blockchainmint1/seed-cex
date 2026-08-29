import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/zcu-tsd")({
  head: () => ({
    meta: [
      { title: "ZCU / TSD Order Book — Seeds" },
      { name: "description", content: "Live ZeroChill/Texas Stable Dollar order book and native ZCU peer-to-peer settlement." },
      { property: "og:title", content: "ZCU / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live ZeroChill/Texas Stable Dollar order book and native ZCU peer-to-peer settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="ZCU_TSD" />,
});
