import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/exchangeInfo")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async () => {
        const { buildExchangeInfo, publicJson } = await import("@/lib/api/v1.server");
        return publicJson(buildExchangeInfo(), 30);
      },
    },
  },
});
