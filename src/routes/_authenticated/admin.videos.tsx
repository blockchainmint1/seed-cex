import { createFileRoute, redirect } from "@tanstack/react-router";

/** Moved into Admin → Marketing; old bookmarks still land in the right place. */
export const Route = createFileRoute("/_authenticated/admin/videos")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/admin/marketing/videos", replace: true });
  },
});
