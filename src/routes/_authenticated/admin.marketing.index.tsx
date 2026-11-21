import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Card, Note, TabTitle, inputCls } from "@/components/account/ui";
import { Loading, Pager, Panel, Stat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { ContactIcons, GradePill, money } from "@/components/admin/recruit/bits";
import { LeadDetail } from "@/components/admin/recruit/LeadDetail";
import { findRecruitLeads, getRecruitOverview, importRecruitLeads, listRecruitLeads } from "@/lib/recruit/recruit.functions";
import { PASTE_MAX_LINES, SOURCE_LABEL, STAGES, STAGE_INFO, type Stage } from "@/lib/recruit/recruit-rules";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/marketing/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Coin recruiting — Seeds admin" },
      { name: "description", content: "Find, score and invite coin teams to list on Seeds, with AI-drafted outreach the team approves." },
      { property: "og:title", content: "Coin recruiting — Seeds admin" },
      { property: "og:description", content: "Find, score and invite coin teams to list on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Recruiting,
});

const n = (v: number) => v.toLocaleString("en-US");
const SIZES = [25, 50, 100, 200] as const;
type Filter = { stage: "all" | "open" | Stage; grade: "all" | "A" | "B" | "C" | "D"; q: string; sort: "score" | "newest" | "volume" | "updated" };

