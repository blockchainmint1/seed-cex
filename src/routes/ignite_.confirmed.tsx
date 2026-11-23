import { createFileRoute, redirect } from "@tanstack/react-router";

/** Checkouts opened before the rename still return here after payment. */
export const Route = createFileRoute("/ignite_/confirmed")({
  staticData: { sitemap: false },
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/flight-school/confirmed${location.searchStr}`, statusCode: 301 });
  },
});
