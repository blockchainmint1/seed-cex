import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/v1/account")({
  server: {
    handlers: {
      OPTIONS: async () => (await import("@/lib/api/v1.server")).apiPreflight(),
      GET: async ({ request }) => {
        const { authenticate } = await import("@/lib/api/auth.server");
        const { privateJson } = await import("@/lib/api/v1.server");
        const auth = await authenticate(request, { scope: "read", weight: 10 });
        if (!auth.ok) return auth.response;
        const { apiAccount } = await import("@/lib/api/private.server");
        return privateJson(await apiAccount(auth.caller.userId));
      },
    },
  },
});
