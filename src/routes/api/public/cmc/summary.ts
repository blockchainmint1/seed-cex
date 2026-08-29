import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/cmc/summary")({
  server: {
    handlers: {
      OPTIONS: async () => {
        const { corsPreflight } = await import("@/lib/cmc-api.server");
        return corsPreflight();
      },
      GET: async () => {
        const { allSnapshots, toSummary, marketJson } = await import("@/lib/cmc-api.server");
        return marketJson(toSummary(await allSnapshots()));
      },
    },
  },
});
