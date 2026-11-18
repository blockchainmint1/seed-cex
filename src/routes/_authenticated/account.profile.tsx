import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, ExternalLink } from "lucide-react";
import { getMyProfile, updateMyProfile, type Profile } from "@/lib/profile.functions";
import { PAIRS } from "@/lib/chains";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, Note, Saved, TabTitle, Toggle, fieldLabel, inputCls } from "@/components/account/ui";

export const Route = createFileRoute("/_authenticated/account/profile")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Profile — Seeds" },
      { name: "description", content: "Your Honest.Money identity on Seeds, timezone and trading preferences." },
      { property: "og:title", content: "Profile — Seeds" },
      { property: "og:description", content: "Identity, timezone and trading preferences for your Seeds account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfileTab,
});

function ProfileTab() {
  const qc = useQueryClient();
  const { user } = useSession();
  const load = useServerFn(getMyProfile);
  const save = useServerFn(updateMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const p = profile.data;
  const [form, setForm] = useState<Partial<Profile>>({});
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (p) setForm(p); }, [p]);
  const patch = (v: Partial<Profile>) => { setSavedFor(null); setForm((f) => ({ ...f, ...v })); };

  const m = useMutation({
    mutationFn: (v: { section: string; data: Record<string, unknown> }) => save({ data: v.data }),
    onSuccess: (_r, v) => { setSavedFor(v.section); qc.invalidateQueries({ queryKey: ["my-profile"] }); },
  });

  const zones = Array.from(new Set([form.timezone || "UTC", "UTC", ...Intl.supportedValuesOf("timeZone")]));

  return (
    <div className="space-y-5">
      <TabTitle title="Profile" desc="Your identity comes from Honest.Money, so it's the same on every HME site." />

      <Card
        title="Identity"
        desc="Managed on Honest.Money — changes there update here automatically."
        right={<Button asChild variant="outline" size="sm"><a href="https://honest.money/dashboard/account" target="_blank" rel="noreferrer"><ExternalLink /> Edit on Honest.Money</a></Button>}
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          <Item label="Display name" value={p?.display_name || "—"} />
          <Item label="Email" value={user?.email || "—"} />
          <div>
            <dt className={fieldLabel}>Honest.Money member ID</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="min-w-0 truncate font-mono text-sm">{p?.hm_member_id || "—"}</span>
              {p?.hm_member_id ? (
                <button type="button" aria-label="Copy member ID" className="text-muted-foreground hover:text-primary"
                  onClick={async () => { try { await navigator.clipboard.writeText(p.hm_member_id!); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              ) : null}
            </dd>
          </div>
          <Item label="Membership" value={p?.hm_status || "—"} tone={p?.hm_status === "active" || p?.hm_status === "oceanfront" ? "ok" : "bad"} />
          <Item label="Seeds account since" value={p ? new Date(p.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—"} />
          <Item label="Sign-in" value="Honest.Money single sign-on" />
        </dl>
      </Card>

      <Card title="Region" desc="Used for times in emails, alerts and your P2P hours.">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ section: "tz", data: { timezone: form.timezone?.trim() || "UTC" } }); }}>
          <label className="block min-w-0 flex-1 sm:max-w-sm">
            <span className={fieldLabel}>Timezone</span>
            <select className={`${inputCls} mt-1`} value={form.timezone ?? "UTC"} onChange={(e) => patch({ timezone: e.target.value })}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <Button type="submit" disabled={m.isPending}>{m.isPending && m.variables?.section === "tz" ? "Saving…" : "Save"}</Button>
          {savedFor === "tz" ? <Saved /> : null}
        </form>
      </Card>

      <Card title="Trading preferences" desc="How the trading screen behaves for you.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate({ section: "trade", data: { default_pair: form.default_pair ?? null, confirm_before_order: Boolean(form.confirm_before_order) } }); }}>
          <label className="block sm:max-w-sm">
            <span className={fieldLabel}>Default market</span>
            <select className={`${inputCls} mt-1`} value={form.default_pair ?? ""} onChange={(e) => patch({ default_pair: e.target.value || null })}>
              <option value="">No preference</option>
              {PAIRS.map((pair) => <option key={pair.id} value={pair.id}>{pair.id.replace("_", " / ")}</option>)}
            </select>
          </label>
          <Toggle checked={Boolean(form.confirm_before_order)} onChange={(v) => patch({ confirm_before_order: v })} label="Confirm before placing an order" hint="Show a review step before every order." />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={m.isPending}>{m.isPending && m.variables?.section === "trade" ? "Saving…" : "Save preferences"}</Button>
            {savedFor === "trade" ? <Saved /> : null}
          </div>
        </form>
      </Card>
      {m.error ? <Note tone="error">{(m.error as Error).message}</Note> : null}
    </div>
  );
}

function Item({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="min-w-0">
      <dt className={fieldLabel}>{label}</dt>
      <dd className={`mt-1 truncate text-sm ${tone === "ok" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}
