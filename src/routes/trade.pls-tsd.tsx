import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/pls-tsd")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "PLS / TSD Order Book — Seeds" },
      { name: "description", content: "Live PulseChain (PLS)/Texas Stable Dollar order book with wallet-to-wallet settlement on PulseChain and TEXITcoin." },
      { property: "og:title", content: "PLS / TSD Order Book — Seeds" },
      { property: "og:description", content: "Live PulseChain (PLS)/Texas Stable Dollar order book with wallet-to-wallet settlement on PulseChain and TEXITcoin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="PLS_TSD" />,
});
