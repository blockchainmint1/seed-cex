import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Marketing — Seeds admin" },
      { name: "description", content: "Recruit coin teams, run Seeds' labelled ad spots and pick coin videos." },
      { property: "og:title", content: "Marketing — Seeds admin" },
      { property: "og:description", content: "Recruit coin teams, run ad spots and pick coin videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MarketingLayout,
});

const TABS = [
  { to: "/admin/marketing", label: "Coin recruiting", exact: true },
  { to: "/admin/marketing/ads", label: "Ads" },
  { to: "/admin/marketing/videos", label: "Coin videos" },
] as const;

function MarketingLayout() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Marketing</p>
        <nav aria-label="Marketing" className="mt-2 flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              activeOptions={{ exact: "exact" in t && t.exact, includeSearch: false }}
              className="-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
