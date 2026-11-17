import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { aiSeriesQuery, type AiCoin } from "@/lib/ai/market";
import { basketTargets, defaultPlan, isStable, runPlan, stableSeries, type PlanSettings } from "@/lib/ai/plan";
import { fmtPct, fmtUsd, type Series } from "@/lib/ai/series";
import { Chip, Field, inputCls, Panel, tone } from "./ui";
import { LockPanel } from "./LockPanel";

const RANGES = [["3 mo", 3], ["6 mo", 6], ["1 yr", 12], ["2 yr", 24], ["3 yr", 36], ["5 yr", 60]] as const;
const monthsAgo = (m: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };

export function PlanBuilder({ coins, settings, onChange, signedIn }: {
  coins: AiCoin[];
  settings: PlanSettings;
  onChange: (s: PlanSettings) => void;
  signedIn: boolean;
}) {
  const s = settings;
  const set = <K extends keyof PlanSettings>(k: K, v: PlanSettings[K]) => onChange({ ...s, [k]: v });
  const num = (k: keyof PlanSettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);
  const symbol = (id: string) => (id === "tsd" ? "TSD" : coins.find((c) => c.id === id)?.symbol.toUpperCase() ?? id);

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
      <aside className="space-y-5 self-start rounded-sm border border-border bg-surface p-4">
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
          <Field label="Shares" hint="Leave blank for an even split.">
            <div className="space-y-1.5">
              {s.coins.map((id) => (
                <div key={id} className="flex items-center gap-2">
                  <span className="w-14 font-mono text-xs uppercase">{symbol(id)}</span>
                  <input
                    aria-label={`${symbol(id)} share in percent`}
                    type="number" min={0} max={100} className={inputCls}
                    placeholder={(targets[id]! * 100).toFixed(0)}
                    value={s.weights[id] ?? ""}
                    onChange={(e) => {
                      const w = { ...s.weights };
                      if (e.target.value === "") delete w[id]; else w[id] = Number(e.target.value);
                      set("weights", w);
                    }}
                  />
                  <span className="num w-12 text-right text-xs text-muted-foreground">{(targets[id]! * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </Field>
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
              <Field label="Trend filter" hint="Only above this day average (0 = off)"><input type="number" min={0} className={inputCls} value={s.trendMA} onChange={num("trendMA")} /></Field>
              <Field label="Max per coin %"><input type="number" min={1} max={100} className={inputCls} value={s.cap} onChange={num("cap")} /></Field>
            </>
          )}
          <Field label="Stop-loss %" hint="Sell if down this much from its high (0 = off)"><input type="number" min={0} className={inputCls} value={s.stopLoss} onChange={num("stopLoss")} /></Field>
          <Field label="Keep in TSD %" hint="Never invested"><input type="number" min={0} max={90} className={inputCls} value={s.reserve} onChange={num("reserve")} /></Field>
          <Field label="Trading cost %" hint="Per trade, swap fees included"><input type="number" min={0} step={0.01} className={inputCls} value={s.feeBps / 100} onChange={(e) => set("feeBps", Number(e.target.value) * 100)} /></Field>
          <Field label="Fresh-data slice %" hint="Recent part kept as a fresh test"><input type="number" min={0} max={80} className={inputCls} value={s.holdout} onChange={num("holdout")} /></Field>
        </div>
        <button type="button" onClick={() => onChange({ ...defaultPlan })} className="text-xs text-muted-foreground underline-offset-2 hover:underline">Reset to the starter plan</button>
      </aside>

      <section className="min-w-0 space-y-6">
        {!run ? (
          <p className="text-sm text-muted-foreground">Loading price history…</p>
        ) : run.error ? (
          <Panel>{run.error}</Panel>
        ) : (
          <>
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

            <LockPanel settings={s} signedIn={signedIn} />

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

            <div className="overflow-x-auto rounded-sm border border-border bg-surface">
              <h3 className="border-b border-border px-4 py-2.5 font-display text-[11px] font-bold tracking-[0.18em] uppercase">Trade log (latest 40)</h3>
              <table className="w-full text-sm">
                <tbody>
                  {run.log.slice(-40).reverse().map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="num px-4 py-1.5 whitespace-nowrap text-muted-foreground">{l.day}</td>
                      <td className="py-1.5">{l.picks.replace(/[a-z0-9-]+(?= \d+%)|(?<=sold )[a-z0-9-]+/g, (m) => symbol(m))}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">{l.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Past results don't predict future returns. A coin only counts once its price history starts. This is a testing tool, not financial advice — read the <Link to="/risk" className="underline">risk disclosure</Link>.
            </p>
          </>
        )}
      </section>
    </div>
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
