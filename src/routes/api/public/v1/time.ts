import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/time")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async () => {
        const { apiJson } = await import("@/lib/api/v1.server");
        return apiJson({ serverTime: Date.now() }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
