import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMarkets from "./tools/list-markets";
import getMarketCandles from "./tools/get-market-candles";
import getMyAccount from "./tools/get-my-account";
import listMyOrders from "./tools/list-my-orders";
import listMyTrades from "./tools/list-my-trades";
import listMySwaps from "./tools/list-my-swaps";
import listMyP2pListings from "./tools/list-my-p2p-listings";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "seeds",
  title: "SEEDS",
  version: "0.1.0",
  instructions:
    "Read-only tools for Seeds, the non-custodial Honest.Money exchange. Prices are in TSD (1 TSD = 1 US dollar). " +
    "list_markets and get_market_candles give live THORChain prices; the list_my_* and get_my_account tools show the " +
    "signed-in member's own account, orders, trades, swaps and P2P listings. Nothing here can place orders or move coins.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listMarkets, getMarketCandles, getMyAccount, listMyOrders, listMyTrades, listMySwaps, listMyP2pListings],
});
