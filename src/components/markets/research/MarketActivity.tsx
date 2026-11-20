import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { getCostBySize, getMyCoinActivity, getPoolTrades } from "@/lib/markets/coin-research.functions";
import { fmtTsd, type ThorMarket } from "@/lib/markets/thor-markets";
import { useSession } from "@/hooks/use-session";
import { ago, amount } from "./format";

type Tab = "trades" | "cost" | "mine";
const TABS: { id: Tab; label: string }[] = [
  { id: "trades", label: "Recent trades" },
  { id: "cost", label: "Cost by size" },
  { id: "mine", label: "My activity" },
];

/** Exchange-style panel under the chart: live pool trades, cost by trade size, and the member's own activity. */
export function MarketActivity({ market }: { market: ThorMarket }) {
  const [tab, setTab] = useState<Tab>("trades");
  return (
    <section className="min-w-0 rounded-sm border border-border bg-surface">
      <div role="tablist" aria-label="Market activity" className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-xs ${tab === t.id ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "trades" ? <RecentTrades market={market} /> : tab === "cost" ? <CostBySize market={market} /> : <MyActivity market={market} />}
    </section>
  );
}

const th = "px-3 py-2 text-left font-mono text-[10px] font-normal tracking-[0.14em] text-muted-foreground uppercase";
const thR = `${th} text-right`;
const td = "px-3 py-1.5 font-mono text-xs tabular-nums";

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-xs text-muted-foreground">{children}</p>;
}

