import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Old address for the Ignite class page. Shared invites, emails and open
 * checkouts still point here, so forward to /flight-school and keep the query
 * (?ref=… referral codes, ?paid=1). Browsers carry #reserve across on their own.
 */
export const Route = createFileRoute("/register")({
  staticData: { sitemap: false },
  beforeLoad: ({ location }) => {
    throw redirect({ href: `/flight-school${location.searchStr}`, statusCode: 301 });
  },
});
