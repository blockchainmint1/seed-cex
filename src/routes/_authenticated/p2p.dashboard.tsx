import { createFileRoute, redirect } from "@tanstack/react-router";

// The P2P desk now lives in Account → P2P; old links and bookmarks land on the listings tab.
export const Route = createFileRoute("/_authenticated/p2p/dashboard")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/account/p2p/listings", statusCode: 301 });
  },
});
