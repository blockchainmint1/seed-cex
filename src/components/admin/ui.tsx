import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { getAdminIgnite, getAdminOverview } from "@/lib/admin.functions";
import { fmtAgo, fmtAmount, fmtPrice } from "@/lib/format";

export const short = (v: string | null) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "—");

export function useAdminOverview() {
  const fetchOverview = useServerFn(getAdminOverview);
  return useQuery({ queryKey: ["admin-overview"], queryFn: () => fetchOverview(), refetchInterval: 30_000, retry: false });
}

export function useAdminIgnite() {
  const fetchIgnite = useServerFn(getAdminIgnite);
  return useQuery({ queryKey: ["admin-ignite"], queryFn: () => fetchIgnite(), refetchInterval: 30_000, retry: false });
}

/** Wide table panel: header strip + horizontally scrolling body. */
export function Panel({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="font-display text-sm font-bold">{title}</h3>
        {right}
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2.5">
      <div className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold ${tone === "good" ? "text-primary" : tone === "warn" ? "text-warn" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

export function Loading({ children = "Loading…" }: { children?: ReactNode }) {
  return <p className="font-mono text-xs text-muted-foreground">{children}</p>;
}

/** Column header that sorts on click and shows which way. */
export function SortHeader<K extends string>({ label, k, sort, onSort, align = "left" }: {
  label: string; k: K; sort: { key: K; dir: "asc" | "desc" }; onSort: (k: K) => void; align?: "left" | "right";
}) {
  const on = sort.key === k;
  const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`px-3 py-2 font-normal ${align === "right" ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 rounded-sm hover:text-foreground ${on ? "font-semibold text-foreground" : ""}`}>
        {label} <Icon className={`h-3 w-3 ${on ? "text-primary" : "opacity-50"}`} />
      </button>
    </th>
  );
}

export type TradeRow = {
  id: string; pair: string; side: string; price: number; amount: number; status: string;
  makerId: string | null; takerId: string | null; createdAt: string; legs: { leg: string; status: string; txid: string | null }[];
};

export function TradeTable({ rows, empty }: { rows: TradeRow[]; empty: string }) {
  return (
    <table className="w-full whitespace-nowrap font-mono text-[11px]">
      <thead className="text-muted-foreground">
        <tr className="border-b border-border">
          <th className="px-4 py-2 text-left">Pair</th>
          <th className="px-4 py-2 text-left">Side</th>
          <th className="px-4 py-2 text-right">Price</th>
          <th className="px-4 py-2 text-right">Amount</th>
          <th className="px-4 py-2 text-left">Status</th>
          <th className="px-4 py-2 text-left">Legs</th>
          <th className="px-4 py-2 text-left">Maker</th>
          <th className="px-4 py-2 text-left">Taker</th>
          <th className="px-4 py-2 text-right">Age</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className="border-b border-border/50">
            <td className="px-4 py-2 text-foreground">{t.pair.replace("_", " / ")}</td>
            <td className={`px-4 py-2 uppercase ${t.side === "buy" ? "text-primary" : "text-destructive"}`}>{t.side}</td>
            <td className="px-4 py-2 text-right">{fmtPrice(t.price)}</td>
            <td className="px-4 py-2 text-right">{fmtAmount(t.amount)}</td>
            <td className="px-4 py-2">{t.status}</td>
            <td className="px-4 py-2">{t.legs.length ? t.legs.map((l) => `${l.leg}:${l.status}`).join(" · ") : "—"}</td>
            <td className="px-4 py-2">{short(t.makerId)}</td>
            <td className="px-4 py-2">{short(t.takerId)}</td>
            <td className="px-4 py-2 text-right text-muted-foreground">{fmtAgo(t.createdAt)}</td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr><td className="px-4 py-6 text-muted-foreground" colSpan={9}>{empty}</td></tr>
        ) : null}
      </tbody>
    </table>
  );
}
