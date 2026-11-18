import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiSeriesQuery, type AiCoin } from "@/lib/ai/market";
import { basketTargets, defaultPlan, isStable, runPlan, stableSeries, STOP_REENTRY_MA, type PlanSettings } from "@/lib/ai/plan";
import { fmtPct, fmtUsd, type Series } from "@/lib/ai/series";
import { Chip, Field, inputCls, Panel, tone } from "./ui";
import { LockPanel, type EditingPlan } from "./LockPanel";
import { DailyPrices, TradeActions } from "./ShowWork";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const RANGES = [["3 mo", 3], ["6 mo", 6], ["1 yr", 12], ["2 yr", 24], ["3 yr", 36], ["5 yr", 60]] as const;
const monthsAgo = (m: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };

/** One-tap starting points for the cash rules: the same three rules, set together. */
const CASH_PRESETS = [
  { label: "Off", days: 0, stopLoss: 0, reserve: 0, blurb: "No cash rules — every coin stays invested." },
  { label: "Cash buffer", days: 0, stopLoss: 0, reserve: 10, blurb: "Keep 10% in TSD at all times; nothing is ever sold on a rule." },
  { label: "Balanced", days: 50, stopLoss: 20, reserve: 10, blurb: "Sell a coin below its 50-day average, stop out after a 20% drop, keep 10% in TSD." },
  { label: "Defensive", days: 50, stopLoss: 15, reserve: 25, blurb: "Sell a coin below its 50-day average, stop out after a 15% drop, keep 25% in TSD." },
] as const;
const MA_CHOICES = [20, 50, 200];
const STOP_CHOICES = [10, 20, 30];
const RESERVE_CHOICES = [0, 10, 25, 50];

