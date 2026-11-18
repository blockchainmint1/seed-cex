import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Check, TriangleAlert } from "lucide-react";
import type { PlanSettings } from "@/lib/ai/plan";
import { stableSeries } from "@/lib/ai/plan";
import { type Stats, scenarioKey, describeRules, findPlaybooks, GOALS, playbookCandidates, rankPlaybooks, type Goal, type PlaybookResult, type Ranked } from "@/lib/ai/playbook";
import { explainPlaybooks } from "@/lib/ai/playbook.functions";
import { fmtPct, fmtUsd, type Series } from "@/lib/ai/series";
import { Chip, tone } from "./ui";

/** What the finder keeps fixed: if any of these change, the old results no longer apply. */
const baseKey = (s: PlanSettings) => JSON.stringify([s.coins.filter((c) => c !== "tsd").sort(), s.start, s.end, s.amount, s.feeBps, s.weights, s.holdout]);
const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export function PlaybookFinder({ settings, series, loading, symbol, signedIn, onUse }: {
  settings: PlanSettings;
  series: Record<string, Series>;
  loading: boolean;
  symbol: (id: string) => string;
  signedIn: boolean;
  onUse: (s: PlanSettings) => void;
}) {
  const [goal, setGoal] = useState<Goal>("balanced");
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<(PlaybookResult & { key: string }) | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [note, setNote] = useState<{ goal: Goal; text?: string; error?: string; loading?: boolean } | null>(null);
  const cancel = useRef({ cancelled: false });
  const explain = useServerFn(explainPlaybooks);
  const total = useMemo(() => playbookCandidates(settings).length, [settings]);
  const stale = result && result.key !== baseKey(settings);
  const ranked = useMemo(() => (result ? rankPlaybooks(result.scenarios, goal) : []), [result, goal]);
  const myKey = scenarioKey(settings);
  const mine = ranked.find((r) => r.key === myKey);
  const top = ranked.slice(0, showAll ? 15 : 5);

  async function run() {
    cancel.current.cancelled = true;
    const token = { cancelled: false }; cancel.current = token;
    setNote(null); setShowAll(false);
    const withTsd = series["bitcoin"] ? { ...series, tsd: stableSeries(series["bitcoin"].days) } : series;
    setBusy({ done: 0, total });
    const res = await findPlaybooks(withTsd, settings, {
      signal: token,
      onProgress: (done, t) => setBusy({ done, total: t }),
      pause: () => new Promise((r) => setTimeout(r, 0)),
    });
    if (token.cancelled) return;
    setBusy(null);
    setResult(res ? { ...res, key: baseKey(settings) } : null);
  }

  async function askAi() {
    if (!result) return;
    const pickOf = (r: Ranked) => ({ rules: describeRules(r.settings, symbol), older: r.older, fresh: r.fresh, heldUp: r.heldUp, freshRank: r.freshRank, trades: r.trades, fees: Math.round(r.fees * 100) / 100 });
    const best = ranked[0]!;
    setNote({ goal, loading: true });
    try {
      const res = await explain({ data: {
        goal, from: result.from, split: result.split, to: result.to,
        coins: settings.coins.filter((c) => c !== "tsd").map(symbol), amount: settings.amount, total: ranked.length,
        holdOlder: best.holdOlder, holdFresh: best.holdFresh,
        picks: ranked.slice(0, 3).map(pickOf),
        mine: mine && mine.rank > 3 ? pickOf(mine) : undefined,
      } });
      setNote(res.ok ? { goal, text: res.text } : { goal, error: res.error });
    } catch {
      setNote({ goal, error: "The AI write-up isn't available right now. The ranking above is unaffected." });
    }
  }

  const coinsPicked = settings.coins.some((c) => c !== "tsd");

  return (
    <section className="rounded-sm border border-primary/40 bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="inline-flex items-center gap-2 font-display text-lg font-extrabold"><Sparkles className="h-4 w-4 text-primary" /> Find my playbook</h2>
          <p className="text-xs text-muted-foreground">
            Seeds AI tries {total} rule combinations on your coins, dates and money, then ranks them — honestly.
          </p>
        </div>
        <button
          type="button" onClick={run} disabled={loading || !!busy || !coinsPicked}
          className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-action-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? `Testing ${busy.done} of ${busy.total}…` : result && !stale ? "Run again" : "Find my playbook"}
        </button>
      </header>

      <div className="space-y-4 p-4">
        <div>
          <div className="label-caps mb-1">What matters most to you?</div>
          <div className="flex flex-wrap gap-1">
            {GOALS.map((g) => <Chip key={g.id} on={goal === g.id} onClick={() => setGoal(g.id)}>{g.label}</Chip>)}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{GOALS.find((g) => g.id === goal)!.blurb}</p>
        </div>

        {busy ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-label="Progress">
            <div className="h-full bg-primary transition-[width]" style={{ width: `${(busy.done / Math.max(1, busy.total)) * 100}%` }} />
          </div>
        ) : null}

        {!result && !busy ? (
          <p className="text-sm text-muted-foreground">
            It keeps your coins, dates, starting amount and trading cost, and changes only the rules: basket or strongest-coin,
            how often to check, when to sell to TSD, stop-losses and how much to keep in TSD.
          </p>
        ) : null}

        {result && stale && !busy ? (
          <p className="text-sm text-muted-foreground">Your coins, dates or money changed since this search. Press <span className="font-semibold">Run again</span> to search with the new ones.</p>
        ) : null}

        {result && !stale && !busy ? (
          <>
            <p className="rounded-sm border border-border bg-background p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">How it picks:</span> ranked only on <span className="num font-semibold text-foreground">{fmtDay(result.from)} → {fmtDay(result.split)}</span>.
              The newest stretch, <span className="num font-semibold text-foreground">{fmtDay(result.split)} → {fmtDay(result.to)}</span>, was hidden from the search and is used only
              to check each pick afterwards. A pick that did well before but badly after was probably just fitted to the past.
            </p>

            <ol className="space-y-2">
              {top.map((r) => <Row key={r.key} r={r} total={ranked.length} symbol={symbol} yours={r.key === myKey} onUse={() => onUse(r.settings)} />)}
            </ol>
            {mine && mine.rank > (showAll ? 15 : 5) ? (
              <div>
                <div className="label-caps mb-1">Your current settings, for comparison</div>
                <Row r={mine} total={ranked.length} symbol={symbol} yours />
              </div>
            ) : null}
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
              {showAll ? "Show top 5" : "Show top 15"}
            </button>

            <div className="rounded-sm border border-border p-3">
              {note && note.goal === goal && (note.text || note.error) ? (
                <div className="space-y-1">
                  <div className="label-caps">Seeds AI's take</div>
                  {note.text ? <p className="whitespace-pre-line text-sm">{note.text}</p> : <p className="text-sm text-muted-foreground">{note.error}</p>}
                </div>
              ) : signedIn ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">Want it in plain words? Seeds AI can explain the top picks and whether they held up.</p>
                  <button type="button" onClick={askAi} disabled={note?.loading} className="rounded-sm border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                    {note?.loading ? "Writing…" : "Explain these results"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link to="/auth" search={{ redirect: "/ai" }} className="font-semibold text-primary underline">Sign in</Link> to get Seeds AI's plain-words take on these results.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              The best rules for the past are not a promise for the future. Use a pick as a starting point, look at its trades below, and keep the amount small.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Row({ r, total, symbol, yours, onUse }: { r: Ranked; total: number; symbol: (id: string) => string; yours?: boolean; onUse?: () => void }) {
  return (
    <li className={`list-none rounded-sm border p-3 ${r.rank === 1 ? "border-primary bg-primary/5" : "border-border"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            <span className="num mr-1.5 font-display font-extrabold">#{r.rank}</span>
            {yours ? <span className="mr-1.5 rounded-sm border border-border px-1 text-[10px] font-semibold uppercase text-muted-foreground">Yours</span> : null}
            {describeRules(r.settings, symbol)}
          </div>
          <div className="num mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
            <span className="text-muted-foreground">Before: <Growth s={r.older} /></span>
            <span className="text-muted-foreground">worst drop {fmtPct(r.older.dd)}</span>
            <span className="text-muted-foreground">Fresh: <Growth s={r.fresh} /></span>
            <span className="text-muted-foreground">worst drop {fmtPct(r.fresh.dd)}</span>
          </div>
          <div className="num mt-1 text-xs text-muted-foreground">{r.trades} trades · {fmtUsd(r.fees)} costs · {r.daysInCash} days all in TSD</div>
        </div>
        <div className="flex flex-row-reverse items-center justify-between gap-1.5 sm:flex-col sm:items-end">
          {r.heldUp ? (
            <span className="inline-flex items-center gap-1 rounded-sm bg-bid/10 px-1.5 py-0.5 text-[11px] font-semibold text-bid"><Check className="h-3 w-3" /> Held up · #{r.freshRank} of {total} fresh</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-sm bg-ask/10 px-1.5 py-0.5 text-[11px] font-semibold text-ask"><TriangleAlert className="h-3 w-3" /> Faded · #{r.freshRank} of {total} fresh</span>
          )}
          {onUse && !yours ? (
            <button type="button" onClick={onUse} className="rounded-sm border border-primary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Use this</button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Yearly growth for stretches over a year, plain growth for shorter ones. */
function Growth({ s }: { s: Stats }) {
  const v = s.years > 1 ? s.cagr : s.ret;
  return <span className={tone(v)}>{fmtPct(v)}{s.years > 1 ? "/yr" : ""}</span>;
}
