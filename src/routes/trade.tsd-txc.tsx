import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

export const Route = createFileRoute("/trade/tsd-txc")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "TXC / TSD Order Book — Seeds" },
      {
        name: "description",
        content:
          "Trade TEXITcoin against the Texas Stable Dollar (Omni property #39). Both legs settle on the TEXITcoin chain — no bridge, no custody.",
      },
      { property: "og:title", content: "TXC / TSD Order Book — Seeds" },
      {
        property: "og:description",
        content: "Native TXC/TSD depth and single-chain settlement on Seeds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="TSD_TXC" />,
});
