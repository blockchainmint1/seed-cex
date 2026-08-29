import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/txc-usdt")({
  head: () => ({
    meta: [
      { title: "TXC / USDT Order Book — Seeds" },
      { name: "description", content: "Live TEXITcoin/USDT order book, trade tape, and peer-to-peer escrow settlement on Seeds." },
      { property: "og:title", content: "TXC / USDT Order Book — Seeds" },
      { property: "og:description", content: "Live TEXITcoin/USDT order book, trade tape, and peer-to-peer escrow settlement on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="TXC_USDT" />,
});
