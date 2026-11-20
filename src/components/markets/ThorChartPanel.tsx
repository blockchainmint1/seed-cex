import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandleChart } from "@/components/markets/CandleChart";
import { marketChartQuery, marketsErrorText } from "@/components/markets/ThorMarketBits";
import { CHART_RANGES, CHART_RANGE_IDS, type ChartRange } from "@/lib/markets/thor-markets";

/** Range buttons (1D … All) + candlestick chart for one primary market. */
export function ThorChartPanel({ slug, base, initial = "7d", height = 380 }: { slug: string; base: string; initial?: ChartRange; height?: number }) {
  const [range, setRange] = useState<ChartRange>(initial);
  const q = useQuery(marketChartQuery(slug, range));
  const r = CHART_RANGES[range];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div role="tablist" aria-label="Chart range" className="flex gap-1">
          {CHART_RANGE_IDS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={range === id}
              onClick={() => setRange(id)}
              className={`rounded-sm px-2.5 py-1 font-mono text-[11px] ${range === id ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {CHART_RANGES[id].label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {base}/TSD · {r.span}
        </span>
      </div>
      <div className="relative" style={{ height }}>
        {q.data?.candles.length ? (
          <CandleChart candles={q.data.candles} height={height} intraday={r.source === "pool"} />
        ) : (
          <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
            {q.error ? marketsErrorText(q.error) : q.isPending ? "Loading prices…" : "No price history for this range yet."}
          </div>
        )}
        {q.isFetching && q.data ? <span className="absolute top-2 left-3 font-mono text-[10px] text-muted-foreground">updating…</span> : null}
      </div>
    </div>
  );
}
