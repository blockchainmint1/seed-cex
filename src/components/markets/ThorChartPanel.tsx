import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandleChart } from "@/components/markets/CandleChart";
import { thorChartQuery, marketsErrorText } from "@/components/markets/ThorMarketBits";
import { TIMEFRAMES, TIMEFRAME_IDS, type Timeframe } from "@/lib/markets/thor-markets";

/** Candle-size tabs + candlestick chart for one THORChain market. */
export function ThorChartPanel({ slug, base, initial = "1h", height = 380 }: { slug: string; base: string; initial?: Timeframe; height?: number }) {
  const [tf, setTf] = useState<Timeframe>(initial);
  const q = useQuery(thorChartQuery(slug, tf));
  const t = TIMEFRAMES[tf];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div role="tablist" aria-label="Candle size" className="flex gap-1">
          {TIMEFRAME_IDS.map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tf === id}
              onClick={() => setTf(id)}
              className={`rounded-sm px-2.5 py-1 font-mono text-[11px] ${tf === id ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {TIMEFRAMES[id].label}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {base}/TSD · THORChain pool · {t.span}
        </span>
      </div>
      <div className="relative" style={{ height }}>
        {q.data?.candles.length ? (
          <CandleChart candles={q.data.candles} height={height} intraday={tf !== "1d" && tf !== "1w"} />
        ) : (
          <div className="grid h-full place-items-center font-mono text-xs text-muted-foreground">
            {q.error ? marketsErrorText(q.error) : q.isPending ? "Loading THORChain prices…" : "No price history for this candle size yet."}
          </div>
        )}
        {q.isFetching && q.data ? <span className="absolute top-2 left-3 font-mono text-[10px] text-muted-foreground">updating…</span> : null}
      </div>
    </div>
  );
}
