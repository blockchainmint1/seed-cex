import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old public address of the LocalBitcoins report; it now lives with the business plan (admins only). */
export const Route = createFileRoute("/lbtc")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ href: "/admin/plan/lbtc", statusCode: 301 });
  },
});
