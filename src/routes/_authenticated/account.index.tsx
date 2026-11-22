import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2, Circle, Sprout } from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { listApiKeys } from "@/lib/api-keys.functions";
import { getMyAiPlans } from "@/lib/ai/ai.functions";
import { Button } from "@/components/ui/button";
import { Card, TabTitle } from "@/components/account/ui";
import { fmtUsd, usePocketBalances, usePocketLink } from "@/components/account/use-pocket";
import { useJoinHonestMoney, useMyIdentity } from "@/components/account/use-identity";
import { useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { useWithdrawals } from "@/components/account/SeedsWithdraw";
import { keyThing } from "@/lib/account/sign-in-kind";

export const Route = createFileRoute("/_authenticated/account/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Account overview — Seeds" },
      { name: "description", content: "Your Seeds account at a glance: estimated pocket value, setup checklist, alerts, API keys and AI strategies." },
      { property: "og:title", content: "Account overview — Seeds" },
      { property: "og:description", content: "Estimated balance, setup checklist and shortcuts for your Seeds account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const loadProfile = useServerFn(getMyProfile);
  const loadKeys = useServerFn(listApiKeys);
  const loadPlans = useServerFn(getMyAiPlans);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => loadProfile() });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => loadKeys() });
  const plans = useQuery({ queryKey: ["ai-my-plans"], queryFn: () => loadPlans() });
  const link = usePocketLink();
  const l = link.data;
  const { rows, total, unpriced, balances } = usePocketBalances(l?.addresses, l?.id);
  const p = profile.data;
  const id = useMyIdentity();
  const keyKind = id.keyKind;
  const tf = useMyTwoFactor();
  const withdrawals = useWithdrawals(null, Boolean(keyKind));
  const joinHonestMoney = useJoinHonestMoney();
  const showJoin = Boolean(keyKind && id.data && !id.data.hmeMember);

  const funded = rows.some((r) => (r.balance ?? 0) > 0);
  const livePlans = (plans.data?.plans ?? []).filter((x) => x.status === "locked").length;
  const liveKeys = (keys.data ?? []).filter((k) => k.enabled).length;
  // Coin / wallet members: Honest.Money is optional (Bobby, Nov 21), so it isn't a step; email + the re-sign-in are.
  const steps = keyKind ? [
    { done: Boolean(l), label: "Trading pocket set up", to: "/account/security" as const },
    { done: funded, label: "Deposit into your trading pocket", to: "/account/balances/deposit" as const },
    { done: Boolean(id.data?.email), label: "Add an email (needed for withdrawals)", to: "/account/profile" as const },
    { done: Boolean(tf.data), label: "Turn on two-factor sign-in", to: "/account/security" as const },
    { done: Boolean(p?.telegram_verified), label: "Connect Telegram alerts", to: "/account/alerts" as const },
    { done: withdrawals.data?.readiness === "ready", label: `Sign in again with ${keyThing(keyKind)} to turn on withdrawals`, to: "/account/security" as const },
  ] : [
    { done: p?.hm_status === "active" || p?.hm_status === "oceanfront", label: "Honest.Money membership active", to: "/account/profile" as const },
    { done: Boolean(l), label: "Link your HME Wallet trading pocket", to: "/account/security" as const },
    { done: funded, label: "Deposit into your trading pocket", to: "/account/balances/deposit" as const },
    { done: Boolean(p?.telegram_verified), label: "Connect Telegram alerts", to: "/account/alerts" as const },
    { done: livePlans > 0, label: "Lock in an AI plan (optional)", to: "/account/ai" as const },
    { done: liveKeys > 0, label: "Create an API key for a bot (optional)", to: "/account/api-keys" as const },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-6">
      <TabTitle title="Overview" desc={keyKind ? `Everything about your Seeds account in one place. Your coins stay in your own trading pocket, built from ${keyThing(keyKind)} — Seeds never holds them.` : "Everything about your Seeds account in one place. Your coins stay in your own HME trading pocket — Seeds never holds them."} />

      {showJoin ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-primary/40 bg-primary/5 p-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-sm font-semibold text-foreground">Join Honest.Money — optional</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Get Ignite, referrals and one login across the Honest.Money ecosystem. Your membership email comes with it, which withdrawals need. Your coins, {l ? `pocket #${l.account}` : "pocket"} and history stay exactly where they are, and you can keep signing in with {keyKind ? keyThing(keyKind) : "your key"}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={joinHonestMoney}>Join with Honest.Money</Button>
            <Button asChild size="sm" variant="ghost"><a href="https://honest.money" target="_blank" rel="noreferrer">What's Honest.Money?</a></Button>
          </div>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Estimated pocket value</p>
            <p className="num mt-1 font-display text-3xl font-extrabold">
              {!l ? "—" : balances.isPending ? "…" : fmtUsd(total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {!l ? "Link your trading pocket to see balances." : `Pocket #${l.account} · live market prices, TSD at $1${unpriced ? " · some coins have no price yet" : ""}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link to="/account/balances/deposit"><ArrowDownToLine /> Deposit</Link></Button>
            <Button asChild variant="outline"><Link to="/account/balances/withdraw"><ArrowUpFromLine /> Withdraw</Link></Button>
            <Button asChild variant="ghost"><Link to="/account/balances">All balances <ArrowRight /></Link></Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Trading pocket" value={l ? (l.mode === "access" ? "Instant trades" : "Approve each trade") : "Not linked"} to="/account/security" cta="Manage" />
        <Stat label="Alerts" value={p?.telegram_verified ? "Telegram on" : "Telegram off"} to="/account/alerts" cta="Set up alerts" />
        <Stat label="AI strategies" value={plans.isPending ? "…" : `${livePlans} live`} to="/account/ai" cta="View plans" />
        <Stat label="API keys" value={keys.isPending ? "…" : `${liveKeys} enabled`} to="/account/api-keys" cta="Manage keys" />
        <Stat label="Member since" value={p ? new Date(p.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "…"} to="/account/profile" cta="Profile" />
        <Stat label="Invite friends" value="Your invite link" to="/account/referrals" cta="Get link" />
      </div>

      <Card
        title="Finish setting up"
        desc={`${doneCount} of ${steps.length} done`}
        right={<Button asChild size="sm" variant="outline"><Link to="/welcome" search={{ step: "welcome" }}><Sprout /> Open setup guide</Link></Button>}
      >
        <ol className="space-y-1">
          {steps.map((s) => (
            <li key={s.label}>
              <Link to={s.to} className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm hover:bg-muted">
                {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className={s.done ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-foreground"}>{s.label}</span>
                {!s.done ? <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /> : null}
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap gap-2 lg:hidden">
        <Button asChild variant="outline" size="sm"><Link to="/activity">Activity</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/p2p">P2P marketplace</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to="/swap">Swaps</Link></Button>
      </div>
    </div>
  );
}

function Stat({ label, value, to, cta }: { label: string; value: string; to: LinkProps["to"]; cta: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-display text-lg font-bold">{value}</p>
      <Link to={to} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">{cta} <ArrowRight className="h-3 w-3" /></Link>
    </div>
  );
}
