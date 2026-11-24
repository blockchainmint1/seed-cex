import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/hype-tsd")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "HYPE / TSD Order Book — Seeds" },
      { name: "description", content: "Live Hyperliquid (HYPE)/Texas Stable Dollar order book with wallet-to-wallet settlement on HyperEVM and TEXITcoin." },
      { property: "og:title", content: "HYPE / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live Hyperliquid (HYPE)/Texas Stable Dollar order book with wallet-to-wallet settlement on HyperEVM and TEXITcoin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="HYPE_TSD" />,
});