function Recruiting() {
  const loadOverview = useServerFn(getRecruitOverview);
  const ov = useQuery({ queryKey: ["recruit-overview"], queryFn: () => loadOverview(), retry: false });
  const [filter, setFilter] = useState<Filter>({ stage: "open", grade: "all", q: "", sort: "score" });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(50);
  const [open, setOpen] = useState<string | null>(null);
  const set = (p: Partial<Filter>) => { setFilter({ ...filter, ...p }); setPage(0); };

  return (
    <div className="space-y-5">
      <TabTitle title="Coin recruiting" desc="Goal: 10,000,000 trade pairs. Find coin teams, see how good a fit each one is, and send them a personal invite to list. The AI writes first drafts; a person reads, edits and sends every message." />
      {ov.isPending ? <Loading /> : ov.error ? <Note tone="error">Couldn't load recruiting. Refresh to retry.</Note> : ov.data ? <Goal o={ov.data} onStage={(s) => set({ stage: s })} active={filter.stage} /> : null}
      <Finder exchanges={ov.data?.exchanges ?? []} />
      <Leads filter={filter} set={set} page={page} setPage={setPage} size={size} setSize={(s) => { setSize(s); setPage(0); }} onOpen={setOpen} />
      <LeadDetail id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Goal({ o, onStage, active }: { o: Awaited<ReturnType<typeof getRecruitOverview>>; onStage: (s: Stage) => void; active: string }) {
  const pct = Math.min(100, (o.goal.coinsNow / o.goal.coinsNeeded) * 100);
  return (
    <Card title="Goal: 10,000,000 trade pairs" desc={`Every coin on Seeds can be swapped for every other through TSD, so ${n(o.goal.coinsNeeded)} coins make ${n(o.goal.pairs)} pairs.`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Coins Seeds trades" value={n(o.goal.coinsNow)} />
        <Stat label="Pairs today" value={n(o.goal.pairsNow)} />
        <Stat label="Coins still needed" value={n(Math.max(0, o.goal.coinsNeeded - o.goal.coinsNow))} tone="warn" />
        <Stat label="Listing applications" value={`${n(o.applications)} · ${n(o.listingsLive)} live`} tone={o.listingsLive ? "good" : undefined} />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Coins toward the goal">
        <div className="h-full bg-action" style={{ width: `${Math.max(pct, 0.5)}%` }} />
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{pct.toFixed(1)}% of the coins needed · {n(o.total)} leads · {n(o.gradeA)} grade A still open · {n(o.messagesSent)} messages sent · {n(o.aiDraftsLeft)} AI drafts left today</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button key={s} type="button" onClick={() => onStage(s)} title={STAGE_INFO[s].hint}
            className={`rounded-sm border px-2.5 py-1 text-xs ${active === s ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary"}`}>
            {STAGE_INFO[s].label} <b className="num text-foreground">{n(o.stages[s] ?? 0)}</b>
          </button>
        ))}
      </div>
    </Card>
  );
}

function Finder({ exchanges }: { exchanges: { slug: string; label: string }[] }) {
  const qc = useQueryClient();
  const find = useServerFn(findRecruitLeads);
  const paste = useServerFn(importRecruitLeads);
  const [mode, setMode] = useState<"cmc" | "paste">("cmc");
  const [source, setSource] = useState<"cmc_new" | "cmc_midsize" | "exchange">("cmc_midsize");
  const [exchange, setExchange] = useState("mexc");
  const [limit, setLimit] = useState(50);
  const [minVolume, setMinVolume] = useState(10_000);
  const [text, setText] = useState("");
  const [from, setFrom] = useState("bitmart");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const done = () => Promise.all([qc.invalidateQueries({ queryKey: ["recruit-leads"] }), qc.invalidateQueries({ queryKey: ["recruit-overview"] })]);
  async function runFind() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await find({ data: { source, ...(source === "exchange" ? { exchange } : {}), limit, minVolume } });
      setResult(`Added ${n(r.added)} new leads. Checked ${n(r.checked)} coins: ${n(r.already)} already in your list, ${n(r.onSeeds)} already on Seeds, ${n(r.notTeam)} not coin teams (stocks, stablecoins, wrapped coins), ${n(r.quiet)} under your daily-trading minimum.`);
      if (r.added) toast.success(`${r.added} new leads`);
      await done();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't search."); }
    finally { setBusy(false); }
  }
  async function runPaste() {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await paste({ data: { text, ...(from.trim() ? { from: from.trim() } : {}) } });
      setResult(`Read ${n(r.read)} coins, added ${n(r.added)} new. ${n(r.already)} were already in your list, ${n(r.onSeeds)} already trade on Seeds.${r.skippedLines.length ? ` Skipped line${r.skippedLines.length === 1 ? "" : "s"} ${r.skippedLines.slice(0, 12).join(", ")}${r.skippedLines.length > 12 ? "…" : ""} (need a name and a ticker).` : ""}`);
      if (r.added) { toast.success(`${r.added} new leads`); setText(""); }
      await done();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't read that list."); }
    finally { setBusy(false); }
  }

  const tab = (m: typeof mode, label: string) => (
    <button type="button" onClick={() => setMode(m)} className={`rounded-sm px-3 py-1.5 text-sm ${mode === m ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );
  return (
    <Card title="Find coin teams" right={<div className="flex gap-1">{tab("cmc", "Search CoinMarketCap")}{tab("paste", "Paste a list")}</div>}>
      {mode === "cmc" ? (
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-muted-foreground">Where to look
            <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={inputCls}>
              <option value="cmc_midsize">Mid-size coins ($1M–$250M), busiest first</option>
              <option value="cmc_new">Newest on CoinMarketCap</option>
              <option value="exchange">Coins on another exchange</option>
            </select>
          </label>
          {source === "exchange" ? (
            <label className="grid gap-1 text-xs text-muted-foreground">Exchange
              <select value={exchange} onChange={(e) => setExchange(e.target.value)} className={inputCls}>
                {exchanges.map((x) => <option key={x.slug} value={x.slug}>{x.label}</option>)}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1 text-xs text-muted-foreground">How many new leads
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className={inputCls}>
              {[25, 50, 100, 200].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">Least daily trading
            <select value={minVolume} onChange={(e) => setMinVolume(Number(e.target.value))} className={inputCls}>
              {[0, 1_000, 10_000, 50_000, 250_000, 1_000_000].map((v) => <option key={v} value={v}>{v ? `$${n(v)}` : "Any"}</option>)}
            </select>
          </label>
          <div className="md:col-span-4">
            <Button disabled={busy} onClick={runFind}><Search /> {busy ? "Searching and scoring…" : "Find and score"}</Button>
            <p className="mt-2 text-[11px] text-muted-foreground">Skips coins already in your list, coins Seeds already trades, tokenized stocks, stablecoins and wrapped coins. A search of 50 uses about 10 of CoinMarketCap's 2 million monthly credits.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">One coin per line: name, ticker, then any links (website, X, Telegram, Discord, email, contract), separated by commas or tabs. Up to {PASTE_MAX_LINES} lines.
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className={`${inputCls} font-mono text-xs`} placeholder={"Moon Coin, MOON, https://mooncoin.io, x.com/mooncoin, t.me/mooncoin\nTree Token, TREE, treetoken.org, team@treetoken.org"} />
          </label>
          <label className="grid max-w-xs gap-1 text-xs text-muted-foreground">Where's this list from? (BitMart leads get a bonus)
            <input value={from} onChange={(e) => setFrom(e.target.value)} maxLength={60} className={inputCls} placeholder="e.g. bitmart, conference, referral" />
          </label>
          <div><Button disabled={busy || !text.trim()} onClick={runPaste}>{busy ? "Reading…" : "Add these coins"}</Button></div>
        </div>
      )}
      {err ? <div className="mt-3"><Note tone="error">{err}</Note></div> : null}
      {result ? <div className="mt-3"><Note tone="ok">{result}</Note></div> : null}
    </Card>
  );
}

function Leads({ filter, set, page, setPage, size, setSize, onOpen }: {
  filter: Filter; set: (p: Partial<Filter>) => void; page: number; setPage: (p: number) => void; size: number; setSize: (s: number) => void; onOpen: (id: string) => void;
}) {
  const load = useServerFn(listRecruitLeads);
  const [q, setQ] = useState(filter.q);
  const res = useQuery({ queryKey: ["recruit-leads", filter, page, size], queryFn: () => load({ data: { ...filter, page, size } }), placeholderData: keepPreviousData });
  const total = res.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <Panel
      title={`Leads · ${n(total)}`}
      right={
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); set({ q }); }} className="flex items-center gap-1">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ticker" className={`${inputCls} h-8 w-40 py-1`} />
            <Button size="sm" variant="outline" type="submit" aria-label="Search"><Search /></Button>
          </form>
          <select value={filter.stage} onChange={(e) => set({ stage: e.target.value as Filter["stage"] })} className={`${inputCls} h-8 w-auto py-1`} aria-label="Stage">
            <option value="open">Open leads</option>
            <option value="all">Every stage</option>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_INFO[s].label}</option>)}
          </select>
          <select value={filter.grade} onChange={(e) => set({ grade: e.target.value as Filter["grade"] })} className={`${inputCls} h-8 w-auto py-1`} aria-label="Grade">
            <option value="all">Any grade</option>
            {(["A", "B", "C", "D"] as const).map((g) => <option key={g} value={g}>Grade {g}</option>)}
          </select>
          <select value={filter.sort} onChange={(e) => set({ sort: e.target.value as Filter["sort"] })} className={`${inputCls} h-8 w-auto py-1`} aria-label="Sort">
            <option value="score">Best score</option>
            <option value="volume">Most trading</option>
            <option value="newest">Newest found</option>
            <option value="updated">Recently changed</option>
          </select>
        </div>
      }
    >
      {res.isPending ? <div className="p-4"><Loading /></div> : res.error ? <p role="alert" className="p-4 text-sm text-destructive">Couldn't load the leads. Refresh to retry.</p> : !res.data?.rows.length ? (
        <p className="p-4 text-sm text-muted-foreground">No leads here yet. Use “Find coin teams” above to add some.</p>
      ) : (
        <>
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-normal">Coin</th>
                <th className="px-3 py-2 text-left font-normal">Score</th>
                <th className="px-3 py-2 text-left font-normal">Stage</th>
                <th className="px-3 py-2 text-right font-normal">Traded 24h</th>
                <th className="px-3 py-2 text-right font-normal">Market size</th>
                <th className="px-3 py-2 text-right font-normal">Markets</th>
                <th className="px-3 py-2 text-left font-normal">Contact</th>
                <th className="px-3 py-2 text-left font-normal">Found via</th>
                <th className="px-4 py-2 text-right font-normal">Changed</th>
              </tr>
            </thead>
            <tbody>
              {res.data.rows.map((r) => (
                <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer border-b border-border/50 hover:bg-muted/40">
                  <td className="px-4 py-2">
                    <button type="button" className="text-left font-semibold hover:text-primary" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>{r.name}</button>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{r.symbol}</span>
                    {r.application ? <span className="ml-1.5 rounded-sm bg-primary/10 px-1 font-mono text-[10px] text-primary">applied</span> : null}
                  </td>
                  <td className="px-3 py-2"><GradePill score={r.score} /></td>
                  <td className="px-3 py-2 text-xs">{STAGE_INFO[r.stage].label}</td>
                  <td className="num px-3 py-2 text-right">{money(r.volume_24h_usd)}</td>
                  <td className="num px-3 py-2 text-right">{money(r.market_cap_usd)}</td>
                  <td className="num px-3 py-2 text-right">{r.num_market_pairs ?? "—"}</td>
                  <td className="px-3 py-2"><ContactIcons website={r.website} twitter={r.twitter} telegram={r.telegram} email={r.email} /></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{SOURCE_LABEL[r.source]}{r.source_detail ? ` · ${r.source_detail}` : ""}</td>
                  <td className="px-4 py-2 text-right font-mono text-[11px] text-muted-foreground">{fmtAgo(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager page={page} pages={pages} from={page * size + 1} to={Math.min(total, page * size + size)} total={total} size={size} sizes={SIZES} onPage={setPage} onSize={setSize} />
        </>
      )}
    </Panel>
  );
}
