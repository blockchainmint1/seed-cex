import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address: API keys now live under Profile. */
export const Route = createFileRoute("/_authenticated/api-keys")({
  staticData: { sitemap: false },
  beforeLoad: () => { throw redirect({ to: "/account/api-keys" }); },
});
