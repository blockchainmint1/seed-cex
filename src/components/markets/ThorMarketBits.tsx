import { queryOptions } from "@tanstack/react-query";
import { getThorChart, getThorMarkets } from "@/lib/markets/thor-markets.functions";
import { fmtTsd, type Timeframe } from "@/lib/markets/thor-markets";

export const thorMarketsQuery = queryOptions({
  queryKey: ["thor-markets"],
  queryFn: () => getThorMarkets(),
  refetchInterval: 60_000,
  staleTime: 30_000,
});

export const thorChartQuery = (slug: string, tf: Timeframe) =>
  queryOptions({
    queryKey: ["thor-chart", slug, tf],
    queryFn: () => getThorChart({ data: { slug, tf } }),
    refetchInterval: tf === "15m" || tf === "1h" ? 60_000 : 300_000,
    staleTime: 30_000,
    // Keep the last chart on screen while another candle size loads.
    placeholderData: (prev) => prev,
  });

export function Change({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct == null) return <span className={`text-muted-foreground ${className}`}>—</span>;
  const up = pct >= 0;
  return <span className={`${up ? "text-bid" : "text-ask"} ${className}`}>{up ? "+" : ""}{pct.toFixed(2)}%</span>;
}

/** 24-hour line in the row's own colour. */
export function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points.map((p, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * 100).toFixed(2)},${(30 - ((p - min) / span) * 28 - 1).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-28" aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--bid)" : "var(--ask)"} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Price({ v, className = "" }: { v: number | null; className?: string }) {
  return <span className={`num tabular-nums ${className}`}>{fmtTsd(v)}</span>;
}
