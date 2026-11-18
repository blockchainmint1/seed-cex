import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Circle, Coins, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SWAP_COINS, swapCoin, type SwapCoinId } from "@/lib/xchain/assets";
import { SWAP_LIMITS } from "@/lib/xchain/send-rules";
import { answerTsdSwap, getTsdRouteQuote, getTsdRoutes, startTsdSwap } from "@/lib/xchain/tsd-route.functions";
import { isTerminal, routeBlocker, routeCoinProblem, routeSteps, stepIndex, type RouteDirection } from "@/lib/xchain/tsd-route";

type LinkCtx = { mode: string; hasKey: boolean; pockets: string[] } | null;

const num = (n: number | null | undefined, d = 8) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));
const mins = (s: number | null) => (s == null ? "—" : `~${Math.max(1, Math.round(s / 60))} min`);

const BUY_COINS = SWAP_COINS.filter((c) => !routeCoinProblem("buy", c));
const SELL_COINS = SWAP_COINS.filter((c) => !routeCoinProblem("sell", c));

const STAGE_LABEL: Record<string, string> = {
  reserved: "Starting", sending_tsd: "Sending TSD", bridging: "TSD Bridge converting", swapping: "Swapping", gas_pending: "Paying network fee",
  swap_sent: "THORChain swapping", minting: "Sending USDC to TSD Bridge", needs_ok: "Price moved — your call", done: "Delivered",
  refunded: "Refunded", kept_usdc: "Stopped — USDC in your pocket", failed: "Stopped",
};

