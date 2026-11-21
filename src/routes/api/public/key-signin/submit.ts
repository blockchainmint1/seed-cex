import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/key-signin/submit")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/key-signin/signin.server")).corsPreflight(),
      POST: async ({ request }) => (await import("@/lib/key-signin/submit.server")).handleKeySubmit(request),
    },
  },
});
