import { createFileRoute, redirect } from "@tanstack/react-router";

/** The old "Any coin" swap page: every coin now swaps on the single /swap form. */
export const Route = createFileRoute("/swap_/tokens")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/swap", statusCode: 301 });
  },
});
