import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine, ArrowUpFromLine, Bell, ExternalLink, Gift, Handshake, KeyRound, LayoutDashboard, ShieldCheck, Sparkles, User, Wallet,
} from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { amIAdmin } from "@/lib/admin.functions";
import { getMyOnboarding } from "@/lib/onboarding.functions";
import { needsOnboarding, ONBOARDING_QUERY } from "@/lib/onboarding";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { usePocketLink } from "@/components/account/use-pocket";
import { IgniteReminder } from "@/components/ignite/IgniteReminder";

export const Route = createFileRoute("/_authenticated/account")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Your Seeds account — balances, security, alerts & API keys" },
      { name: "description", content: "Your Seeds account: trading-pocket balances, deposits and withdrawals, profile, security, alerts, P2P trading, API keys and AI strategies." },
      { property: "og:title", content: "Your Seeds account" },
      { property: "og:description", content: "Balances, deposits, withdrawals, security, alerts, API keys and AI strategies in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // First visit after joining: open the setup guide (skippable) before the account pages.
  beforeLoad: async ({ context, location }) => {
    let status: string | null;
    try {
      status = (await context.queryClient.ensureQueryData({ queryKey: ONBOARDING_QUERY, queryFn: () => getMyOnboarding() })).status;
    } catch {
      return; // never lock anyone out of their account over this
    }
    if (needsOnboarding(status)) throw redirect({ to: "/welcome", search: { next: location.href } });
  },
  component: AccountLayout,
});

const NAV = [
  { to: "/account", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/account/balances", label: "Balances", icon: Wallet },
  { to: "/account/profile", label: "Profile", icon: User },
  { to: "/account/security", label: "Security", icon: ShieldCheck },
  { to: "/account/alerts", label: "Alerts", icon: Bell },
  { to: "/account/api-keys", label: "API keys", icon: KeyRound },
  { to: "/account/p2p", label: "P2P trading", icon: Handshake },
  { to: "/account/ai", label: "AI strategies", icon: Sparkles },
  { to: "/account/referrals", label: "Referrals", icon: Gift },
] as const;

const ELSEWHERE = [
  { to: "/trades", label: "Orders & trades" },
  { to: "/p2p", label: "P2P marketplace" },
  { to: "/swap", label: "Swaps" },
] as const;

function initials(name: string | null | undefined, email: string | null | undefined) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function AccountLayout() {
  const { user } = useSession();
  const load = useServerFn(getMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const link = usePocketLink();
  const checkAdmin = useServerFn(amIAdmin);
  const admin = useQuery({ queryKey: ["am-i-admin"], queryFn: () => checkAdmin(), retry: false, staleTime: 60_000 });
  const p = profile.data;
  const l = link.data;
  const active = p?.hm_status === "active" || p?.hm_status === "oceanfront";
  // Phones: the section menu scrolls sideways, so bring the open section into view.
  const navRef = useRef<HTMLUListElement>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const ul = navRef.current;
    const el = ul?.querySelector<HTMLElement>('[data-status="active"]');
    if (!ul || !el || ul.scrollWidth <= ul.clientWidth) return;
    const r = el.getBoundingClientRect(), u = ul.getBoundingClientRect();
    ul.scrollTo({ left: ul.scrollLeft + (r.left - u.left) - (u.width - r.width) / 2 });
  }, [path]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <header className="flex flex-wrap items-center gap-4 border-b border-border pb-6">
        <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-action font-display text-lg font-extrabold text-action-foreground">
          {initials(p?.display_name, user?.email)}
        </div>
        <div className="min-w-[12rem] flex-1">
          <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Account</p>
          <h1 className="truncate font-display text-2xl font-extrabold md:text-3xl">{p?.display_name || user?.email || "Your account"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {p?.hm_member_id ? <span className="font-mono">HME {p.hm_member_id.slice(0, 8)}</span> : null}
            {p ? (
              <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase ${active ? "bg-primary/15 text-primary" : "bg-destructive/10 text-destructive"}`}>
                {p.hm_status || "unknown"}
              </span>
            ) : null}
            <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase ${l ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
              {link.isPending ? "checking pocket…" : l ? `pocket #${l.account} · ${l.mode === "access" ? "instant" : "approve each"}` : "no pocket linked"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link to="/account/balances/deposit"><ArrowDownToLine /> Deposit</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/account/balances/withdraw"><ArrowUpFromLine /> Withdraw</Link></Button>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Account sections" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <ul ref={navRef} className="-mx-5 flex gap-1 overflow-x-auto border-b border-border px-5 pb-2 lg:mx-0 lg:flex-col lg:border-b-0 lg:px-0 lg:pb-0">
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
            {admin.data ? (
              <li className="shrink-0 lg:hidden">
                <Link to="/admin" className="flex items-center gap-2.5 whitespace-nowrap rounded-sm px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <ShieldCheck className="h-4 w-4" /> Admin console
                </Link>
              </li>
            ) : null}
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
              {admin.data ? (
                <li>
                  <Link to="/admin" className="flex items-center justify-between rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                    Admin console <ShieldCheck className="h-3 w-3" />
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </nav>
        <div className="min-w-0">
          {profile.error ? <p role="alert" className="mb-4 text-sm text-destructive">Could not load your account. Refresh to retry.</p> : null}
          <IgniteReminder />
          <Outlet />
        </div>
      </div>
    </div>
  );
}
