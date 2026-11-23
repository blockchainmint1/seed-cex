import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Old address of the class program (now To the Moon). Shared invites, emails,
 * referral links and open checkouts still point here, so forward and keep the
 * query (?ref=… referral codes, ?paid=1).
 */
export const Route = createFileRoute("/ignite")({
  staticData: { sitemap: false },
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/to-the-moon${location.searchStr}`, statusCode: 301 });
  },
});
