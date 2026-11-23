import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Bug, CandlestickChart, Coins, ExternalLink, Flame, CalendarDays, Inbox, LayoutDashboard, LockKeyhole, Map as MapIcon, Megaphone, Settings, Share2, ShieldCheck, Sparkles, UserCog, Users } from "lucide-react";
import { getAdminGate } from "@/lib/admin.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/account/ui";
import { CodeField } from "@/components/account/CodeField";
import { TwoFactorCard } from "@/components/account/TwoFactorCard";
import { proveTwoFactor } from "@/components/account/two-factor";
import { shownEmail } from "@/lib/key-signin/rules";

export const Route = createFileRoute("/_authenticated/admin")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Admin Console — Seeds" },
      { name: "description", content: "Operator view of Seeds: Ignite registrations, accounts, orders and trades, Seeds AI, admin access and withdrawal settings." },
      { property: "og:title", content: "Admin Console — Seeds" },
      { property: "og:description", content: "Operator view of Seeds: Ignite registrations, accounts, orders and trades, Seeds AI, admin access and withdrawal settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/ignite", label: "Ignite registrants", icon: Flame },
  { to: "/admin/ignite-classes", label: "Ignite classes", icon: CalendarDays },
  { to: "/admin/ignite-interest", label: "Ignite interest list", icon: Inbox },
  { to: "/admin/accounts", label: "Accounts", icon: Users },
  { to: "/admin/affiliates", label: "Affiliates", icon: Share2 },
  { to: "/admin/markets", label: "Orders & trades", icon: CandlestickChart },
  { to: "/admin/ai", label: "Seeds AI", icon: Sparkles },
  { to: "/admin/listings", label: "Listings", icon: Coins },
  { to: "/admin/bugs", label: "Bugs", icon: Bug },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone },
  { to: "/admin/plan", label: "Business plan", icon: MapIcon },
  { to: "/admin/users", label: "Admin access", icon: UserCog },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

const ELSEWHERE = [
  { to: "/p2p/jury", label: "P2P jury" },
  { to: "/swap", label: "Swaps" },
  { to: "/account", label: "My account" },
] as const;

function AdminLayout() {
  const { user } = useSession();
  const check = useServerFn(getAdminGate);
  // Re-checked every minute so the console locks itself when the 12-hour unlock runs out.
  const admin = useQuery({ queryKey: ["admin-gate"], queryFn: () => check(), retry: false, staleTime: 30_000, refetchInterval: 60_000 });
  const load = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load(), enabled: admin.data?.gate === "ok" });

  if (admin.isPending) {
    return <div className="mx-auto max-w-7xl px-5 py-10 font-mono text-xs text-muted-foreground">Checking admin access…</div>;
  }
  if (admin.data?.gate === "needs_setup" || admin.data?.gate === "needs_code") {
    return <AdminUnlock gate={admin.data.gate} />;
  }
  if (admin.data?.gate !== "ok") {
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
            <span>Signed in as {profile.data?.display_name || shownEmail(user?.email) || "admin"}</span>
            <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary uppercase">admin</span>
            {admin.data.unlockedUntil ? (
              <span className="inline-flex items-center gap-1"><LockKeyhole className="h-3 w-3" /> Unlocked until {new Date(admin.data.unlockedUntil * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
            ) : null}
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

/** Admins must use two-factor: set it up here, or enter a code to unlock the console for 12 hours. */
function AdminUnlock({ gate }: { gate: "needs_setup" | "needs_code" }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await proveTwoFactor(code);
      await qc.invalidateQueries(); // every admin table re-reads with the unlocked session
    } catch (x) {
      setErr(x instanceof Error ? x.message : "That code didn't work.");
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <div className="max-w-xl">
        <div aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary"><LockKeyhole className="h-5 w-5" /></div>
        <p className="mt-4 font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Admin</p>
        {gate === "needs_code" ? (
          <>
            <h1 className="mt-1 font-display text-2xl font-extrabold">Unlock the admin console</h1>
            <p className="mt-2 text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app. The console stays unlocked on this device for 12 hours.</p>
            <form onSubmit={unlock} className="mt-5 space-y-4">
              <CodeField id="admin-unlock-code" value={code} onChange={setCode} />
              {err ? <Note tone="error">{err}</Note> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Unlock"}</Button>
                <Button asChild variant="outline"><Link to="/account"><ArrowLeft /> My account</Link></Button>
              </div>
            </form>
            <p className="mt-6 text-xs text-muted-foreground">Lost your phone? Another admin can reset your two-factor from Admin → Settings after checking it's you.</p>
          </>
        ) : (
          <>
            <h1 className="mt-1 font-display text-2xl font-extrabold">Turn on two-factor to use the admin console</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Admins can see every member and change access, limits and seats, so the console needs a code from your phone as well as your Honest.Money sign-in. Set it up once below; after that you'll enter a code every 12 hours.
            </p>
          </>
        )}
      </div>
      {gate === "needs_setup" ? <div className="mt-6 max-w-2xl"><TwoFactorCard /></div> : null}
    </div>
  );
}