function RecentTrades({ market }: { market: ThorMarket }) {
  const load = useServerFn(getPoolTrades);
  const q = useQuery({ queryKey: ["pool-trades", market.slug], queryFn: () => load({ data: { slug: market.slug } }), refetchInterval: 30_000, staleTime: 20_000 });
  const rows = q.data ?? [];
  return (
    <div>
      <div className="max-h-[420px] overflow-auto">
        {q.isPending ? <Empty>Loading THORChain trades (can take a few seconds)…</Empty> : q.error ? <Empty>THORChain's trade list didn't answer. Seeds will try again shortly.</Empty> : rows.length === 0 ? (
          <Empty>No finished {market.base} swaps on THORChain in the last while.</Empty>
        ) : (
          <table className="w-full whitespace-nowrap">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-border">
                <th className={th}>Time</th>
                <th className={th}>Side</th>
                <th className={thR}>Price (TSD)</th>
                <th className={thR}>Amount ({market.base})</th>
                <th className={thR}>Value (TSD)</th>
                <th className={thR}><span className="sr-only">Transaction</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={`${t.txid}-${t.at}-${i}`} className="border-b border-border/40 hover:bg-muted/40">
                  <td className={`${td} text-muted-foreground`} title={new Date(t.at).toLocaleString()}>{ago(t.at)}</td>
                  <td className={`${td} font-semibold ${t.side === "buy" ? "text-bid" : "text-ask"}`}>{t.side === "buy" ? "Buy" : "Sell"}</td>
                  <td className={`${td} text-right ${t.side === "buy" ? "text-bid" : "text-ask"}`}>{fmtTsd(t.price)}</td>
                  <td className={`${td} text-right text-foreground`}>{amount(t.amount)}</td>
                  <td className={`${td} text-right text-muted-foreground`}>{t.usd.toLocaleString("en-US", { maximumFractionDigits: t.usd >= 100 ? 0 : 2 })}</td>
                  <td className={`${td} text-right`}>
                    {t.txid ? (
                      <a href={`https://viewblock.io/thorchain/tx/${t.txid}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" aria-label="See this swap on a THORChain explorer">
                        <ExternalLink className="inline h-3 w-3" />
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Real, finished swaps in THORChain's {market.base} pool, by anyone, anywhere. "Buy" means someone took {market.base} out of the pool. Updates every 30 seconds.
      </p>
    </div>
  );
}

function CostBySize({ market }: { market: ThorMarket }) {
  const load = useServerFn(getCostBySize);
  const q = useQuery({ queryKey: ["cost-by-size", market.slug], queryFn: () => load({ data: { slug: market.slug } }), refetchInterval: 60_000, staleTime: 45_000 });
  const d = q.data;
  return (
    <div>
      {q.isPending ? <Empty>Asking THORChain for live quotes…</Empty> : q.error || !d || d.rows.length === 0 ? <Empty>THORChain's quotes didn't answer. Seeds will try again shortly.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap">
            <thead>
              <tr className="border-b border-border">
                <th className={th}>You spend</th>
                <th className={thR}>You'd get ({market.base})</th>
                <th className={thR}>Average price</th>
                <th className={thR}>vs. pool price</th>
                <th className={thR}>THORChain fees</th>
                <th className={thR}>Takes about</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.usd} className="border-b border-border/40">
                  <td className={`${td} text-foreground`}>{r.usd.toLocaleString("en-US")} TSD</td>
                  {r.out == null ? (
                    <td colSpan={5} className={`${td} text-right text-muted-foreground`}>{r.error ?? "No quote right now"}</td>
                  ) : (
                    <>
                      <td className={`${td} text-right text-foreground`}>{amount(r.out)}</td>
                      <td className={`${td} text-right`}>{fmtTsd(r.avgPrice)}</td>
                      <td className={`${td} text-right ${r.slipPct != null && r.slipPct >= 1 ? "text-ask" : "text-muted-foreground"}`}>{r.slipPct == null ? "—" : `+${r.slipPct.toFixed(2)}%`}</td>
                      <td className={`${td} text-right text-muted-foreground`}>{r.feePct == null ? "—" : `${r.feePct.toFixed(2)}%`}</td>
                      <td className={`${td} text-right text-muted-foreground`}>{r.minutes == null ? "—" : r.minutes < 2 ? "a minute" : `${r.minutes} min`}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        Live THORChain quotes for buying {market.base}, starting from USDC (1 TSD = $1), updated every minute. Small trades cost more as a share because THORChain charges a flat fee to send the coin out; big trades are split into pieces over a few minutes to keep the price slip low. Your exact total, including the TSD conversion and network fees, shows on the Swap page before anything is sent.
      </p>
    </div>
  );
}

const STAGE_DONE = new Set(["done"]);
const STAGE_STOPPED = new Set(["refunded", "kept_usdc", "failed"]);

function stageLabel(stage: string): string {
  if (STAGE_DONE.has(stage)) return "Done";
  if (stage === "refunded") return "Refunded";
  if (stage === "kept_usdc") return "Kept as USDC";
  if (stage === "failed") return "Stopped";
  if (stage === "needs_ok") return "Needs your OK";
  return "Underway";
}

function MyActivity({ market }: { market: ThorMarket }) {
  const { user, loading } = useSession();
  const load = useServerFn(getMyCoinActivity);
  const q = useQuery({ queryKey: ["my-coin-activity", market.slug], queryFn: () => load({ data: { slug: market.slug } }), enabled: !!user, refetchInterval: 60_000 });
  if (loading) return <Empty>Checking your sign-in…</Empty>;
  if (!user) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
        <Link to="/auth" search={{ redirect: `/markets/${market.slug}` }} className="font-semibold text-primary hover:underline">Sign in</Link> to see your own {market.base} swaps and orders here.
      </div>
    );
  }
  if (q.isPending) return <Empty>Loading your activity…</Empty>;
  if (q.error || !q.data) return <Empty>Couldn't load your activity. Try again in a minute.</Empty>;
  const { tsdSwaps, swaps, orders } = q.data;
  type Row = { id: string; at: string; what: string; side: "buy" | "sell" | null; detail: string; status: string };
  const rows: Row[] = [
    ...tsdSwaps.map((r): Row => ({
      id: r.id,
      at: r.created_at,
      what: "TSD swap",
      side: r.direction === "buy" ? "buy" : "sell",
      detail: r.direction === "buy"
        ? `${Number(r.amount_in).toLocaleString("en-US")} TSD → ${amount(Number(r.amount_out ?? r.shown_out ?? 0))} ${market.base}`
        : `${amount(Number(r.amount_in))} ${market.base} → ${Number(r.amount_out ?? r.shown_out ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} TSD`,
      status: stageLabel(r.stage),
    })),
    ...swaps.map((s): Row => ({
      id: s.id,
      at: s.created_at,
      what: "Swap",
      side: s.to_asset === market.pool ? "buy" : "sell",
      detail: `${amount(Number(s.amount_in))} ${s.from_asset.split(".")[1]?.split("-")[0] ?? s.from_asset} → ${amount(Number(s.expected_out ?? 0))} ${s.to_asset.split(".")[1]?.split("-")[0] ?? s.to_asset}`,
      status: s.status === "done" || s.status === "complete" ? "Done" : s.status === "failed" ? "Stopped" : s.status.replace(/_/g, " "),
    })),
    ...orders.map((o): Row => ({
      id: o.id,
      at: o.created_at,
      what: `${o.order_type === "market" ? "Market" : "Limit"} order`,
      side: o.side === "buy" ? "buy" : "sell",
      detail: `${amount(Number(o.amount))} ${market.base} @ ${fmtTsd(Number(o.price))} TSD · ${amount(Number(o.filled))} filled`,
      status: String(o.status),
    })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (rows.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
        You haven't traded {market.base} on Seeds yet.{" "}
        <Link to="/swap" search={{ from: "TSD", to: market.swapId }} className="font-semibold text-primary hover:underline">Buy {market.base} with TSD</Link>
      </div>
    );
  }
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full whitespace-nowrap">
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-border">
            <th className={th}>When</th><th className={th}>Type</th><th className={th}>Side</th><th className={th}>Details</th><th className={thR}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/40">
              <td className={`${td} text-muted-foreground`} title={new Date(r.at).toLocaleString()}>{ago(r.at)}</td>
              <td className={`${td} text-foreground`}>{r.what}</td>
              <td className={`${td} font-semibold ${r.side === "buy" ? "text-bid" : "text-ask"}`}>{r.side === "buy" ? "Buy" : "Sell"}</td>
              <td className={`${td} text-muted-foreground`}>{r.detail}</td>
              <td className={`${td} text-right capitalize ${STAGE_STOPPED.has(r.status.toLowerCase()) ? "text-ask" : "text-foreground"}`}>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
