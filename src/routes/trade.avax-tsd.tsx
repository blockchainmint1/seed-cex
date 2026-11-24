import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/avax-tsd")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "AVAX / TSD Order Book — Seeds" },
      { name: "description", content: "Live Avalanche (AVAX)/Texas Stable Dollar order book with wallet-to-wallet settlement on Avalanche and TEXITcoin." },
      { property: "og:title", content: "AVAX / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live Avalanche (AVAX)/Texas Stable Dollar order book with wallet-to-wallet settlement on Avalanche and TEXITcoin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="AVAX_TSD" />,
});
