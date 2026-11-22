import { createFileRoute, redirect } from "@tanstack/react-router";

/** The old Trades & Orders page: everything now lives on Activity (open orders first). */
export const Route = createFileRoute("/_authenticated/trades")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/activity", search: { tab: "open" }, statusCode: 301 });
  },
});
