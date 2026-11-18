import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/hex-tsd")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "HEX / TSD Order Book — Seeds" },
      { name: "description", content: "Live HEX on Ethereum/Texas Stable Dollar order book with wallet-to-wallet settlement." },
      { property: "og:title", content: "HEX / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live HEX on Ethereum/Texas Stable Dollar order book with wallet-to-wallet settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="HEX_TSD" />,
});
