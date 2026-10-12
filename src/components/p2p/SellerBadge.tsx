import { Link } from "@tanstack/react-router";
import { ShieldCheck, Zap } from "lucide-react";
import { scoreTone } from "@/lib/p2p-config";

export type Stats = {
  trades: number;
  completionRate: number;
  positive: number;
  negative: number;
  avgReleaseMin: number | null;
  avgResponseMin: number | null;
  volumeUsd: number;
  flags: number;
  score: number;
};

export function mins(m: number | null) {
  if (m === null) return "—";
  if (m < 1) return "<1 min";
  if (m < 60) return `${Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export function ScorePill({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[11px] ${scoreTone(score)}`}>
      <ShieldCheck className="h-3 w-3" />
      {score}
    </span>
  );
}

export function SellerBadge({ handle, stats }: { handle: string; stats: Stats }) {
  const fb = stats.positive + stats.negative;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Link to="/p2p/seller/$handle" params={{ handle }} className="truncate font-semibold hover:text-primary">
          {handle}
        </Link>
        <ScorePill score={stats.score} />
        {stats.avgReleaseMin !== null && stats.avgReleaseMin < 15 ? (
          <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-primary uppercase">
            <Zap className="h-3 w-3" /> fast
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
        {stats.trades} trades · {Math.round(stats.completionRate * 100)}% done ·{" "}
        {fb ? `${Math.round((stats.positive / fb) * 100)}% 👍` : "no feedback"} · releases in {mins(stats.avgReleaseMin)}
        {stats.flags ? <span className="text-destructive"> · {stats.flags} flag{stats.flags > 1 ? "s" : ""}</span> : null}
      </div>
    </div>
  );
}
