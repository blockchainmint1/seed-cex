import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cmc/ticker")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/cmc-api.server");
        return corsPreflight();
      },
      GET: async () => {
        const { allSnapshots, toTicker, marketJson } = await import("@/lib/cmc-api.server");
        return marketJson(toTicker(await allSnapshots()));
      },
    },
  },
});
