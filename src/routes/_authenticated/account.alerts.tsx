import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile, updateMyProfile, type Profile } from "@/lib/profile.functions";
import { TelegramCard } from "@/components/account/TelegramCard";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, Note, Saved, TabTitle, Toggle } from "@/components/account/ui";

export const Route = createFileRoute("/_authenticated/account/alerts")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Alerts & notifications — Seeds" },
      { name: "description", content: "Connect Telegram in one tap and choose which trade, P2P, deposit, sign-in and weekly alerts and emails you get from Seeds." },
      { property: "og:title", content: "Alerts & notifications — Seeds" },
      { property: "og:description", content: "Telegram and email alerts for your Seeds account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlertsTab,
});

type Key = keyof Profile;
const GROUPS: { title: string; items: [Key, string, string][] }[] = [
  { title: "Trading", items: [
    ["notify_order_filled", "Order filled", "Your resting order got matched."],
    ["notify_settlement", "Settlement confirmed", "An on-chain leg confirmed."],
    ["notify_settlement_failed", "Settlement failed", "A leg failed and needs a retry."],
  ] },
  { title: "Wallet & security", items: [
    ["notify_deposit", "Deposit detected", "Funds landed in your trading pocket."],
    ["notify_auth_expiring", "Authorization expiring", "A trading authorization is about to end."],
    ["notify_login", "New sign-in", "Someone signed into your account."],
  ] },
  { title: "P2P & summaries", items: [
    ["notify_p2p", "P2P trades", "New buyer, payment sent, coins released, disputes, new chat messages."],
    ["notify_weekly_digest", "Weekly digest", "A Sunday summary of your trading."],
  ] },
];
const EMAILS: [Key, string, string][] = [
  ["email_trade_confirmations", "Trade & P2P confirmations", "A receipt when an exchange trade settles or a P2P trade opens."],
  ["email_weekly_update", "Weekly account update", "Monday summary of your trades, open orders and pocket."],
];
const TG_KEYS = GROUPS.flatMap((g) => g.items.map((i) => i[0]));

function AlertsTab() {
  const qc = useQueryClient();
  const { user } = useSession();
  const load = useServerFn(getMyProfile);
  const save = useServerFn(updateMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const p = profile.data;
  const [form, setForm] = useState<Partial<Profile>>({});
  const [savedFor, setSavedFor] = useState<string | null>(null);
  useEffect(() => { if (p) setForm(p); }, [p]);
  const patch = (v: Partial<Profile>) => { setSavedFor(null); setForm((f) => ({ ...f, ...v })); };

  const m = useMutation({
    mutationFn: (v: { section: string; data: Record<string, unknown> }) => save({ data: v.data }),
    onSuccess: (_r, v) => { setSavedFor(v.section); qc.invalidateQueries({ queryKey: ["my-profile"] }); },
  });
  return (
    <div className="space-y-5">
      <TabTitle title="Alerts" desc="Choose how Seeds reaches you. Telegram is instant; email is for receipts and summaries." />

      <TelegramCard />

      <Card title="What to alert me about" desc={p?.telegram_verified ? "Sent to your Telegram." : "These switch on once Telegram is connected."}>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate({ section: "tg", data: Object.fromEntries(TG_KEYS.map((k) => [k, Boolean(form[k])])) }); }}>
          <div className="grid gap-6 md:grid-cols-3">
            {GROUPS.map((g) => (
              <fieldset key={g.title} className="space-y-3">
                <legend className="mb-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{g.title}</legend>
                {g.items.map(([k, label, hint]) => <Toggle key={k} checked={Boolean(form[k])} onChange={(v) => patch({ [k]: v } as Partial<Profile>)} label={label} hint={hint} />)}
              </fieldset>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Button type="submit" disabled={m.isPending}>{m.isPending && m.variables?.section === "tg" ? "Saving…" : "Save alerts"}</Button>
            {savedFor === "tg" ? <Saved /> : null}
          </div>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Daily AI plan checks are switched per plan in <Link to="/account/ai" className="text-primary underline">AI strategies</Link>.</p>
      </Card>

      <Card title="Email" desc={`Sent to ${user?.email ?? "your Honest.Money email"}. Change it on Honest.Money.`}>
        <form onSubmit={(e) => { e.preventDefault(); m.mutate({ section: "email", data: Object.fromEntries(EMAILS.map(([k]) => [k, Boolean(form[k])])) }); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            {EMAILS.map(([k, label, hint]) => <Toggle key={k} checked={Boolean(form[k])} onChange={(v) => patch({ [k]: v } as Partial<Profile>)} label={label} hint={hint} />)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Security notices — a setting, API key or wallet link changing — always go out.</p>
          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={m.isPending}>{m.isPending && m.variables?.section === "email" ? "Saving…" : "Save email settings"}</Button>
            {savedFor === "email" ? <Saved /> : null}
          </div>
        </form>
      </Card>
      {m.error ? <Note tone="error">{(m.error as Error).message}</Note> : null}
    </div>
  );
}
