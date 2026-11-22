import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle, Coins, ExternalLink, Loader2 } from "lucide-react";
import { PROTOCOL_LABEL, SWAP_COINS, swapCoin } from "@/lib/xchain/assets";
import type { getSwapSendContext } from "@/lib/xchain/swap.functions";
import { answerTsdSwap, getTsdRoutes } from "@/lib/xchain/tsd-route.functions";
import { isTerminal, routeSteps, stepIndex, SWAPPER_SHORT, type RouteDirection } from "@/lib/xchain/tsd-route";
import { TRACKER_NAME, trackerUrl } from "@/lib/xchain/send-rules";
import { cancelMyDexSwap, getDexSwaps } from "@/lib/dex/dex.functions";
import { DEX_STATUS_LABEL, dexStepIndex, dexSteps, type DexStatus } from "@/lib/dex/swap-rules";
import { DEX_NETWORKS, type DexNetwork } from "@/lib/dex/venues";
import { cancelMyTwoStepSwap, getTwoStepSwaps } from "@/lib/two-step/two-step.functions";
import { TWO_STEP_LABEL, twoStepIndex, twoStepSteps, type TwoStepStatus } from "@/lib/two-step/rules";

type SendRow = Awaited<ReturnType<typeof getSwapSendContext>>["sends"][number];
type RouteRow = Awaited<ReturnType<typeof getTsdRoutes>>["routes"][number];
type DexRow = Awaited<ReturnType<typeof getDexSwaps>>["swaps"][number];
type TwoRow = Awaited<ReturnType<typeof getTwoStepSwaps>>["swaps"][number];

const num = (n: number | null | undefined, d = 8) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });

const ROUTE_LABEL: Record<string, string> = {
  reserved: "Starting", sending_tsd: "Sending TSD", bridging: "TSD Bridge converting", swapping: "Swapping", gas_pending: "Paying network fee",
  swap_sent: "Swapping", minting: "Sending USDC to TSD Bridge", needs_ok: "Price moved — your call", done: "Delivered",
  refunded: "Refunded", kept_usdc: "Stopped — USDC in your pocket", failed: "Stopped",
};
const SEND_LABEL: Record<string, string> = { signing: "Sending…", sent: "Swapping", done: "Delivered", refunded: "Refunded", failed: "Not sent", unknown: "Checking" };

function coinLabel(asset: string) {
  const c = SWAP_COINS.find((x) => x.asset === asset);
  return c ? { symbol: c.symbol, network: c.network } : { symbol: asset, network: "" };
}

