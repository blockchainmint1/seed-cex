import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/usdc-txc")({
  head: () => ({
    meta: [
      { title: "USDC / TXC Order Book — Seeds" },
      {
        name: "description",
        content:
          "Live USDC/TEXITcoin order book, trade tape, and peer-to-peer escrow settlement on Seeds — the non-custodial exchange.",
      },
      { property: "og:title", content: "USDC / TXC Order Book — Seeds" },
      {
        property: "og:description",
        content: "Live USDC/TXC depth, trade tape, and escrowed peer settlement.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="USDC_TXC" />,
});
