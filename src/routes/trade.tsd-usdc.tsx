import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/tsd-usdc")({
  head: () => ({
    meta: [
      { title: "TSD / USDC Order Book — Seeds" },
      { name: "description", content: "Live Texas Stable Dollar/USDC order book and peer-to-peer settlement across Omni and EVM." },
      { property: "og:title", content: "TSD / USDC Order Book — Seeds" },
      { property: "og:description", content: "Live Texas Stable Dollar/USDC order book and peer-to-peer settlement across Omni and EVM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="TSD_USDC" />,
});
