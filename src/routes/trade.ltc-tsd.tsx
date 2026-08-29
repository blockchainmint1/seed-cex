import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/ltc-tsd")({
  head: () => ({
    meta: [
      { title: "LTC / TSD Order Book — Seeds" },
      { name: "description", content: "Live Litecoin/Texas Stable Dollar order book, trade tape, and peer-to-peer escrow settlement." },
      { property: "og:title", content: "LTC / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live Litecoin/Texas Stable Dollar order book, trade tape, and peer-to-peer escrow settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="LTC_TSD" />,
});
