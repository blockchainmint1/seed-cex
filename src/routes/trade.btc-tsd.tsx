import { createFileRoute } from "@tanstack/react-router";
import { TradeTerminal } from "@/components/trade/TradeTerminal";

const title = "BTC / TSD Order Book — Seeds";
const description =
  "Live Bitcoin/Texas Stable Dollar order book on Seeds. Deposit native BTC, trade from your own keys, settle in seconds.";

export const Route = createFileRoute("/trade/btc-tsd")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <TradeTerminal pairId="BTC_TSD" />,
});