/** Buy any THORChain coin with TSD, or sell it back to TSD, in one step. */
export function TsdSwapPanel({ signedIn, link, isAdmin }: { signedIn: boolean; link: LinkCtx; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<RouteDirection>("buy");
  const [coinId, setCoinId] = useState<SwapCoinId>("BTC");
  const [amount, setAmount] = useState("50");
  const [agree, setAgree] = useState(false);
  const coin = swapCoin(coinId)!;
  const list = direction === "buy" ? BUY_COINS : SELL_COINS;

  const fetchQuote = useServerFn(getTsdRouteQuote);
  const quote = useMutation({ mutationFn: () => fetchQuote({ data: { direction, coin: coinId, amount } }) });
  const start = useServerFn(startTsdSwap);
  const started = useMutation({
    mutationFn: () => start({ data: { direction, coin: coinId, amount, shownOut: quote.data!.out } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tsd-routes"] }),
  });
  const fetchRoutes = useServerFn(getTsdRoutes);
  const { data: routes } = useQuery({
    queryKey: ["tsd-routes"],
    queryFn: () => fetchRoutes(),
    enabled: signedIn,
    refetchInterval: (q) => (q.state.data?.routes.some((r) => !isTerminal(r.stage)) ? 15_000 : 60_000),
  });

  const reset = () => {
    quote.reset();
    started.reset();
    setAgree(false);
  };
  const q = quote.data;
  const outSymbol = direction === "buy" ? coin.symbol : "TSD";
  const blocker = q?.ok
    ? routeBlocker({ direction, coin, link, isAdmin, amountUsd: q.amountUsd, tsdAmount: direction === "buy" ? q.amountIn : q.out })
    : null;

  return (
    <section className="space-y-4 rounded-sm border border-primary/50 bg-surface p-5" aria-labelledby="tsd-swap-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Pay with TSD</p>
          <h2 id="tsd-swap-title" className="font-display text-2xl font-bold tracking-tight">TSD in, real coins out.</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Spend TSD on any coin THORChain trades, or turn coins back into TSD — one step for you. Every coin lands in your
            own trading pocket.
          </p>
        </div>
        <div role="tablist" aria-label="Direction" className="inline-flex rounded-sm border border-border p-0.5">
          {(["buy", "sell"] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={direction === d}
              onClick={() => {
                setDirection(d);
                const ok = (d === "buy" ? BUY_COINS : SELL_COINS).some((c) => c.id === coinId);
                if (!ok) setCoinId("BTC");
                setAmount(d === "buy" ? "50" : "0.001");
                reset();
              }}
              className={`rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-wider uppercase transition-colors ${direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {d === "buy" ? "Buy with TSD" : "Sell for TSD"}
            </button>
          ))}
        </div>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          started.reset();
          quote.mutate();
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">You spend</span>
          <div className="flex h-12 items-center rounded-sm border border-input bg-background focus-within:border-primary">
            <input
              inputMode="decimal"
              aria-label="Amount you spend"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                reset();
              }}
              className="h-full min-w-0 flex-1 bg-transparent px-3 num text-lg outline-none"
            />
            <span className="px-3 font-mono text-sm text-muted-foreground">{direction === "buy" ? "TSD" : coin.symbol}</span>
          </div>
        </label>
        <ArrowRight className="mx-auto hidden h-4 w-4 text-muted-foreground sm:mb-4 sm:block" />
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{direction === "buy" ? "You get" : "Coin you sell"}</span>
          <Select
            value={coinId}
            onValueChange={(v) => {
              setCoinId(v as SwapCoinId);
              reset();
            }}
          >
            <SelectTrigger aria-label={direction === "buy" ? "Coin you get" : "Coin you sell"} className="h-12 rounded-sm font-mono [&>span]:truncate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {list.map((c) => (
                <SelectItem key={c.id} value={c.id} className="font-mono">
                  {c.symbol} <span className="text-muted-foreground">· {c.network}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="submit"
          disabled={quote.isPending || !amount}
          className="h-12 rounded-md bg-action px-5 text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {quote.isPending ? "Pricing…" : "Get price"}
        </button>
      </form>
      {quote.error ? <p role="alert" className="font-mono text-xs text-destructive">{(quote.error as Error).message}</p> : null}

      {q ? (
        q.ok ? (
          <div className="grid gap-4 rounded-sm border border-border bg-background p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <div className="space-y-3">
              <div>
                <p className="font-display text-2xl font-bold tabular-nums">
                  ≈ {num(q.out, direction === "buy" ? 8 : 2)} {outSymbol}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  ≈ {usd(q.outUsd)} · in your trading pocket in {mins(q.seconds)} (estimate)
                  {q.minOut != null && direction === "buy" && coin.id !== "USDC" ? ` · never less than ${num(q.minOut)} ${coin.symbol}, or USDC back` : ""}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-xs">
                <dt className="text-muted-foreground">TSD Bridge fee</dt>
                <dd className="text-right tabular-nums">{q.bridgeFeeBps ? `${q.bridgeFeeBps / 100}%` : "None"}</dd>
                {coin.id !== "USDC" ? (
                  <>
                    <dt className="text-muted-foreground">THORChain swap cost</dt>
                    <dd className="text-right tabular-nums">{usd(q.swapFeeUsd)}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Ethereum network fee</dt>
                <dd className="text-right">{q.gasCovered ? "Covered by Seeds" : "From your pocket's ETH"}</dd>
                <dt className="text-muted-foreground">Seeds fee</dt>
                <dd className="text-right">None</dd>
              </dl>
            </div>
            <ol className="space-y-1.5 border-t border-border pt-3 text-xs md:border-t-0 md:border-l md:pt-0 md:pl-4">
              {routeSteps(direction, coin.id === "USDC" ? "USDC" : coin.symbol).map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/60 font-mono text-[10px] text-primary">{i + 1}</span>
                  {s}
                </li>
              ))}
              <li className="pt-1 text-[11px] text-muted-foreground">
                USDC passes through your own EVM pocket between steps — Seeds never holds it.
              </li>
            </ol>

            <div className="space-y-3 border-t border-border pt-3 md:col-span-2">
              {!signedIn ? (
                <p className="text-xs text-muted-foreground">
                  <Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to swap from your trading pocket.
                </p>
              ) : blocker ? (
                <p className="text-xs text-muted-foreground">{blocker}</p>
              ) : started.data ? (
                <p className="rounded-sm border border-primary bg-primary/10 p-3 text-xs">
                  <span className="font-semibold">Started.</span> Follow it below under “My TSD swaps” — we'll also message you on Telegram when it lands.
                </p>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-primary" />
                    <span>
                      I understand blockchain sends can't be undone, and the final amount can differ a little from this price (Seeds asks
                      me again if it moves more than 2%). Test limits: ${SWAP_LIMITS.perSwapUsd} per swap, ${SWAP_LIMITS.dailyUsd} a day.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={!agree || started.isPending}
                    onClick={() => started.mutate()}
                    className="h-11 w-full rounded-md bg-action text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {started.isPending ? "Checking everything and starting…" : direction === "buy" ? `Swap ${amount} TSD for ${coin.symbol}` : `Swap ${amount} ${coin.symbol} for TSD`}
                  </button>
                </>
              )}
              {started.error ? <p role="alert" className="font-mono text-xs text-destructive">{(started.error as Error).message}</p> : null}
            </div>
          </div>
        ) : (
          <p className="rounded-sm border border-border bg-background p-4 text-sm text-muted-foreground">{q.error}</p>
        )
      ) : null}

      {routes?.routes.length ? <MyTsdSwaps routes={routes.routes} /> : null}
    </section>
  );
}

type RouteRow = Awaited<ReturnType<typeof getTsdRoutes>>["routes"][number];

function MyTsdSwaps({ routes }: { routes: RouteRow[] }) {
  const qc = useQueryClient();
  const answer = useServerFn(answerTsdSwap);
  const act = useMutation({
    mutationFn: (v: { id: string; choice: "continue" | "stop" }) => answer({ data: v }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tsd-routes"] }),
  });
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="font-mono text-[11px] tracking-[0.2em] uppercase">My TSD swaps</h3>
      <ul className="space-y-3">
        {routes.map((r) => {
          const c = swapCoin(r.coin);
          const sym = c?.symbol ?? r.coin;
          const direct = r.coin === "USDC";
          const steps = routeSteps(r.direction as RouteDirection, direct ? "USDC" : sym);
          const at = stepIndex(r.direction as RouteDirection, r.stage === "gas_pending" ? (r.resume_stage ?? "swapping") : r.stage, direct);
          const stopped = ["failed", "refunded", "kept_usdc"].includes(r.stage);
          const buy = r.direction === "buy";
          return (
            <li key={r.id} className="space-y-2 rounded-sm border border-border bg-background p-3 text-xs">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {buy ? `${num(Number(r.amount_in), 2)} TSD → ${sym}` : `${num(Number(r.amount_in))} ${sym} → TSD`}
                </span>
                <span className={`font-mono text-[11px] ${r.stage === "done" ? "text-primary" : stopped ? "text-destructive" : ""}`}>
                  {STAGE_LABEL[r.stage] ?? r.stage}
                </span>
              </div>
              <ol className="flex flex-wrap gap-x-4 gap-y-1">
                {steps.map((s, i) => (
                  <li key={s} className={`flex items-center gap-1.5 ${i < at ? "text-foreground" : "text-muted-foreground"}`}>
                    {i < at ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : i === at && !stopped ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                    {s}
                  </li>
                ))}
              </ol>
              <p className="font-mono text-[11px] text-muted-foreground">
                {r.stage === "done"
                  ? `Got ${num(Number(r.amount_out ?? r.shown_out), buy ? 8 : 2)} ${buy ? sym : "TSD"}`
                  : `Expecting ≈ ${num(Number(r.shown_out), buy ? 8 : 2)} ${buy ? sym : "TSD"}`}
                {" · "}
                {new Date(r.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
              </p>
              {r.error ? <p className="text-[11px] text-muted-foreground">{r.error}</p> : null}
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
      {act.error ? <p role="alert" className="font-mono text-xs text-destructive">{(act.error as Error).message}</p> : null}
    </div>
  );
}