function Track({ txid, protocol }: { txid: string; protocol: string }) {
  const p = protocol === "maya" ? "maya" : "thorchain";
  return (
    <a href={trackerUrl(p, txid)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary underline">
      Track on {TRACKER_NAME[p]} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/**
 * One history for every swap the member started on this page. A TSD swap is a
 * single row with its steps; its swap step is part of it, never a second row.
 */
export function MySwaps({ signedIn, sends }: { signedIn: boolean; sends: SendRow[] }) {
  const qc = useQueryClient();
  const fetchRoutes = useServerFn(getTsdRoutes);
  const { data } = useQuery({
    queryKey: ["tsd-routes"],
    queryFn: () => fetchRoutes(),
    enabled: signedIn,
    refetchInterval: (q) => (q.state.data?.routes.some((r) => !isTerminal(r.stage)) ? 15_000 : 60_000),
  });
  const answer = useServerFn(answerTsdSwap);
  const act = useMutation({
    mutationFn: (v: { id: string; choice: "continue" | "stop" }) => answer({ data: v }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tsd-routes"] }),
  });
  const fetchDex = useServerFn(getDexSwaps);
  const { data: dexData } = useQuery({
    queryKey: ["dex-swaps"],
    queryFn: () => fetchDex(),
    enabled: signedIn,
    refetchInterval: (q) => (q.state.data?.swaps.some((r) => !r.terminal) ? 10_000 : 60_000),
  });
  const cancelDex = useServerFn(cancelMyDexSwap);
  const stopDex = useMutation({
    mutationFn: (id: string) => cancelDex({ data: { id } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["dex-swaps"] }),
  });
  const fetchTwo = useServerFn(getTwoStepSwaps);
  const { data: twoData } = useQuery({
    queryKey: ["two-step-swaps"],
    queryFn: () => fetchTwo(),
    enabled: signedIn,
    refetchInterval: (q) => (q.state.data?.swaps.some((r) => !r.terminal) ? 10_000 : 60_000),
  });
  const cancelTwo = useServerFn(cancelMyTwoStepSwap);
  const stopTwo = useMutation({
    mutationFn: (id: string) => cancelTwo({ data: { id } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["two-step-swaps"] }),
  });
  const routes: RouteRow[] = data?.routes ?? [];
  const dexRows: DexRow[] = dexData?.swaps ?? [];
  // Older swaps may predate the server hiding TSD steps; never show one twice.
  const legIds = new Set(routes.map((r) => r.swap_send_id).filter(Boolean));
  const rows = [
    ...routes.map((r) => ({ kind: "tsd" as const, at: r.created_at, r })),
    ...sends.filter((s) => !legIds.has(s.id)).map((s) => ({ kind: "send" as const, at: s.created_at, s })),
    ...dexRows.map((d) => ({ kind: "dex" as const, at: d.created_at, d })),
    ...(twoData?.swaps ?? []).map((t) => ({ kind: "two" as const, at: t.created_at, t })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!rows.length) return null;

  return (
    <div className="rounded-sm border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 font-mono text-[11px] tracking-[0.2em] uppercase">My swaps</h2>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          if (row.kind === "two") return <TwoStepItem key={`w-${row.t.id}`} t={row.t} onCancel={() => stopTwo.mutate(row.t.id)} cancelling={stopTwo.isPending} />;
          if (row.kind === "dex") return <DexItem key={`d-${row.d.id}`} d={row.d} onCancel={() => stopDex.mutate(row.d.id)} cancelling={stopDex.isPending} />;
          if (row.kind === "send") {
            const s = row.s;
            const from = coinLabel(s.from_asset), to = coinLabel(s.to_asset);
            return (
              <li key={`s-${s.id}`} className="space-y-2 px-4 py-3 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {num(Number(s.amount_in))} {from.symbol} → {to.symbol}
                    <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{from.network} → {to.network}</span>
                  </span>
                  <span className={`font-mono text-[11px] ${s.status === "done" ? "text-primary" : s.status === "failed" ? "text-destructive" : ""}`}>{SEND_LABEL[s.status] ?? s.status}</span>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {s.status === "done" ? "Got" : "Expecting"} ≈ {num(Number(s.expected_out))} {to.symbol} · {when(s.created_at)}
                </p>
                {s.error ? <p className="text-[11px] text-muted-foreground">{s.error}</p> : null}
                {s.txid && s.status !== "failed" ? <Track txid={s.txid} protocol={s.protocol} /> : null}
              </li>
            );
          }
          const r = row.r;
          const sym = swapCoin(r.coin)?.symbol ?? r.coin;
          const direct = r.coin === "USDC";
          const buy = r.direction === "buy";
          const steps = routeSteps(r.direction as RouteDirection, direct ? "USDC" : sym, SWAPPER_SHORT[r.protocol] ?? "THORChain");
          const at = stepIndex(r.direction as RouteDirection, r.stage === "gas_pending" ? (r.resume_stage ?? "swapping") : r.stage, direct);
          const stopped = ["failed", "refunded", "kept_usdc"].includes(r.stage);
          return (
            <li key={`t-${r.id}`} className="space-y-2 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{buy ? `${num(Number(r.amount_in), 2)} TSD → ${sym}` : `${num(Number(r.amount_in))} ${sym} → TSD`}</span>
                <span className={`font-mono text-[11px] ${r.stage === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{ROUTE_LABEL[r.stage] ?? r.stage}</span>
              </div>
              <ol className="flex flex-wrap gap-x-4 gap-y-1">
                {steps.map((s, i) => (
                  <li key={s} className={`flex items-center gap-1.5 ${i < at ? "text-foreground" : "text-muted-foreground"}`}>
                    {i < at ? <Check className="h-3.5 w-3.5 text-primary" /> : i === at && !stopped ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Circle className="h-3 w-3" />}
                    {s}
                  </li>
                ))}
              </ol>
              <p className="font-mono text-[11px] text-muted-foreground">
                {r.stage === "done" ? `Got ${num(Number(r.amount_out ?? r.shown_out), buy ? 8 : 2)} ${buy ? sym : "TSD"}` : `Expecting ≈ ${num(Number(r.shown_out), buy ? 8 : 2)} ${buy ? sym : "TSD"}`}
                {" · "}
                {when(r.created_at)}
              </p>
              {r.error ? <p className="text-[11px] text-muted-foreground">{r.error}</p> : null}
              {r.swap_txid ? <Track txid={r.swap_txid} protocol={r.protocol} /> : null}
              {r.stage === "needs_ok" ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <span className="flex-1 text-[11px]">
                    <Coins className="mr-1 inline h-3.5 w-3.5 text-primary" />
                    New price: ≈ {num(Number(r.fresh_out), 8)} {buy ? sym : "USDC"}
                  </span>
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, choice: "continue" })} className="h-8 rounded-md bg-action px-3 font-semibold text-action-foreground disabled:opacity-50">
                    Continue at new price
                  </button>
                  <button type="button" disabled={act.isPending} onClick={() => act.mutate({ id: r.id, choice: "stop" })} className="h-8 rounded-md border border-border px-3 disabled:opacity-50">
                    {buy ? "Keep the USDC" : "Cancel"}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {act.error ? <p role="alert" className="px-4 pb-3 font-mono text-xs text-destructive">{(act.error as Error).message}</p> : null}
      {stopTwo.error ? <p role="alert" className="px-4 pb-3 font-mono text-xs text-destructive">{(stopTwo.error as Error).message}</p> : null}
      {stopDex.error ? <p role="alert" className="px-4 pb-3 font-mono text-xs text-destructive">{(stopDex.error as Error).message}</p> : null}
    </div>
  );
}

/** A Uniswap / PancakeSwap / PulseX swap: one row with its steps (a TSD Bridge step is part of it). */
function DexItem({ d, onCancel, cancelling }: { d: DexRow; onCancel: () => void; cancelling: boolean }) {
  const side = (d.tsd_side as "buy" | "sell" | null) ?? null;
  const venue = d.venue_name ?? "Pool";
  const steps = dexSteps(side, venue, d.symbol_out);
  const at = dexStepIndex(side, d.status);
  const stopped = ["failed", "kept_usdc", "declined", "expired", "cancelled"].includes(d.status);
  const netName = DEX_NETWORKS[d.network as DexNetwork]?.name ?? d.network;
  return (
    <li className="space-y-2 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(d.amount_in)} {d.symbol_in} → {d.symbol_out}
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{venue} · {netName}</span>
        </span>
        <span className={`font-mono text-[11px] ${d.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{DEX_STATUS_LABEL[d.status as DexStatus] ?? d.status}</span>
      </div>
      {!stopped ? (
        <ol className="flex flex-wrap gap-x-4 gap-y-1">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-1.5 ${i < at ? "text-foreground" : "text-muted-foreground"}`}>
              {i < at ? <Check className="h-3.5 w-3.5 text-primary" /> : i === at ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Circle className="h-3 w-3" />}
              {s}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="font-mono text-[11px] text-muted-foreground">
        {d.status === "done" && d.amount_out != null ? `Got ${num(d.amount_out)} ${d.symbol_out}` : `Expecting ≈ ${num(d.shown_out)} ${d.symbol_out}${d.min_out != null ? ` (at least ${num(d.min_out)})` : ""}`}
        {" · "}
        {when(d.created_at)}
      </p>
      {d.error ? <p className="text-[11px] text-muted-foreground">{d.error}</p> : null}
      {d.swap_txid ? (
        <a href={`${d.explorerTx}${d.swap_txid}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary underline">
          See the swap on the explorer <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
      {d.status === "awaiting_approval" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="flex-1 text-[11px]">Tap Approve in Telegram to start. Nothing moves until you do.</span>
          <button type="button" disabled={cancelling} onClick={onCancel} className="h-8 rounded-md border border-border px-3 disabled:opacity-50">
            Cancel
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** A two-step swap: one row, one Telegram tap, both hops shown as its steps. */
function TwoStepItem({ t, onCancel, cancelling }: { t: TwoRow; onCancel: () => void; cancelling: boolean }) {
  const swapper = PROTOCOL_LABEL[t.xProtocol];
  const steps = twoStepSteps({ direction: t.direction as "dex_then_x" | "x_then_dex", symbolIn: t.symbol_in, mid: t.mid_symbol, symbolOut: t.symbol_out, pool: t.pool, swapper });
  const at = twoStepIndex(t.status);
  const stopped = ["failed", "refunded", "kept_mid", "declined", "expired", "cancelled"].includes(t.status);
  return (
    <li className="space-y-2 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(t.amount_in)} {t.symbol_in} → {t.symbol_out}
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">two steps via {t.mid_symbol} · {t.networkName}</span>
        </span>
        <span className={`font-mono text-[11px] ${t.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{TWO_STEP_LABEL[t.status as TwoStepStatus] ?? t.status}</span>
      </div>
      {!stopped ? (
        <ol className="flex flex-wrap gap-x-4 gap-y-1">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-1.5 ${i < at ? "text-foreground" : "text-muted-foreground"}`}>
              {i < at ? <Check className="h-3.5 w-3.5 text-primary" /> : i === at ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : <Circle className="h-3 w-3" />}
              {s}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="font-mono text-[11px] text-muted-foreground">
        {t.status === "done" && t.amount_out != null ? `Got ${num(t.amount_out)} ${t.symbol_out}` : `Expecting ≈ ${num(t.shown_out)} ${t.symbol_out} (at least ${num(t.min_out)})`}
        {t.mid_amount != null && t.status !== "done" ? ` · ${num(t.mid_amount)} ${t.mid_symbol} after step 1` : ""}
        {" · "}
        {when(t.created_at)}
      </p>
      {t.error ? <p className="text-[11px] text-muted-foreground">{t.error}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {t.poolTx ? (
          <a href={t.poolTx} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11px] text-primary underline">
            Pool swap on the explorer <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {t.xTxid ? <Track txid={t.xTxid} protocol={t.xProtocol} /> : null}
      </div>
      {t.status === "awaiting_approval" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="flex-1 text-[11px]">Tap Approve in Telegram to start. Nothing moves until you do.</span>
          <button type="button" disabled={cancelling} onClick={onCancel} className="h-8 rounded-md border border-border px-3 disabled:opacity-50">
            Cancel
          </button>
        </div>
      ) : null}
    </li>
  );
}
