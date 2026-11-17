import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cmc/assets")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/cmc-api.server");
        return corsPreflight();
      },
      GET: async () => {
        const { buildAssets, marketJson } = await import("@/lib/cmc-api.server");
        return marketJson(buildAssets());
      },
    },
  },
});
