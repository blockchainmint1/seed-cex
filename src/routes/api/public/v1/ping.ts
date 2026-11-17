import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/ping")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async () => (await import("@/lib/api/v1.server")).publicJson({}, 1),
    },
  },
});
