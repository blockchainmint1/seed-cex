import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Pencil, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { TabTitle, Note } from "@/components/account/ui";
import { Loading, Panel } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CoinBanner, CoinSideCard, CoinStory, MarketsSponsoredRow, SpotlightCard } from "@/components/ads/AdSpots";
import { listAdsAdmin, saveAd, setAdState, type AdminAd } from "@/lib/ads/ads.functions";
import {
  AD_ACCENTS, AD_SPOTS, ADVERTISER_KIND_LABEL, ADVERTISER_KINDS, SPOT_INFO, clickRate, isRunning, safeAdLink,
  type AdAccent, type AdSpot, type AdvertiserKind, type ShownAd,
} from "@/lib/ads/ad-rules";
import { THOR_MARKETS, thorMarket } from "@/lib/markets/thor-markets";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/marketing/ads")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Ads — Seeds admin" },
      { name: "description", content: "Create, schedule, pause and end sponsored spots, and see their views and clicks." },
      { property: "og:title", content: "Ads — Seeds admin" },
      { property: "og:description", content: "Sponsored spots for ecosystem projects and coins listed on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdsAdmin,
});

const ACCENT_LABEL: Record<AdAccent, string> = { green: "Seed green", amber: "Amber", ivory: "Ivory", forest: "Forest" };

type Draft = {
  id?: string;
  spot: AdSpot;
  advertiser: string;
  advertiser_kind: AdvertiserKind;
  title: string;
  body: string;
  cta_label: string;
  link: string;
  coin_slug: string;
  accent: AdAccent;
  starts: string;
  ends: string;
  note: string;
};

/** A datetime-local value in this browser's time zone. */
function localInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const blank = (): Draft => ({
  spot: "home_spotlight", advertiser: "", advertiser_kind: "ecosystem", title: "", body: "", cta_label: "Learn more",
  link: "", coin_slug: "", accent: "green", starts: localInput(new Date().toISOString()), ends: "", note: "",
});

const fromAd = (a: AdminAd): Draft => ({
  id: a.id, spot: a.spot, advertiser: a.advertiser, advertiser_kind: a.advertiser_kind, title: a.title, body: a.body,
  cta_label: a.cta_label, link: a.link, coin_slug: a.coin_slug ?? "", accent: a.accent, starts: localInput(a.starts_at),
  ends: localInput(a.ends_at), note: a.note ?? "",
});

function status(a: AdminAd, now: number): { label: string; tone: string } {
  if (a.paused) return { label: "Paused", tone: "text-warning" };
  if (a.ends_at && Date.parse(a.ends_at) <= now) return { label: "Ended", tone: "text-muted-foreground" };
  if (Date.parse(a.starts_at) > now) return { label: "Scheduled", tone: "text-foreground" };
  return isRunning(a, now) ? { label: "Running", tone: "text-primary" } : { label: "Off", tone: "text-muted-foreground" };
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`grid gap-1.5 text-xs text-muted-foreground ${wide ? "md:col-span-2" : ""}`}>{label}{children}</label>;
}
const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

function Preview({ d }: { d: Draft }) {
  const ad: ShownAd = {
    id: "preview", spot: d.spot, advertiser: d.advertiser || "Advertiser", advertiser_kind: d.advertiser_kind,
    title: d.title || "Headline", body: d.body, cta_label: d.cta_label || "Learn more", link: safeAdLink(d.link) ?? "/",
    coin_slug: null, accent: d.accent, starts_at: new Date().toISOString(), ends_at: null, house: false,
  };
  const box = "rounded-sm border border-dashed border-border p-3";
  if (d.spot === "home_spotlight") return <div className={`${box} max-w-md`}><SpotlightCard ad={ad} /></div>;
  if (d.spot === "markets_row") return <div className={`${box} overflow-x-auto`}><table className="w-full"><tbody><MarketsSponsoredRow ad={ad} colSpan={1} /></tbody></table></div>;
  if (d.spot === "coin_side") return <div className={`${box} max-w-[300px]`}><CoinSideCard ad={ad} /></div>;
  if (d.spot === "coin_story") return <div className={box}><ul><CoinStory ad={ad} /></ul></div>;
  return <div className={`${box} [&>div]:mt-0`}><CoinBanner ad={ad} /></div>;
}

function AdsAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listAdsAdmin);
  const save = useServerFn(saveAd);
  const change = useServerFn(setAdState);
  const q = useQuery({ queryKey: ["admin-ads"], queryFn: () => list() });
  const [d, setD] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const info = SPOT_INFO[d.spot];
  const now = Date.now();

  async function refresh() {
    await Promise.all([qc.invalidateQueries({ queryKey: ["admin-ads"] }), qc.invalidateQueries({ queryKey: ["live-ads"] })]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!safeAdLink(d.link)) { setErr("The link must be a Seeds page (like /to-the-moon) or an https:// address."); return; }
    setBusy(true);
    try {
      await save({
        data: {
          ...(d.id ? { id: d.id } : {}),
          spot: d.spot, advertiser: d.advertiser, advertiser_kind: d.advertiser_kind, title: d.title, body: d.body,
          cta_label: d.cta_label, link: d.link, coin_slug: info.coinTargeted && d.coin_slug ? (d.coin_slug as never) : null,
          accent: d.accent, starts_at: new Date(d.starts || Date.now()).toISOString(), ends_at: d.ends ? new Date(d.ends).toISOString() : null,
          note: d.note.trim() || null,
        },
      });
      toast.success(d.id ? "Ad updated" : "Ad saved");
      setD(blank());
      await refresh();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't save the ad.");
    } finally { setBusy(false); }
  }

  async function act(a: AdminAd, action: "pause" | "resume" | "end") {
    if (action === "end" && !window.confirm(`End "${a.title}" now? It comes off the site straight away; its views and clicks stay here.`)) return;
    try {
      await change({ data: { id: a.id, action } });
      toast.success(action === "pause" ? "Paused" : action === "resume" ? "Running again" : "Ended");
      await refresh();
    } catch (x) {
      toast.error(x instanceof Error ? x.message : "Couldn't change the ad.");
    }
  }

  return (
    <div className="space-y-5">
      <TabTitle
        title="Ads"
        desc={<>Sponsored spots for Honest Money Ecosystem projects and coins listed on Seeds only. Every ad is labelled &ldquo;Sponsored&rdquo; with the advertiser&rsquo;s name. Empty spots show Seeds&rsquo; own notes or nothing. Ads are never deleted, so their views and clicks stay on record.</>}
      />

      <Panel title={d.id ? "Edit ad" : "New ad"} right={d.id ? <Button size="sm" variant="ghost" onClick={() => setD(blank())}>Cancel edit</Button> : null}>
        <form onSubmit={submit} className="grid gap-4 p-4 md:grid-cols-2">
          <Field label="Spot">
            <select value={d.spot} onChange={(e) => set("spot", e.target.value as AdSpot)} className={selectCls}>
              {AD_SPOTS.map((s) => <option key={s} value={s}>{SPOT_INFO[s].label}</option>)}
            </select>
            <span className="text-[11px]">{info.where}. Shows {info.max === 1 ? "one ad" : `up to ${info.max} ads`} at a time; more than that take turns by day.</span>
          </Field>
          {info.coinTargeted ? (
            <Field label="Coin page">
              <select value={d.coin_slug} onChange={(e) => set("coin_slug", e.target.value)} className={selectCls}>
                <option value="">Every coin page</option>
                {THOR_MARKETS.map((m) => <option key={m.slug} value={m.slug}>{m.base} — {m.name}</option>)}
              </select>
            </Field>
          ) : <div className="hidden md:block" />}
          <Field label="Advertiser (shown on the ad)">
            <Input value={d.advertiser} onChange={(e) => set("advertiser", e.target.value)} maxLength={80} required placeholder="e.g. ZeroChill" />
          </Field>
          <Field label="Who they are">
            <select value={d.advertiser_kind} onChange={(e) => set("advertiser_kind", e.target.value as AdvertiserKind)} className={selectCls}>
              {ADVERTISER_KINDS.map((k) => <option key={k} value={k}>{ADVERTISER_KIND_LABEL[k]}</option>)}
            </select>
            <span className="text-[11px]">Outside companies can't advertise on Seeds.</span>
          </Field>
          <Field label="Headline" wide>
            <Input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={90} required />
          </Field>
          <Field label="Text (optional, one or two plain sentences, no return promises)" wide>
            <Textarea value={d.body} onChange={(e) => set("body", e.target.value)} maxLength={200} rows={2} />
          </Field>
          <Field label="Button words">
            <Input value={d.cta_label} onChange={(e) => set("cta_label", e.target.value)} maxLength={30} required />
          </Field>
          <Field label="Link (a Seeds page like /trade/zcu-tsd, or https://…)">
            <Input value={d.link} onChange={(e) => set("link", e.target.value)} maxLength={500} required />
          </Field>
          <Field label="Colour">
            <select value={d.accent} onChange={(e) => set("accent", e.target.value as AdAccent)} className={selectCls}>
              {AD_ACCENTS.map((a) => <option key={a} value={a}>{ACCENT_LABEL[a]}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input type="datetime-local" value={d.starts} onChange={(e) => set("starts", e.target.value)} required />
            </Field>
            <Field label="Ends (optional)">
              <Input type="datetime-local" value={d.ends} onChange={(e) => set("ends", e.target.value)} />
            </Field>
          </div>
          <Field label="Internal note (admins only: package, payment, contact)" wide>
            <Textarea value={d.note} onChange={(e) => set("note", e.target.value)} maxLength={500} rows={2} />
          </Field>
          <div className="md:col-span-2">
            <p className="mb-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Preview</p>
            <Preview d={d} />
          </div>
          {err ? <div className="md:col-span-2"><Note tone="error">{err}</Note></div> : null}
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : d.id ? "Save changes" : "Save ad"}</Button>
          </div>
        </form>
      </Panel>

      <Panel title={`All ads · ${q.data?.length ?? 0}`}>
        {q.isPending ? <div className="p-4"><Loading /></div> : q.error ? <p role="alert" className="p-4 text-sm text-destructive">Couldn't load the ads. Refresh to retry.</p> : (q.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No ads yet. Until you add one, the homepage spotlight, coin side card and coin banner show Seeds&rsquo; own notes, and the other spots stay empty.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-border text-left font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  <th className="px-4 py-2 font-normal">Ad</th>
                  <th className="px-3 py-2 font-normal">Spot</th>
                  <th className="px-3 py-2 font-normal">Status</th>
                  <th className="px-3 py-2 text-right font-normal">Views</th>
                  <th className="px-3 py-2 text-right font-normal">Clicks</th>
                  <th className="px-3 py-2 text-right font-normal">Click rate</th>
                  <th className="px-3 py-2 text-right font-normal">Last 7 days</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((a) => {
                  const st = status(a, now);
                  const rate = clickRate(a.stats.views, a.stats.clicks);
                  const coin = a.coin_slug ? thorMarket(a.coin_slug)?.base ?? a.coin_slug : null;
                  return (
                    <tr key={a.id} className="border-b border-border/50 align-top last:border-b-0">
                      <td className="max-w-[18rem] px-4 py-2.5">
                        <p className="truncate font-semibold">{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{a.advertiser} · {ADVERTISER_KIND_LABEL[a.advertiser_kind]}</p>
                        {a.note ? <p className="truncate text-[11px] text-muted-foreground">{a.note}</p> : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{SPOT_INFO[a.spot].label}{SPOT_INFO[a.spot].coinTargeted ? <span className="block text-muted-foreground">{coin ?? "Every coin page"}</span> : null}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={`font-semibold ${st.tone}`}>{st.label}</span>
                        <span className="block text-muted-foreground">
                          {new Date(a.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} → {a.ends_at ? new Date(a.ends_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "no end"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{a.stats.views.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{a.stats.clicks.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{rate == null ? "—" : `${rate}%`}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{a.stats.views7.toLocaleString()} / {a.stats.clicks7.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setD(fromAd(a)); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="Edit ad"><Pencil /></Button>
                          {st.label === "Ended" ? null : a.paused ? (
                            <Button size="sm" variant="ghost" onClick={() => act(a, "resume")} aria-label="Resume ad"><Play /></Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => act(a, "pause")} aria-label="Pause ad"><Pause /></Button>
                          )}
                          {st.label === "Ended" ? null : <Button size="sm" variant="ghost" onClick={() => act(a, "end")} aria-label="End ad now"><Square /></Button>}
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">edited {fmtAgo(a.updated_at)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Views count once per visitor tab when half the ad is on screen; clicks count each press. Daily totals only, from the live site — the preview isn&rsquo;t counted.
        </p>
      </Panel>
    </div>
  );
}
