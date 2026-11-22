import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { KIND_LABEL, type ActivityRow, type Tone } from "@/lib/activity/activity-rules";

const fmt = (n: number) =>
  n === 0 ? "0" : Math.abs(n) >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 1000 ? 2 : 6 }) : n.toPrecision(6).replace(/0+$/, "");
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const TONE_CLASS: Record<Tone, string> = {
  done: "text-primary",
  pending: "text-foreground",
  stopped: "text-muted-foreground",
  action: "text-warning font-semibold",
};

type SortKey = "at" | "kind" | "status";

/** One exchange-style history table; every column header sorts. */
export function ActivityTable({ rows, empty, showKind = true, pageSize = 25 }: { rows: ActivityRow[]; empty: string; showKind?: boolean; pageSize?: number }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "at", dir: -1 });
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    const v = (r: ActivityRow) => (sort.key === "at" ? r.at : sort.key === "kind" ? KIND_LABEL[r.kind] : r.status);
    return [...rows].sort((a, b) => v(a).localeCompare(v(b)) * sort.dir);
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, p * pageSize + pageSize);
  if (!rows.length) return <p className="p-4 font-mono text-xs text-muted-foreground">{empty}</p>;
  const head = (key: SortKey, label: string, cls = "text-left") => (
    <th className={`px-4 py-2 ${cls}`}>
      <button
        type="button"
        onClick={() => { setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "at" ? -1 : 1 })); setPage(0); }}
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
      >
        {label}
        {sort.key === key ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : null}
      </button>
    </th>
  );
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground">
              {head("at", "Date")}
              {showKind ? head("kind", "Type") : null}
              <th className="px-4 py-2 text-left uppercase">What</th>
              <th className="px-4 py-2 text-right uppercase">Sent</th>
              <th className="px-4 py-2 text-right uppercase">Received</th>
              {head("status", "Status", "text-right")}
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id} className="border-b border-border/50 align-top">
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{when(r.at)}</td>
                {showKind ? <td className="px-4 py-2">{KIND_LABEL[r.kind]}</td> : null}
                <td className="px-4 py-2">
                  {r.href ? <Link to={r.href as string} className="text-foreground hover:text-primary">{r.title}</Link> : r.title}
                  {r.detail ? <span className="block text-[10px] text-muted-foreground">{r.detail}</span> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{r.sent ? `${fmt(r.sent.amount)} ${r.sent.coin}` : "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{r.got ? `${fmt(r.got.amount)} ${r.got.coin}` : "—"}</td>
                <td className={`px-4 py-2 text-right ${TONE_CLASS[r.tone]}`}>{r.status}</td>
                <td className="px-4 py-2 text-right">
                  {r.txUrl ? (
                    <a href={r.txUrl} target="_blank" rel="noreferrer" aria-label="Open the transaction" className="inline-flex text-primary hover:opacity-80">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 font-mono text-[11px] text-muted-foreground">
          <span>{sorted.length} items · page {p + 1} of {pages}</span>
          <span className="flex gap-2">
            <button type="button" disabled={p === 0} onClick={() => setPage(p - 1)} className="rounded-sm border border-border px-2 py-0.5 disabled:opacity-40">Previous</button>
            <button type="button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="rounded-sm border border-border px-2 py-0.5 disabled:opacity-40">Next</button>
          </span>
        </div>
      ) : null}
    </>
  );
}
