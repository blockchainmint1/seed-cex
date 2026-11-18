import { useMemo, useState } from "react";
import type { PlanRun } from "@/lib/ai/plan";
import { isStable } from "@/lib/ai/plan";
import { fmtUsd, type Series } from "@/lib/ai/series";

const PAGE = 30;
const fmtCost = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

const fmtUnits = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { maximumSignificantDigits: 8, maximumFractionDigits: 8 }) : "—";

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => (typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn = "rounded-sm border border-border px-2.5 py-1 text-xs font-semibold disabled:opacity-40 hover:border-primary";
  return (
    <div className="num flex items-center justify-end gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
      <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(0)}>Newest</button>
      <button type="button" className={btn} disabled={page === 0} onClick={() => onPage(page - 1)}>Newer</button>
      <span>Page {page + 1} of {pages}</span>
      <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Older</button>
      <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}>Oldest</button>
    </div>
  );
}

function Header({ title, note, onCsv }: { title: string; note: string; onCsv: () => void }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-2.5">
      <div>
        <h3 className="font-display text-[11px] font-bold tracking-[0.18em] uppercase">{title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </div>
      <button type="button" onClick={onCsv} className="rounded-sm border border-border px-2.5 py-1 text-xs font-semibold hover:border-primary">
        Download CSV
      </button>
    </header>
  );
}

/** Every simulated trade, with the price and cost the test used. */
export function TradeActions({ run, symbol }: { run: PlanRun; symbol: (id: string) => string }) {
  const [page, setPage] = useState(0);
  const rows = useMemo(() => [...run.fills].reverse(), [run.fills]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages - 1);
  const label = (id: string) => (isStable(id) ? "TSD (cash)" : symbol(id));
  const csv = () =>
    downloadCsv("seeds-ai-trades.csv", [
      ["date", "action", "coin", "amount", "price_usd", "value_usd", "cost_usd", "why"],
      ...run.fills.map((f) => [f.day, f.side, label(f.coin), f.units, f.price, f.usd, f.fee, f.reason]),
    ]);
  return (
    <section className="rounded-sm border border-border bg-surface">
      <Header
        title={`Trade actions (${run.fills.length})`}
        note={`Every buy and sell the test made, at that day's closing price. Costs add up to ${fmtUsd(run.plan.fees)}.`}
        onCsv={csv}
      />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">Action</th>
                <th className="py-2 pr-3 text-right font-semibold">Amount</th>
                <th className="py-2 pr-3 text-right font-semibold">Price</th>
                <th className="py-2 pr-3 text-right font-semibold">Value</th>
                <th className="py-2 pr-3 text-right font-semibold">Cost</th>
                <th className="py-2 pr-4 font-semibold">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(p * PAGE, p * PAGE + PAGE).map((f, i) => (
                <tr key={`${f.day}-${f.coin}-${i}`} className="border-t border-border">
                  <td className="num px-4 py-1.5 whitespace-nowrap text-muted-foreground">{f.day}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    <span className={`font-semibold ${f.side === "buy" ? "text-bid" : "text-ask"}`}>{f.side === "buy" ? "Buy" : "Sell"}</span> {label(f.coin)}
                  </td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{fmtUnits(f.units)}</td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{fmtUsd(f.price)}</td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap">{fmtUsd(f.usd)}</td>
                  <td className="num py-1.5 pr-3 text-right whitespace-nowrap text-muted-foreground">{fmtCost(f.fee)}</td>
                  <td className="py-1.5 pr-4 text-xs text-muted-foreground">{f.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">No trades in this period.</p>
      )}
      <Pager page={p} pages={pages} onPage={setPage} />
    </section>
  );
}

/** The raw daily closes behind the test, one row per tested day. */
export function DailyPrices({ run, series, coins, symbol }: { run: PlanRun; series: Record<string, Series>; coins: string[]; symbol: (id: string) => string }) {
  const [page, setPage] = useState(0);
  const cols = useMemo(() => Array.from(new Set([...coins.filter((id) => !isStable(id)), "bitcoin"])), [coins]);
  const maps = useMemo(
    () => Object.fromEntries(cols.map((id) => [id, new Map(series[id]?.days.map((d, i) => [d, series[id]!.closes[i]!]) ?? [])])),
    [cols, series],
  );
  const tradesOn = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of run.fills) m.set(f.day, (m.get(f.day) ?? 0) + 1);
    return m;
  }, [run.fills]);
  const rows = useMemo(() => [...run.points].reverse(), [run.points]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages - 1);
  const csv = () =>
    downloadCsv("seeds-ai-daily-prices.csv", [
      ["date", ...cols.map((id) => `${symbol(id)}_close_usd`), "plan_value_usd", "trades"],
      ...run.points.map((pt) => [pt.day, ...cols.map((id) => maps[id]!.get(pt.day) ?? NaN), pt.plan, tradesOn.get(pt.day) ?? 0]),
    ]);
  return (
    <section className="rounded-sm border border-border bg-surface">
      <Header
        title={`Daily prices (${run.points.length} days)`}
        note="Closing price each day (UTC) used by the test: Binance's USDT market, or CoinGecko where Binance has none. TSD is always $1. A dash means that coin had no price yet."
        onCsv={csv}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Date</th>
              {cols.map((id) => <th key={id} className="py-2 pr-3 text-right font-semibold uppercase">{symbol(id)}</th>)}
              <th className="py-2 pr-3 text-right font-semibold whitespace-nowrap">Your plan</th>
              <th className="py-2 pr-4 text-right font-semibold">Trades</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(p * PAGE, p * PAGE + PAGE).map((pt) => (
              <tr key={pt.day} className="border-t border-border">
                <td className="num px-4 py-1.5 whitespace-nowrap text-muted-foreground">{pt.day}</td>
                {cols.map((id) => {
                  const v = maps[id]!.get(pt.day);
                  return <td key={id} className="num py-1.5 pr-3 text-right whitespace-nowrap">{v == null ? "—" : fmtUsd(v)}</td>;
                })}
                <td className="num py-1.5 pr-3 text-right font-semibold whitespace-nowrap">{fmtUsd(pt.plan)}</td>
                <td className="num py-1.5 pr-4 text-right text-muted-foreground">{tradesOn.get(pt.day) || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={p} pages={pages} onPage={setPage} />
    </section>
  );
}
