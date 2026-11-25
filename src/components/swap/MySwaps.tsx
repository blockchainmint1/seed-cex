import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, CheckCircle2, ChevronDown, Circle, Coins, ExternalLink, Loader2, XCircle } from "lucide-react";
import { parseSwapRef } from "@/lib/activity/activity-rules";
import { PROTOCOL_LABEL, SWAP_COINS, swapCoin } from "@/lib/xchain/assets";
import type { getSwapSendContext } from "@/lib/xchain/swap.functions";
import { answerTsdSwap, getTsdRoutes } from "@/lib/xchain/tsd-route.functions";
import { isTerminal, routeSteps, stepIndex, SWAPPER_SHORT, type RouteDirection } from "@/lib/xchain/tsd-route";
import { TRACKER_NAME, trackerUrl } from "@/lib/xchain/send-rules";
import { cancelMyDexSwap, getDexSwaps } from "@/lib/dex/dex.functions";
import { DEX_STATUS_LABEL, dexStepIndex, dexSteps, type DexStatus } from "@/lib/dex/swap-rules";
import { DEX_NETWORKS, type DexNetwork } from "@/lib/dex/venues";
import { cancelMyTwoStepSwap, getTwoStepSwaps } from "@/lib/two-step/two-step.functions";
import { cancelMyRelaySwap, getRelaySwaps } from "@/lib/relay/relay.functions";
import { cancelMyHypeChain, getHypeChainSwaps } from "@/lib/hype-chain/hype-chain.functions";
import { getTonSwaps } from "@/lib/ston/ston.functions";
import { RELAY_STATUS_LABEL, type RelayStatus } from "@/lib/relay/rules";
import { getChain } from "@/lib/chains";
import { TWO_STEP_LABEL, twoStepIndex, twoStepSteps, type TwoStepStatus } from "@/lib/two-step/rules";

