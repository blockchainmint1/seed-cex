import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CandlestickChart, ExternalLink, Flame, LayoutDashboard, ShieldCheck, Sparkles, UserCog, Users } from "lucide-react";
import { amIAdmin } from "@/lib/admin.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Admin Console — Seeds" },
      { name: "description", content: "Operator view of Seeds: Ignite registrations, accounts, orders and trades, Seeds AI and admin access." },
      { property: "og:title", content: "Admin Console — Seeds" },
      { property: "og:description", content: "Operator view of Seeds: Ignite registrations, accounts, orders and trades, Seeds AI and admin access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/ignite", label: "Ignite class", icon: Flame },
  { to: "/admin/accounts", label: "Accounts", icon: Users },
  { to: "/admin/markets", label: "Orders & trades", icon: CandlestickChart },
  { to: "/admin/ai", label: "Seeds AI", icon: Sparkles },
  { to: "/admin/users", label: "Admin access", icon: UserCog },
] as const;

const ELSEWHERE = [
  { to: "/p2p/jury", label: "P2P jury" },
  { to: "/swap", label: "Swaps" },
  { to: "/account", label: "My account" },
] as const;

function AdminLayout() {
  const { user } = useSession();
  const check = useServerFn(amIAdmin);
  const admin = useQuery({ queryKey: ["am-i-admin"], queryFn: () => check(), retry: false, staleTime: 60_000 });
  const load = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load(), enabled: admin.data === true });

  if (admin.isPending) {
    return <div className="mx-auto max-w-7xl px-5 py-10 font-mono text-xs text-muted-foreground">Checking admin access…</div>;
  }
  if (!admin.data) {
    return (
      <div className="mx-auto max-w-7xl px-5 py-16">
        <div className="max-w-xl">
          <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Admin</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold">Admin only</h1>
          <p className="mt-2 text-sm text-muted-foreground">This area is for the Seeds team. An existing admin can give your account access from Admin access.</p>
          <Button asChild size="sm" variant="outline" className="mt-5"><Link to="/account"><ArrowLeft /> Back to my account</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <header className="flex flex-wrap items-center gap-4 border-b border-border pb-6">
        <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-action text-action-foreground">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Admin</p>
          <h1 className="font-display text-2xl font-extrabold md:text-3xl">Admin console</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Signed in as {profile.data?.display_name || user?.email || "admin"}</span>
            <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary uppercase">admin</span>
          </div>
        </div>
        <Button asChild size="sm" variant="outline"><Link to="/account"><ArrowLeft /> My account</Link></Button>
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Admin sections" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul className="-mx-5 flex gap-1 overflow-x-auto border-b border-border px-5 pb-2 lg:mx-0 lg:flex-col lg:border-b-0 lg:px-0 lg:pb-0">
            {NAV.map((n) => (
              <li key={n.to} className="shrink-0">
                <Link
                  to={n.to}
                  activeOptions={{ exact: "exact" in n && n.exact }}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-primary/10 data-[status=active]:font-semibold data-[status=active]:text-primary"
                >
                  <n.icon className="h-4 w-4" /> {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 hidden border-t border-border pt-4 lg:block">
            <p className="px-3 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Elsewhere</p>
            <ul className="mt-2">
              {ELSEWHERE.map((n) => (
                <li key={n.to}>
                  <Link to={n.to} className="flex items-center justify-between rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                    {n.label} <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
