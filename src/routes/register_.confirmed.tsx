import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old confirmation address: NectarPay checkouts opened before the move still return here. */
export const Route = createFileRoute("/register_/confirmed")({
  staticData: { sitemap: false },
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/ignite/confirmed${location.searchStr}`, statusCode: 301 });
  },
});
