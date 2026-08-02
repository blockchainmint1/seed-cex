import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/tsd-txc")({
  head: () => ({
    meta: [
      { title: "TSD / TXC Order Book — Seeds" },
      {
        name: "description",
        content:
          "Trade TEXITcoin against the Texas Stable Dollar (Omni property #39). Both legs settle on the TEXITcoin chain — no bridge, no custody.",
      },
      { property: "og:title", content: "TSD / TXC Order Book — Seeds" },
      {
        property: "og:description",
        content: "Native TSD/TXC depth and single-chain settlement on Seeds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="TSD_TXC" />,
});
