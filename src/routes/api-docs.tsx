import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address for the API docs; kept so existing links and search results land on /api. */
export const Route = createFileRoute("/api-docs")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/api", statusCode: 301 });
  },
});
