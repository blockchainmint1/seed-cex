import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, LogOut, XCircle } from "lucide-react";
import { getMyProfile } from "@/lib/profile.functions";
import { listApiKeys } from "@/lib/api-keys.functions";
import { signOutOfSeeds } from "@/lib/sign-out";
import { Button } from "@/components/ui/button";
import { Card, TabTitle } from "@/components/account/ui";
import { HmeWalletLinkCard } from "@/components/wallet/HmeWalletLinkCard";
import { usePocketLink } from "@/components/account/use-pocket";
import { TwoFactorCard, useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { LinkHistoryCard } from "@/components/account/LinkHistoryCard";
import { ConnectedAppsCard } from "@/components/account/ConnectedAppsCard";
import { KeyWithdrawSteps } from "@/components/account/KeyWithdrawSteps";
import { useMyIdentity } from "@/components/account/use-identity";
import { keyThing, relinkStep } from "@/lib/account/sign-in-kind";
import { IDENTITY_LABEL } from "@/lib/key-signin/rules";

type Check = { ok: boolean | "optional"; label: string; hint: string };

export const Route = createFileRoute("/_authenticated/account/security")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Security — Seeds" },
      { name: "description", content: "Your sign-in method, two-factor codes, linked HME Wallet trading pocket, revoke access, API key exposure and security notices." },
      { property: "og:title", content: "Security — Seeds" },
      { property: "og:description", content: "Sign-in, wallet link and access controls for your Seeds account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SecurityTab,
});

function SecurityTab() {
  const qc = useQueryClient();
  const loadProfile = useServerFn(getMyProfile);
  const loadKeys = useServerFn(listApiKeys);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => loadProfile() });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => loadKeys() });
  const link = usePocketLink();
  const twoFactor = useMyTwoFactor();
  const p = profile.data;
  const l = link.data;
  const tradeKeys = (keys.data ?? []).filter((k) => k.enabled && (k.scopes ?? []).includes("trade")).length;

  const id = useMyIdentity();
  const kind = id.keyKind;
  const d = id.data;
  const relink = relinkStep(kind ?? "hme");
  const relinkHint = l?.mode === "access" && l.withdrawals === "needs_relink"
    ? ` To allow withdrawals, ${relink}.`
    : l?.mode === "access" && l.withdrawals === "needs_2fa" ? ` Withdrawals need two-factor, then ${kind ? `signing in again with ${keyThing(kind)}` : "a re-link"}.` : "";

  const checks: Check[] = [
    kind
      ? { ok: true, label: `Sign-in with ${keyThing(kind)}`, hint: `${IDENTITY_LABEL[kind]} through the Seeds Key page. Seeds never saw your recovery phrase. Only ever use key.seeds.honest.money.` }
      : { ok: true, label: "Sign-in through Honest.Money", hint: "Seeds stores no password. Use a strong one and two-step sign-in on Honest.Money." },
    ...(kind ? [{ ok: Boolean(d?.email), label: "Email on your account", hint: d?.email ? `${d.email}. Withdrawal codes and security notices go here.` : "Add one in Profile. Needed for every withdrawal." }] : []),
    { ok: Boolean(twoFactor.data), label: "Two-factor sign-in on Seeds", hint: twoFactor.data ? "Withdrawals ask for a code from your phone." : "Set it up below. Needed for every withdrawal." },
    {
      ok: Boolean(l),
      label: kind ? "Trading pocket set up" : "HME Wallet trading pocket linked",
      hint: l
        ? `Pocket #${l.account}, ${l.mode === "access" ? "instant trades" : "you approve every trade"}.${relinkHint}`
        : kind ? `Sign in again with ${keyThing(kind)} to set up a new pocket.` : "Link it below, after turning on two-factor.",
    },
    { ok: Boolean(p?.telegram_verified && p?.notify_login), label: "Sign-in alerts on Telegram", hint: p?.telegram_verified ? (p.notify_login ? "You'll hear about every new sign-in." : "Turn on “New sign-in” in Alerts.") : "Connect Telegram in Alerts." },
    { ok: tradeKeys === 0 || (keys.data ?? []).every((k) => !k.enabled || (k.ip_allowlist ?? []).length > 0), label: "Trading API keys locked to IP addresses", hint: tradeKeys ? `${tradeKeys} key(s) can trade. Add an IP allowlist to each.` : "No trading keys." },
    ...(kind && d && !d.hmeMember ? [{ ok: "optional" as const, label: "Honest.Money membership (optional)", hint: "Not required. Join in Profile for Ignite, referrals and one login across the ecosystem; your pocket and coins stay put." }] : []),
  ];

  return (
    <div className="space-y-5">
      <TabTitle title="Security" desc="Who can get into your account, and what Seeds is allowed to do with your trading pocket." />

      <Card title="Security checkup">
        <ul className="space-y-3">
          {checks.map((c) => (
            <li key={c.label} className="flex gap-3">
              {c.ok === "optional" ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
              <span><span className="block text-sm">{c.label}</span><span className="block text-xs text-muted-foreground">{c.hint}</span></span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {kind ? <Button asChild variant="outline" size="sm"><Link to="/account/profile">Profile</Link></Button> : null}
          <Button asChild variant="outline" size="sm"><Link to="/account/alerts">Alerts</Link></Button>
          <Button asChild variant="outline" size="sm"><Link to="/account/api-keys">API keys</Link></Button>
        </div>
      </Card>

      <KeyWithdrawSteps />

      <TwoFactorCard />

      <div className="rounded-md border border-border bg-surface px-5">
        <HmeWalletLinkCard showBalances={false} className="py-6" />
      </div>

      <LinkHistoryCard />

      <ConnectedAppsCard />

      <Card title="Security emails" desc="Always on.">
        <p className="text-sm text-muted-foreground">
          We email you whenever a setting, API key or wallet link changes, even if you've switched other emails off. If you get one you didn't
          expect, revoke the {kind ? "trading pocket" : "wallet link"} above, delete your API keys and {kind ? "sign out" : "sign out of Honest.Money everywhere"}.
        </p>
      </Card>

      <Card title="Session">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{kind && !d?.hmeMember ? "Signs you out of Seeds on this device." : "Signs you out of Seeds and Honest.Money on this device."}</p>
          <Button variant="outline" onClick={() => signOutOfSeeds(qc)}><LogOut /> Sign out</Button>
        </div>
      </Card>
    </div>
  );
}