export function PlanBuilder({ coins, settings, onChange, signedIn, editing, onStopEditing, started, onStart }: {
  coins: AiCoin[];
  settings: PlanSettings;
  onChange: (s: PlanSettings) => void;
  signedIn: boolean;
  /** A locked plan being changed (from Profile → AI strategies). */
  editing?: EditingPlan | null;
  onStopEditing?: () => void;
  /** False until the member runs a test or changes a setting: the page opens on a blank chart. */
  started: boolean;
  onStart: () => void;
}) {
  const s = settings;
  const set = <K extends keyof PlanSettings>(k: K, v: PlanSettings[K]) => onChange({ ...s, [k]: v });
  const num = (k: keyof PlanSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const symbol = (id: string) => (id === "tsd" ? "TSD" : coins.find((c) => c.id === id)?.symbol.toUpperCase() ?? id);

  /** The cash-rule field the current kind of plan uses, so a preset can light up correctly either way. */
  const cashDays = s.mode === "basket" ? s.exitMA : s.trendMA;
  const presetOn = (p: (typeof CASH_PRESETS)[number]) => cashDays === p.days && s.stopLoss === p.stopLoss && s.reserve === p.reserve;
  const activePreset = CASH_PRESETS.find(presetOn);
  const applyPreset = (p: (typeof CASH_PRESETS)[number]) => onChange({ ...s, exitMA: p.days, trendMA: p.days, stopLoss: p.stopLoss, reserve: p.reserve });

  const ids = useMemo(() => Array.from(new Set(["bitcoin", ...s.coins.filter((id) => !isStable(id))])), [s.coins]);
  const qs = useQueries({ queries: ids.map((id) => aiSeriesQuery(id)) });
  const loading = qs.some((q) => q.isLoading);
  const series = useMemo(() => {
    const out = Object.fromEntries(ids.map((id, i) => [id, qs[i]!.data]).filter(([, d]) => d)) as Record<string, Series>;
    if (out["bitcoin"]) out["tsd"] = stableSeries(out["bitcoin"].days);
    return out;
  }, [ids, qs]);
  const run = useMemo(() => (loading ? null : runPlan(series, s)), [loading, series, s]);
  const targets = basketTargets(s);

  function toggleCoin(id: string) {
    const on = s.coins.includes(id);
    const coinsNext = on ? s.coins.filter((x) => x !== id) : [...s.coins, id];
    const weights = { ...s.weights };
    if (on) delete weights[id];
    onChange({ ...s, coins: coinsNext, weights });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className="order-2 space-y-5 self-start rounded-sm border border-border bg-surface p-4 lg:order-1">
        <div>
          <h2 className="font-display text-xl font-extrabold">Build your plan</h2>
          <p className="text-xs text-muted-foreground">Every decision uses only prices known on that day.</p>
        </div>

        <Field label="Kind of plan">
          <div className="grid grid-cols-2 gap-1">
            <Chip on={s.mode === "basket"} onClick={() => set("mode", "basket")}>Hold a basket</Chip>
            <Chip on={s.mode === "momentum"} onClick={() => set("mode", "momentum")}>Follow the strongest</Chip>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {s.mode === "basket"
              ? "Keep set shares of each coin and rebalance back to them."
              : "Every check, hold only the coins that rose the most lately."}
          </p>
        </Field>

        <Field label="Coins" hint="Only coins Seeds can buy for you.">
          <div className="flex flex-wrap gap-1">
            {coins.map((c) => <Chip key={c.id} on={s.coins.includes(c.id)} onClick={() => toggleCoin(c.id)}>{c.symbol}</Chip>)}
          </div>
        </Field>

        {s.mode === "basket" && s.coins.length ? (
          <SharesField coins={s.coins} weights={s.weights} targets={targets} symbol={symbol} onChange={(w) => set("weights", w)} />
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting amount (TSD)"><input type="number" min={1} className={inputCls} value={s.amount} onChange={num("amount")} /></Field>
          <Field label="Weekly top-up (TSD)"><input type="number" min={0} className={inputCls} value={s.weeklyAdd} onChange={num("weeklyAdd")} /></Field>
        </div>

        <Field label="Going back">
          <div className="flex flex-wrap gap-1">
            {RANGES.map(([l, m]) => {
              const iso = monthsAgo(m);
              return <Chip key={l} on={s.start === iso && !s.end} onClick={() => onChange({ ...s, start: iso, end: "" })}>{l}</Chip>;
            })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><input type="date" className={inputCls} value={s.start} onChange={(e) => set("start", e.target.value)} /></Field>
          <Field label="End"><input type="date" className={inputCls} value={s.end} onChange={(e) => set("end", e.target.value)} /></Field>
        </div>

        <Field label="Check and adjust">
          <div className="flex gap-1">
            {(["daily", "weekly", "monthly"] as const).map((r) => <Chip key={r} on={s.rebalance === r} onClick={() => set("rebalance", r)}>{r}</Chip>)}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          {s.mode === "basket" ? (
            <Field label="Rebalance band %" hint="Only trade when a coin is this far off (0 = always)"><input type="number" min={0} max={50} className={inputCls} value={s.drift} onChange={num("drift")} /></Field>
          ) : (
            <>
              <Field label="Momentum days" hint="Rank by gain over this many days"><input type="number" min={1} className={inputCls} value={s.lookback} onChange={num("lookback")} /></Field>
              <Field label="Hold top" hint="Number of coins"><input type="number" min={1} className={inputCls} value={s.topK} onChange={num("topK")} /></Field>
              <Field label="Max per coin %"><input type="number" min={1} max={100} className={inputCls} value={s.cap} onChange={num("cap")} /></Field>
            </>
          )}
          <Field label="Trading cost %" hint="Per trade, swap fees included"><input type="number" min={0} step={0.01} className={inputCls} value={s.feeBps / 100} onChange={(e) => set("feeBps", Number(e.target.value) * 100)} /></Field>
          <Field label="Fresh-data slice %" hint="Recent part kept as a fresh test"><input type="number" min={0} max={80} className={inputCls} value={s.holdout} onChange={num("holdout")} /></Field>
        </div>
        <div className="space-y-3 rounded-sm border border-border p-3">
          <div>
            <h3 className="font-semibold">Go to cash (TSD) when…</h3>
            <p className="text-xs text-muted-foreground">Rules that sell to TSD in a bad market. Pick a starting point, or set each rule yourself. 0 turns a rule off.</p>
          </div>
          <div>
            <div className="flex flex-wrap gap-1">
              {CASH_PRESETS.map((p) => (
                <Chip key={p.label} small on={presetOn(p)} onClick={() => applyPreset(p)}>{p.label}</Chip>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{activePreset ? activePreset.blurb : "Set by hand — the rules below don't match a preset."}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {s.mode === "basket" ? (
              <NumField
                label="Below average (days)"
                hint="Sell a coin that closes below its average over this many days; buy back when it's above"
                value={s.exitMA ?? 0} max={365} choices={MA_CHOICES} offLabel="Off"
                onChange={(v) => set("exitMA", v)}
              />
            ) : (
              <NumField
                label="Below average (days)"
                hint="Skip coins below their average over this many days"
                value={s.trendMA} max={365} choices={MA_CHOICES} offLabel="Off"
                onChange={(v) => set("trendMA", v)}
              />
            )}
            <NumField
              label="Stop-loss %"
              hint={`Sell if down this much from its high; buy back once above its ${cashDays || STOP_REENTRY_MA}-day average`}
              value={s.stopLoss} max={90} choices={STOP_CHOICES} offLabel="Off"
              onChange={(v) => set("stopLoss", v)}
            />
            <NumField
              label="Always keep in TSD %"
              hint="Never invested"
              value={s.reserve} max={90} choices={RESERVE_CHOICES}
              onChange={(v) => set("reserve", v)}
            />
          </div>
        </div>

        <button type="button" onClick={() => onChange({ ...defaultPlan })} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Reset to the starter plan</button>
      </aside>

      <section className="order-1 min-w-0 space-y-6 lg:order-2">
        {!started ? (
          <BlankStart onStart={onStart} />
        ) : !run ? (
          <p className="text-sm text-muted-foreground">Loading price history…</p>
        ) : run.error ? (
          <Panel>{run.error}</Panel>
        ) : (
          <>
            <TestedPeriod from={run.points[0]?.day} to={run.points.at(-1)?.day} />
            <div className="grid gap-3 sm:grid-cols-3">
              {([["Your plan", run.plan], ["Buy & hold these coins", run.hold], ["Just Bitcoin", run.btc]] as const).map(([label, r]) => (
                <div key={label} className="rounded-sm border border-border bg-surface p-4">
                  <div className="label-caps">{label}</div>
                  <div className="num mt-1 font-display text-2xl font-bold">{fmtUsd(r.finalValue)}</div>
                  <div className={`num text-sm ${tone(r.totalReturn)}`}>{fmtPct(r.totalReturn)}</div>
                  <div className="num mt-2 text-xs text-muted-foreground">Worst drop {fmtPct(r.maxDrawdown)}</div>
                </div>
              ))}
            </div>

            <div className="h-80 rounded-sm border border-border bg-surface p-3">
              <ResponsiveContainer>
                <LineChart data={run.points}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" minTickGap={60} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis scale="log" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={70} tickFormatter={(v) => fmtUsd(v)} />
                  <Tooltip formatter={(v: number) => fmtUsd(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                  <Legend />
                  <Line dataKey="plan" name="Your plan" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
                  <Line dataKey="hold" name="Buy & hold" stroke="var(--chart-2)" dot={false} strokeWidth={1} />
                  <Line dataKey="btc" name="Bitcoin" stroke="var(--chart-3)" dot={false} strokeWidth={1} />
                  <Line dataKey="cash" name="Money put in" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} strokeWidth={1} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-3 rounded-sm border border-border bg-surface p-4 text-sm sm:grid-cols-3">
              <div>
                <div className="label-caps">Total put in</div>
                <div className="num font-display text-2xl font-bold">{fmtUsd(run.plan.totalIn)}</div>
                <div className="num text-xs text-muted-foreground">{fmtUsd(s.amount)} start + {fmtUsd(run.plan.totalIn - s.amount)} top-ups</div>
              </div>
              <div>
                <div className="label-caps">Worth on {run.points.at(-1)?.day}</div>
                <div className="num font-display text-2xl font-bold">{fmtUsd(run.plan.finalValue)}</div>
              </div>
              <div>
                <div className="label-caps">Gain / loss</div>
                <div className={`num font-display text-2xl font-bold ${tone(run.plan.finalValue - run.plan.totalIn)}`}>{fmtUsd(run.plan.finalValue - run.plan.totalIn)}</div>
                <div className="num text-xs text-muted-foreground">{fmtPct(run.plan.totalReturn)} on money put in</div>
              </div>
            </div>

            <HoldNow run={run} symbol={symbol} />

            <LockPanel settings={s} signedIn={signedIn} editing={editing} onStopEditing={onStopEditing} />

            <div className="grid gap-3 sm:grid-cols-2">
              <Panel title="Costs & activity">
                <p className="num text-sm">{run.plan.trades} trades · {fmtUsd(run.plan.fees)} in costs · {run.plan.daysInCash} days all in TSD</p>
              </Panel>
              {run.split && run.inSample && run.outSample ? (
                <Panel title="Fresh-data check">
                  <p className="text-xs text-muted-foreground">If a plan only wins in the older part, it was probably tuned to the past.</p>
                  <p className="num mt-2 text-sm">Before {run.split}: plan {fmtPct(run.inSample[0])} vs hold {fmtPct(run.inSample[1])}</p>
                  <p className="num text-sm">From {run.split}: plan {fmtPct(run.outSample[0])} vs hold {fmtPct(run.outSample[1])}</p>
                </Panel>
              ) : null}
            </div>

            <div className="space-y-1">
              <h2 className="font-display text-xl font-extrabold">Show the work</h2>
              <p className="text-sm text-muted-foreground">Every number above comes from these two tables. Download either one to check it yourself.</p>
            </div>
            <TradeActions run={run} symbol={symbol} />
            <DailyPrices run={run} series={series} coins={s.coins} symbol={symbol} />
            <p className="text-xs text-muted-foreground">
              Past results don't predict future returns. A coin only counts once its price history starts. This is a testing tool, not financial advice — read the <Link to="/risk" className="underline">risk disclosure</Link>.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** A number field with one-tap preset values under the box, so no one has to type a guess. */
function NumField({ label, hint, value, max, choices, offLabel, onChange }: {
  label: string; hint?: string; value: number; max: number; choices: number[]; offLabel?: string; onChange: (v: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <input type="number" min={0} max={max} className={inputCls} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="mt-1 flex flex-wrap gap-1">
        {choices.map((c) => <Chip key={c} small on={value === c} onClick={() => onChange(c)}>{c}</Chip>)}
        {offLabel ? <Chip small on={value === 0} onClick={() => onChange(0)}>{offLabel}</Chip> : null}
      </div>
    </Field>
  );
}

/** Empty chart frame shown on first load, so no return appears before the member has picked anything. */
function BlankStart({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative h-80 overflow-hidden rounded-sm border border-dashed border-border bg-surface">
      <div aria-hidden className="absolute inset-x-6 top-8 bottom-10 flex flex-col justify-between">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-border/60" />)}
      </div>
      <div className="relative flex h-full items-center justify-center px-4">
        <div className="flex max-w-lg flex-col items-center gap-3 rounded-sm bg-surface px-6 py-5 text-center">
        <h2 className="font-display text-2xl font-extrabold">Choose your settings to begin</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Pick your coins, how far back to test and how much to start with
          <span className="lg:hidden"> below</span><span className="hidden lg:inline"> on the left</span>. Results show the moment you change something, or run the starter plan as it is.
        </p>
        <button type="button" onClick={onStart} className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-action-foreground hover:opacity-90">
          Run test
        </button>
        </div>
      </div>
    </div>
  );
}

/** States the exact date range behind every number below it. */
function TestedPeriod({ from, to }: { from?: string; to?: string }) {
  if (!from || !to) return null;
  const years = (Date.parse(to) - Date.parse(from)) / (365.25 * 864e5);
  const months = Math.max(1, Math.round(years * 12));
  const span = months < 12 ? `${months} month${months === 1 ? "" : "s"}` : months % 12 === 0 ? `${months / 12} year${months === 12 ? "" : "s"}` : `${(months / 12).toFixed(1)} years`;
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <p className="num text-sm text-muted-foreground">
      Tested <span className="font-semibold text-foreground">{fmt(from)} → {fmt(to)}</span> ({span}). Change it under "Going back".
    </p>
  );
}

function HoldNow({ run, symbol }: { run: NonNullable<ReturnType<typeof runPlan>>; symbol: (id: string) => string }) {
  if (!run.current) return null;
  const held = Object.entries(run.current).filter(([, w]) => w > 0.001).sort((a, b) => b[1] - a[1]);
  const cash = 1 - held.reduce((t, [, w]) => t + w, 0);
  const last = run.log.at(-1);
  return (
    <Panel title="What the plan says to hold now">
      <p className="text-xs text-muted-foreground">Using prices up to {run.points.at(-1)?.day}. Last change {last?.day ?? "—"}: {last?.reason ?? "none"}.</p>
      <ul className="num mt-2 space-y-1 text-sm">
        {held.map(([id, w]) => (
          <li key={id} className="flex justify-between"><span className="font-semibold">{symbol(id)}</span><span>{(w * 100).toFixed(0)}% · {fmtUsd(w * run.plan.finalValue)}</span></li>
        ))}
        {cash > 0.001 ? <li className="flex justify-between text-muted-foreground"><span>TSD</span><span>{(cash * 100).toFixed(0)}% · {fmtUsd(cash * run.plan.finalValue)}</span></li> : null}
      </ul>
    </Panel>
  );
}

/** Shares start even; a small popup lets members set their own starting split without filling the sidebar. */
function SharesField({ coins, weights, targets, symbol, onChange }: {
  coins: string[];
  weights: Record<string, number>;
  targets: Record<string, number>;
  symbol: (id: string) => string;
  onChange: (w: Record<string, number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const custom = coins.some((id) => weights[id] != null);
  const pct = (id: string) => {
    const v = targets[id]! * 100;
    return `${Math.abs(v - Math.round(v)) < 0.05 ? v.toFixed(0) : v.toFixed(1)}%`;
  };
  return (
    <div className="text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">Shares</span>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
          {custom ? "Edit shares" : "Change shares"}
        </button>
      </div>
      <p className="num mt-0.5 text-xs text-muted-foreground">
        {custom
          ? coins.map((id) => `${symbol(id)} ${pct(id)}`).join(" · ")
          : `Even split — ${pct(coins[0]!)} each`}
      </p>
      {custom ? (
        <button type="button" onClick={() => onChange({})} className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline">Back to even split</button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Starting shares</DialogTitle>
            <DialogDescription>Type a percent for any coin you want to set. Coins left blank share whatever is left evenly. If your numbers add up to more than 100, they're scaled down to fit.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
            {coins.map((id) => (
              <div key={id} className="flex items-center gap-2">
                <span className="w-14 font-mono text-xs uppercase">{symbol(id)}</span>
                <input
                  aria-label={`${symbol(id)} share in percent`}
                  type="number" min={0} max={100} className={inputCls}
                  placeholder={pct(id).slice(0, -1)}
                  value={weights[id] ?? ""}
                  onChange={(e) => {
                    const w = { ...weights };
                    if (e.target.value === "") delete w[id]; else w[id] = Number(e.target.value);
                    onChange(w);
                  }}
                />
                <span className="num w-12 text-right text-xs text-muted-foreground">{pct(id)}</span>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <button type="button" onClick={() => onChange({})} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Even split</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-sm bg-action px-4 py-2 text-sm font-semibold text-action-foreground">Done</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
