import { createFileRoute, redirect } from "@tanstack/react-router";
import { flightSchoolClassPath } from "@/lib/flight-school-paths";

/** Old class page address (/ignite/<class>) → /flight-school/<class>. */
export const Route = createFileRoute("/ignite_/$slug")({
  staticData: { sitemap: false },
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `${flightSchoolClassPath(params.slug)}${location.searchStr}`, statusCode: 301 });
  },
});