type SendRow = Awaited<ReturnType<typeof getSwapSendContext>>["sends"][number];
type RouteRow = Awaited<ReturnType<typeof getTsdRoutes>>["routes"][number];
type DexRow = Awaited<ReturnType<typeof getDexSwaps>>["swaps"][number];
type TwoRow = Awaited<ReturnType<typeof getTwoStepSwaps>>["swaps"][number];
type ChainRow = Awaited<ReturnType<typeof getHypeChainSwaps>>["swaps"][number];
type TonRow = Awaited<ReturnType<typeof getTonSwaps>>["swaps"][number];
type RelayRow = Awaited<ReturnType<typeof getRelaySwaps>>["swaps"][number];

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
export function MySwaps({ signedIn, sends, focus }: { signedIn: boolean; sends: SendRow[]; focus?: string }) {
  const qc = useQueryClient();
  // A history row can open this page on one record: scroll to it and open its Details.
  const parsed = parseSwapRef(focus);
  const focusKey = parsed ? `${parsed.kind}-${parsed.id}` : null;
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
  const fetchRelay = useServerFn(getRelaySwaps);
  const { data: relayData } = useQuery({
    queryKey: ["relay-swaps"],
    queryFn: () => fetchRelay(),
    enabled: signedIn,
    refetchInterval: (q) => (q.state.data?.swaps.some((r) => !r.terminal) ? 10_000 : 60_000),
  });
  const fetchChains = useServerFn(getHypeChainSwaps);
  const { data: chainData } = useQuery({ queryKey: ["hype-chains"], queryFn: () => fetchChains(), enabled: signedIn, refetchInterval: 15_000 });
  const cancelChain = useServerFn(cancelMyHypeChain);
  const stopChain = useMutation({ mutationFn: (id: string) => cancelChain({ data: { id } }), onSettled: () => qc.invalidateQueries({ queryKey: ["hype-chains"] }) });
  const fetchTon = useServerFn(getTonSwaps);
  const { data: tonData } = useQuery({ queryKey: ["ton-swaps", "mine"], queryFn: () => fetchTon(), enabled: signedIn, refetchInterval: (q) => (q.state.data?.swaps.some((t) => ["signing", "sent", "unknown"].includes(t.status)) ? 5_000 : 30_000) });
  const cancelRelay = useServerFn(cancelMyRelaySwap);
  const stopRelay = useMutation({
    mutationFn: (id: string) => cancelRelay({ data: { id } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["relay-swaps"] }),
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
    ...(relayData?.swaps ?? []).map((x) => ({ kind: "relay" as const, at: x.created_at, x })),
    ...(chainData?.swaps ?? []).map((x) => ({ kind: "chain" as const, at: x.created_at, x })),
    ...(tonData?.swaps ?? []).map((n) => ({ kind: "ton" as const, at: n.createdAt, n })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const scrolled = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey || scrolled.current === focusKey) return;
    const el = document.querySelector(`[data-swap="${focusKey}"]`);
    if (!el) return;
    scrolled.current = focusKey;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.querySelector("details")?.setAttribute("open", "");
  }, [focusKey, rows.length]);
  if (!rows.length) return null;

  return (
    <div className="rounded-sm border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 font-mono text-[11px] tracking-[0.2em] uppercase">My swaps</h2>
      <ul className="divide-y divide-border">
        {rows.map((row) => {
          if (row.kind === "chain") return <ChainItem key={`h-${row.x.id}`} x={row.x} onCancel={() => stopChain.mutate(row.x.id)} cancelling={stopChain.isPending} focus={focusKey === `chain-${row.x.id}`} />;
          if (row.kind === "ton") return <TonItem key={`n-${row.n.id}`} n={row.n} focus={focusKey === `ton-${row.n.id}`} />;
          if (row.kind === "relay") return <RelayItem key={`r-${row.x.id}`} x={row.x} onCancel={() => stopRelay.mutate(row.x.id)} cancelling={stopRelay.isPending} focus={focusKey === `relay-${row.x.id}`} />;
          if (row.kind === "two") return <TwoStepItem key={`w-${row.t.id}`} t={row.t} onCancel={() => stopTwo.mutate(row.t.id)} cancelling={stopTwo.isPending} focus={focusKey === `two-${row.t.id}`} />;
          if (row.kind === "dex") return <DexItem key={`d-${row.d.id}`} d={row.d} onCancel={() => stopDex.mutate(row.d.id)} cancelling={stopDex.isPending} focus={focusKey === `dex-${row.d.id}`} />;
          if (row.kind === "send") {
            const s = row.s;
            const from = coinLabel(s.from_asset), to = coinLabel(s.to_asset);
            return (
              <li key={`s-${s.id}`} data-swap={`send-${s.id}`} className={`space-y-2 px-4 py-3 text-xs ${focusKey === `send-${s.id}` ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {num(Number(s.amount_in))} {from.symbol} → {to.symbol}
                    <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{from.network} → {to.network}</span>
                  </span>
                  <span className={`font-mono text-[11px] ${s.status === "done" ? "text-primary" : s.status === "failed" ? "text-destructive" : ""}`}>{SEND_LABEL[s.status] ?? s.status}</span>
                </div>
                <StepTrack steps={[`Send ${from.symbol}`, `${PROTOCOL_LABEL[s.protocol as keyof typeof PROTOCOL_LABEL] ?? "THORChain"} swapping`, `${to.symbol} arrives`]} status={s.status} stopped={s.status === "failed" || s.status === "refunded"} at={s.status === "signing" ? 0 : 1} />
                <p className="font-mono text-[11px] text-muted-foreground">
                  {s.status === "done" ? "Got" : "Expecting"} ≈ {num(Number(s.expected_out))} {to.symbol} · {when(s.created_at)}
                </p>
                {s.error ? <p className="text-[11px] text-muted-foreground">{s.error}</p> : null}
                <SwapDetails entries={log(
                  { at: s.created_at, text: `Swap started: ${num(Number(s.amount_in))} ${from.symbol}` },
                  s.approve_txid ? { at: s.created_at, text: "Token approval", txid: s.approve_txid } : null,
                  s.txid && s.status !== "failed" ? { at: s.created_at, text: `Sent ${from.symbol} to ${PROTOCOL_LABEL[s.protocol as keyof typeof PROTOCOL_LABEL] ?? "THORChain"}`, txid: s.txid, url: trackerUrl(s.protocol === "maya" ? "maya" : "thorchain", s.txid) } : null,
                  s.out_txid ? { at: s.checked_at ?? s.created_at, text: s.status === "refunded" ? "Refund paid back" : `${to.symbol} paid out`, txid: s.out_txid } : null,
                )} />
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
            <li key={`t-${r.id}`} data-swap={`tsd-${r.id}`} className={`space-y-2 px-4 py-3 text-xs ${focusKey === `tsd-${r.id}` ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{buy ? `${num(Number(r.amount_in), 2)} TSD → ${sym}` : `${num(Number(r.amount_in))} ${sym} → TSD`}</span>
                <span className={`font-mono text-[11px] ${r.stage === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{ROUTE_LABEL[r.stage] ?? r.stage}</span>
              </div>
              <StepTrack steps={steps} status={r.stage} stopped={stopped} at={at} />
              <p className="font-mono text-[11px] text-muted-foreground">
                {r.stage === "done" ? `Got ${num(Number(r.amount_out ?? r.shown_out), buy ? 8 : 2)} ${buy ? sym : "TSD"}` : `Expecting ≈ ${num(Number(r.shown_out), buy ? 8 : 2)} ${buy ? sym : "TSD"}`}
                {" · "}
                {when(r.created_at)}
              </p>
              {r.error ? <p className="text-[11px] text-muted-foreground">{r.error}</p> : null}
              <SwapDetails entries={log(
                { at: r.created_at, text: buy ? `Swap started: ${num(Number(r.amount_in), 2)} TSD` : `Swap started: ${num(Number(r.amount_in))} ${sym}` },
                r.bridge_order_id ? { at: r.created_at, text: "TSD Bridge order", url: bridgeOrderUrl(r.bridge_order_id) } : null,
                r.tsd_txid ? { at: r.created_at, text: "Sent TSD to TSD Bridge", txid: r.tsd_txid, url: TXC_TX + r.tsd_txid } : null,
                r.usdc_txid ? { at: r.updated_at, text: "USDC sent", txid: r.usdc_txid, url: ETH_TX + r.usdc_txid } : null,
                r.bridge_out_txid ? { at: r.updated_at, text: "TSD Bridge paid out", txid: r.bridge_out_txid, url: /^0x/.test(r.bridge_out_txid) ? ETH_TX + r.bridge_out_txid : null } : null,
                r.swap_txid ? { at: r.updated_at, text: `${SWAPPER_SHORT[r.protocol] ?? "THORChain"} swap`, txid: r.swap_txid, url: trackerUrl(r.protocol === "maya" ? "maya" : "thorchain", r.swap_txid) } : null,
                r.stage === "done" ? { at: r.updated_at, text: "Delivered" } : null,
              )} />
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

/** A one-tap coin <-> HYPE swap through ETH: one row with its steps. */
function ChainItem({ x, onCancel, cancelling, focus }: { x: ChainRow; onCancel: () => void; cancelling: boolean; focus?: boolean }) {
  const stopped = ["failed", "kept_mid", "declined", "expired", "cancelled"].includes(x.status);
  return (
    <li data-swap={`chain-${x.id}`} className={`space-y-2 px-4 py-3 text-xs ${focus ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(x.amount_in)} {x.symbolIn} → {x.symbolOut}
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">via ETH + Relay{x.steps.length > 3 ? " + STON.fi" : ""}</span>
        </span>
        <span className={`font-mono text-[11px] ${x.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{x.label}</span>
      </div>
      <StepTrack steps={x.steps} status={x.status} stopped={stopped} />
      <p className="font-mono text-[11px] text-muted-foreground">
        {x.status === "done" && x.amount_out != null ? `Got ≈ ${num(x.amount_out)} ${x.symbolOut}` : `Expecting ≈ ${num(x.shown_out)} ${x.symbolOut}`} · {when(x.created_at)}
      </p>
      {x.error ? <p className="text-[11px] text-muted-foreground">{x.error}</p> : null}
      <SwapDetails entries={x.log} />
      {x.status === "awaiting_approval" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="flex-1 text-[11px]">Tap Approve in Telegram to start. Nothing moves until you do.</span>
          <button type="button" disabled={cancelling} onClick={onCancel} className="h-8 rounded-md border border-border px-3 disabled:opacity-50">Cancel</button>
        </div>
      ) : null}
    </li>
  );
}

const TON_AT: Record<string, number> = { signing: 0, sent: 1, unknown: 1, done: 2 };
const TON_LABEL: Record<string, string> = { signing: "Sending TON", sent: "STON.fi swapping", unknown: "Checking", done: "Delivered", refunded: "TON returned", failed: "Not sent" };

/** A standalone STON.fi swap (TON -> USD₮ on TON): one row with its two steps. */
function TonItem({ n, focus }: { n: TonRow; focus?: boolean }) {
  const stopped = n.status === "failed" || n.status === "refunded";
  const steps = ["Send TON to STON.fi", "USD₮ arrives"];
  const at = TON_AT[n.status] ?? 0;
  return (
    <li data-swap={`ton-${n.id}`} className={`space-y-2 px-4 py-3 text-xs ${focus ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(n.ton)} TON → USD₮ on TON
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">STON.fi</span>
        </span>
        <span className={`font-mono text-[11px] ${n.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{TON_LABEL[n.status] ?? n.status}</span>
      </div>
      <StepTrack steps={steps} status={n.status} stopped={stopped} at={at} />
      <p className="font-mono text-[11px] text-muted-foreground">
        {n.gotUsdt != null ? `Got ${num(n.gotUsdt, 6)} USD₮ on TON` : `At least ${num(n.minUsdt, 6)} USD₮ on TON`} · {when(n.createdAt)}
      </p>
      {n.error && n.status !== "done" ? <p className="text-[11px] text-muted-foreground">{n.error}</p> : null}
      <SwapDetails entries={log(
        { at: n.createdAt, text: `Swap started: ${num(n.ton)} TON` },
        n.txid ? { at: n.createdAt, text: "Sent TON to STON.fi", txid: n.txid, url: `https://tonviewer.com/transaction/${n.txid}` } : null,
        n.gotUsdt != null ? { at: n.createdAt, text: `USD₮ arrived: ${num(n.gotUsdt, 6)}` } : null,
      )} />
    </li>
  );
}

/** A Relay swap (ETH <-> HYPE): one row. */
function RelayItem({ x, onCancel, cancelling, focus }: { x: RelayRow; onCancel: () => void; cancelling: boolean; focus?: boolean }) {
  const stopped = ["failed", "declined", "expired", "cancelled", "refunded"].includes(x.status);
  const explorer = (c: string) => getChain(c as never).explorer.replace(/\/address\/$/, "/tx/");
  return (
    <li data-swap={`relay-${x.id}`} className={`space-y-2 px-4 py-3 text-xs ${focus ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(x.amount_in)} {x.symbolIn} → {x.symbolOut}
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">Relay</span>
        </span>
        <span className={`font-mono text-[11px] ${x.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{RELAY_STATUS_LABEL[x.status as RelayStatus] ?? x.status}</span>
      </div>
      <StepTrack steps={["Telegram tap", `Send ${x.symbolIn} to Relay`, `${x.symbolOut} arrives`]} status={x.status} stopped={stopped} at={({ awaiting_approval: 0, approved: 1, sending: 1, bridging: 2 } as Record<string, number>)[x.status] ?? 0} />
      <p className="font-mono text-[11px] text-muted-foreground">
        {x.status === "done" && x.amount_out != null ? `Got ≈ ${num(x.amount_out)} ${x.symbolOut}` : `Expecting ≈ ${num(x.shown_out)} ${x.symbolOut}`} · {when(x.created_at)}
      </p>
      {x.error ? <p className="text-[11px] text-muted-foreground">{x.error}</p> : null}
      <SwapDetails entries={log(
        { at: x.created_at, text: `Swap started: ${num(x.amount_in)} ${x.symbolIn}` },
        x.deposit_txid ? { at: x.created_at, text: `Sent ${x.symbolIn} to Relay`, txid: x.deposit_txid, url: `${explorer(x.fromChain)}${x.deposit_txid}` } : null,
        x.out_txid ? { at: x.updated_at ?? x.created_at, text: x.status === "refunded" ? "Relay refunded" : `Relay paid out ${x.symbolOut}`, txid: x.out_txid, url: `${explorer(x.status === "refunded" ? x.fromChain : x.toChain)}${x.out_txid}` } : null,
        x.status === "done" ? { at: x.updated_at ?? x.created_at, text: "Delivered" } : null,
      )} />
      {x.status === "awaiting_approval" ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="flex-1 text-[11px]">Tap Approve in Telegram to start. Nothing moves until you do.</span>
          <button type="button" disabled={cancelling} onClick={onCancel} className="h-8 rounded-md border border-border px-3 disabled:opacity-50">Cancel</button>
        </div>
      ) : null}
    </li>
  );
}

/** A Uniswap / PancakeSwap / PulseX swap: one row with its steps (a TSD Bridge step is part of it). */
function DexItem({ d, onCancel, cancelling, focus }: { d: DexRow; onCancel: () => void; cancelling: boolean; focus?: boolean }) {
  const side = (d.tsd_side as "buy" | "sell" | null) ?? null;
  const venue = d.venue_name ?? "Pool";
  const steps = dexSteps(side, venue, d.symbol_out);
  const at = dexStepIndex(side, d.status);
  const stopped = ["failed", "kept_usdc", "declined", "expired", "cancelled"].includes(d.status);
  const netName = DEX_NETWORKS[d.network as DexNetwork]?.name ?? d.network;
  return (
    <li data-swap={`dex-${d.id}`} className={`space-y-2 px-4 py-3 text-xs ${focus ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(d.amount_in)} {d.symbol_in} → {d.symbol_out}
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">{venue} · {netName}</span>
        </span>
        <span className={`font-mono text-[11px] ${d.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{DEX_STATUS_LABEL[d.status as DexStatus] ?? d.status}</span>
      </div>
      <StepTrack steps={steps} status={d.status} stopped={stopped} at={at} />
      <p className="font-mono text-[11px] text-muted-foreground">
        {d.status === "done" && d.amount_out != null ? `Got ${num(d.amount_out)} ${d.symbol_out}` : `Expecting ≈ ${num(d.shown_out)} ${d.symbol_out}${d.min_out != null ? ` (at least ${num(d.min_out)})` : ""}`}
        {" · "}
        {when(d.created_at)}
      </p>
      {d.error ? <p className="text-[11px] text-muted-foreground">{d.error}</p> : null}
      <SwapDetails entries={log(
        { at: d.created_at, text: `Swap started: ${num(d.amount_in)} ${d.symbol_in}` },
        d.approve_txid ? { at: d.created_at, text: `Approved ${d.symbol_in} for ${venue}`, txid: d.approve_txid, url: `${d.explorerTx}${d.approve_txid}` } : null,
        d.swap_txid ? { at: d.updated_at, text: `${venue} swap`, txid: d.swap_txid, url: `${d.explorerTx}${d.swap_txid}` } : null,
        d.status === "done" ? { at: d.updated_at, text: `Delivered ${d.amount_out != null ? num(d.amount_out) : ""} ${d.symbol_out}` } : null,
      )} />
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
function TwoStepItem({ t, onCancel, cancelling, focus }: { t: TwoRow; onCancel: () => void; cancelling: boolean; focus?: boolean }) {
  const swapper = PROTOCOL_LABEL[t.xProtocol];
  const steps = twoStepSteps({ direction: t.direction as "dex_then_x" | "x_then_dex", symbolIn: t.symbol_in, mid: t.mid_symbol, symbolOut: t.symbol_out, pool: t.pool, swapper });
  const at = twoStepIndex(t.status);
  const stopped = ["failed", "refunded", "kept_mid", "declined", "expired", "cancelled"].includes(t.status);
  return (
    <li data-swap={`two-${t.id}`} className={`space-y-2 px-4 py-3 text-xs ${focus ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {num(t.amount_in)} {t.symbol_in} → {t.symbol_out}
          <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">two steps via {t.mid_symbol} · {t.networkName}</span>
        </span>
        <span className={`font-mono text-[11px] ${t.status === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>{TWO_STEP_LABEL[t.status as TwoStepStatus] ?? t.status}</span>
      </div>
      <StepTrack steps={steps} status={t.status} stopped={stopped} at={at} />
      <p className="font-mono text-[11px] text-muted-foreground">
        {t.status === "done" && t.amount_out != null ? `Got ${num(t.amount_out)} ${t.symbol_out}` : `Expecting ≈ ${num(t.shown_out)} ${t.symbol_out} (at least ${num(t.min_out)})`}
        {t.mid_amount != null && t.status !== "done" ? ` · ${num(t.mid_amount)} ${t.mid_symbol} after step 1` : ""}
        {" · "}
        {when(t.created_at)}
      </p>
      {t.error ? <p className="text-[11px] text-muted-foreground">{t.error}</p> : null}
      <SwapDetails entries={log(
        { at: t.created_at, text: `Swap started: ${num(t.amount_in)} ${t.symbol_in}` },
        t.poolTx ? { at: t.created_at, text: "Pool swap", url: t.poolTx } : null,
        t.mid_amount != null ? { at: t.created_at, text: `${num(t.mid_amount)} ${t.mid_symbol} after step 1` } : null,
        t.xTxid ? { at: t.created_at, text: `${swapper} swap`, txid: t.xTxid, url: trackerUrl(t.xProtocol === "maya" ? "maya" : "thorchain", t.xTxid) } : null,
        t.status === "done" ? { at: t.created_at, text: `Delivered ${t.amount_out != null ? num(t.amount_out) : ""} ${t.symbol_out}` } : null,
      )} />
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

type LogEntry = { at: string; text: string; txid?: string | null; url?: string | null };
const TXC_TX = "https://mempool.texitcoin.org/tx/", ETH_TX = "https://etherscan.io/tx/";
const bridgeOrderUrl = (id: string) => `https://tsd.honest.money/swap/TX-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
const log = (...e: Array<LogEntry | null | false | undefined>) => e.filter((x): x is LogEntry => Boolean(x)).sort((a, b) => a.at.localeCompare(b.at));

/** Expandable step-by-step record with each transaction and where to see it (same on every swap). */
function SwapDetails({ entries }: { entries: LogEntry[] }) {
  if (!entries.length) return null;
  return (
    <details className="group border-t border-border pt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1 font-mono text-[11px] text-primary">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /> Details ({entries.length})
      </summary>
      <ol className="mt-2 space-y-1.5">
        {entries.map((e, i) => (
          <li key={i} className="font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground">{when(e.at)}</span> · {e.text}
            {e.txid ? <> · <span className="break-all">{e.txid.slice(0, 10)}…{e.txid.slice(-6)}</span></> : null}
            {e.url ? <> · <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline">view <ExternalLink className="h-3 w-3" /></a></> : null}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** Which step a chained swap is on (0 = the Telegram tap); steps.length = all done. */
const CHAIN_AT: Record<string, number> = { awaiting_approval: 0, approved: 1, leg1: 1, mid: 2, leg2: 2, mid2: 3, leg3: 3 };

/** Live step tracker: done steps get a check, the running one spins, later ones wait. */
function StepTrack({ steps, status, stopped, at: atIn }: { steps: string[]; status: string; stopped: boolean; at?: number }) {
  const at = status === "done" ? steps.length : atIn ?? CHAIN_AT[status] ?? 0;
  const pct = Math.round((Math.min(at, steps.length) / steps.length) * 100);
  return (
    <div className="space-y-2">
      <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all duration-700 ${stopped ? "bg-destructive" : "bg-primary"}`} style={{ width: `${stopped ? 100 : Math.max(pct, 4)}%` }} />
      </div>
      <ol className="flex flex-wrap gap-x-4 gap-y-1.5">
        {steps.map((s, i) => {
          const done = !stopped && i < at;
          const live = !stopped && i === at && status !== "done";
          return (
            <li key={s} className={`flex items-center gap-1.5 font-mono text-[11px] ${live ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"}`}>
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : live ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : stopped ? <XCircle className="h-3.5 w-3.5 opacity-60" /> : <Circle className="h-3.5 w-3.5 opacity-50" />}
              {s}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
