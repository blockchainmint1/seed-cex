import { createFileRoute, redirect } from "@tanstack/react-router";
import { moonClassPath } from "@/lib/to-the-moon-paths";

/** Old class page address (/ignite/<class>) → /to-the-moon/<class>. */
export const Route = createFileRoute("/ignite_/$slug")({
  staticData: { sitemap: false },
  beforeLoad: ({ params, location }) => {
    throw redirect({ href: `${moonClassPath(params.slug)}${location.searchStr}`, statusCode: 301 });
  },
});
