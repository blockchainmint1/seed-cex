import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PROTOCOL_LABEL, SWAP_COINS, type SwapCoin } from "@/lib/xchain/assets";
import { SWAP_LIMITS } from "@/lib/xchain/send-rules";
import { getTsdGasCheck, getTsdRouteQuote, startTsdSwap } from "@/lib/xchain/tsd-route.functions";
import { routeBlocker, routeCoinProblem, routeSteps, SWAPPER_SHORT, type RouteDirection } from "@/lib/xchain/tsd-route";

/** TSD sits in the same coin pickers as every other coin; these are the coins it can swap with. */
export const TSD_BUY_COINS = SWAP_COINS.filter((c) => !routeCoinProblem("buy", c));
export const TSD_SELL_COINS = SWAP_COINS.filter((c) => !routeCoinProblem("sell", c));

export type LinkCtx = { mode: string; hasKey: boolean; pockets: string[] } | null;
export type TsdQuote = Awaited<ReturnType<typeof getTsdRouteQuote>>;

const num = (n: number | null | undefined, d = 8) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
const usd = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }));
const mins = (s: number | null) => (s == null ? "—" : `~${Math.max(1, Math.round(s / 60))} min`);

/** Price card for a swap with TSD on one side (TSD Bridge ↔ USDC ↔ THORChain or Maya), shown in the same spot as the THORChain/Maya cards. */
export function TsdRouteResult({ direction, coin, amount, q, signedIn, link, isAdmin, onStarted }: {
  direction: RouteDirection;
  coin: SwapCoin;
  amount: string;
  q: TsdQuote;
  signedIn: boolean;
  link: LinkCtx;
  isAdmin: boolean;
  onStarted?: () => void;
}) {
  const qc = useQueryClient();
  const [agree, setAgree] = useState(false);
  const start = useServerFn(startTsdSwap);
  const started = useMutation({
    mutationFn: () => start({ data: { direction, coin: coin.id, amount, shownOut: q.ok ? q.out : 0 } }),
    onSuccess: () => onStarted?.(),
    onSettled: () => qc.invalidateQueries({ queryKey: ["tsd-routes"] }),
  });
  const checkGas = useServerFn(getTsdGasCheck);
  const gas = useQuery({
    queryKey: ["tsd-gas", direction, coin.id],
    queryFn: () => checkGas({ data: { direction, coin: coin.id, amount } }),
    enabled: signedIn && q.ok && !q.gasCovered && amount.trim().length > 0,
    retry: false,
    staleTime: 30_000,
  });

  if (!q.ok)
    return (
      <p className="rounded-sm border border-border bg-surface p-5 text-sm text-muted-foreground">
        {q.error}
        {/ethereum/i.test(q.error ?? "") ? " Swaps with TSD pass through USDC on Ethereum, so they wait until it's back." : ""}
        {/paused/i.test(q.error ?? "") ? " The swap network does this on its own for safety, usually for minutes to a few hours. Nothing was sent — try again shortly; the Network status list shows when it's back." : ""}
      </p>
    );

  const outSymbol = direction === "buy" ? coin.symbol : "TSD";
  const swapper = q.protocol ? SWAPPER_SHORT[q.protocol] : "THORChain";
  const altName = q.alt ? SWAPPER_SHORT[q.alt.protocol] : null;
  const blocker = routeBlocker({ direction, coin, link, isAdmin, amountUsd: q.amountUsd, tsdAmount: direction === "buy" ? q.amountIn : q.out });

  return (
    <article className="grid gap-4 rounded-sm border border-primary bg-surface p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold">{coin.id === "USDC" ? "TSD Bridge" : `TSD Bridge + ${q.protocol ? PROTOCOL_LABEL[q.protocol] : "THORChain"}`}</h2>
        <div>
          <p className="font-display text-2xl font-bold tabular-nums">≈ {num(q.out, direction === "buy" ? 8 : 2)} {outSymbol}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            ≈ {usd(q.outUsd)} · in your trading pocket in {mins(q.seconds)} (estimate)
            {q.minOut != null && direction === "buy" && coin.id !== "USDC" ? ` · never less than ${num(q.minOut)} ${coin.symbol}, or USDC back` : ""}
          </p>
          {q.alt && altName ? (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Best of THORChain and Maya. {altName} offered ≈ {num(q.alt.out, direction === "buy" ? 8 : 2)} {outSymbol}; if {swapper} can't take it when the time comes, Seeds uses {altName} instead.
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-xs">
          <dt className="text-muted-foreground">TSD Bridge fee</dt>
          <dd className="text-right tabular-nums">{q.bridgeFeeBps ? `${q.bridgeFeeBps / 100}%` : "None"}</dd>
          {coin.id !== "USDC" ? (
            <>
              <dt className="text-muted-foreground">{swapper} swap cost</dt>
              <dd className="text-right tabular-nums">{usd(q.swapFeeUsd)}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Ethereum network fee</dt>
          <dd className="text-right tabular-nums">
            {q.gasCovered ? "Covered by Seeds" : q.gasEth == null ? "None" : `≈ ${q.gasEth.toFixed(5)} ETH${q.gasUsd != null ? ` (~${usd(q.gasUsd)})` : ""}`}
          </dd>
          <dt className="text-muted-foreground">Seeds fee</dt>
          <dd className="text-right">None</dd>
          <dt className="text-muted-foreground">Arrives in</dt>
          <dd className="text-right tabular-nums">{mins(q.seconds)}</dd>
        </dl>
      </div>
      <ol className="space-y-1.5 border-t border-border pt-3 text-xs md:border-t-0 md:border-l md:pt-0 md:pl-4">
        {routeSteps(direction, coin.id === "USDC" ? "USDC" : coin.symbol, swapper).map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/60 font-mono text-[10px] text-primary">{i + 1}</span>
            {s}
          </li>
        ))}
        <li className="pt-1 text-[11px] text-muted-foreground">USDC passes through your own EVM pocket between steps — Seeds never holds it.</li>
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
            <span className="font-semibold">Started.</span> Follow it below under “My swaps” — we'll also message you on Telegram when it lands.
          </p>
        ) : (
          <>
            {gas.data?.shortEth != null ? (
              <p role="alert" className="rounded-sm border border-warn/60 bg-warn/10 px-3 py-2 text-xs">
                Your EVM pocket needs about {gas.data.shortEth.toFixed(5)} ETH more for the Ethereum network fee
                {gas.data.shortUsd != null ? ` (about ${usd(gas.data.shortUsd)})` : ""}. Send it to your pocket's Ethereum address
                (Account → Balances → Deposit), then start the swap — nothing has been sent yet.
              </p>
            ) : gas.data?.haveEth != null && gas.data.needEth != null ? (
              <p className="text-[11px] text-muted-foreground">Funds verified — your pocket can pay the Ethereum network fee.</p>
            ) : gas.isError ? (
              <p className="text-[11px] text-muted-foreground">
                We couldn't check your pocket's Ethereum fee just now. The swap checks it again before anything is sent, so nothing can leave without the fee.
              </p>
            ) : null}
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-primary" />
              <span>
                I understand blockchain sends can't be undone, and the final amount can differ a little from this price (Seeds asks me
                again if it moves more than 2%). Test limits: ${SWAP_LIMITS.perSwapUsd.toLocaleString("en-US")} per swap, ${SWAP_LIMITS.dailyUsd.toLocaleString("en-US")} a day.
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
    </article>
  );
}
