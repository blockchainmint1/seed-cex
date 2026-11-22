import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ExternalLink, Send, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { DEFAULT_SLIPPAGE_BPS, isTsdDex, SLIPPAGE_CHOICES_BPS } from "@/lib/dex/swap-rules";
import { getDexSwapContext, type quoteDexSwap, startDexSwap } from "@/lib/dex/dex.functions";
import { DEX_NETWORKS, isNative, type DexNetwork } from "@/lib/dex/venues";
import { displaySymbol } from "@/lib/dex/starters";
import { getChain } from "@/lib/chains";
import { truncateMiddle } from "@/lib/format";

/** A coin on one pool network (Uniswap / PancakeSwap / PulseX). */
export type DexCoin = { address: string; symbol: string; name: string };
export type DexQuoteResult = Awaited<ReturnType<typeof quoteDexSwap>>;

const fmtNum = (n: number) =>
  n === 0 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 6 }) : n.toPrecision(6).replace(/0+$/, "");
const usd = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toPrecision(3)}`;

const pct = (bps: number) => `${bps / 100}%`;

/** Swap from the member's own pocket: shows what's there, price protection, and the Telegram step. */
export function PocketSwap({ d, network, from, to, amount }: { d: Awaited<ReturnType<typeof quoteDexSwap>>; network: DexNetwork; from: DexCoin; to: DexCoin; amount: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [confirming, setConfirming] = useState(false);
  const fetchCtx = useServerFn(getDexSwapContext);
  const ctx = useQuery({
    queryKey: ["dex-ctx", user?.id ?? null, network, from.address],
    queryFn: () => fetchCtx({ data: { network, tokenIn: from.address } }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const start = useServerFn(startDexSwap);
  const go = useMutation({
    mutationFn: () => start({ data: { network, tokenIn: from.address, tokenOut: to.address, amount, shownOut: d.best!.amountOut, slippageBps: slippage } }),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["dex-swaps"] });
    },
  });
  const fromSym = displaySymbol(network, from.address, from.symbol);
  const toSym = displaySymbol(network, to.address, to.symbol);
  const def = DEX_NETWORKS[network];

  if (!user) {
    return (
      <p className="rounded-sm border border-border bg-surface p-4 text-sm text-muted-foreground">
        <Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to swap from your trading pocket.
      </p>
    );
  }
  if (!d.best) return null;
  const c = ctx.data;
  const minOut = d.best.amountOut * (1 - slippage / 10_000);
  const short = c?.balanceIn != null && Number(amount) > c.balanceIn;
  const blocked = c?.blocker ?? null;

  return (
    <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Swap from my pocket</h2>
        {c?.pocket ? <span className="font-mono text-[11px] text-muted-foreground">{truncateMiddle(c.pocket, 6, 4)}</span> : null}
      </div>
      {c && !blocked ? (
        <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
            <dt className="text-muted-foreground">{fromSym} in your pocket</dt>
            <dd className={`tabular-nums ${short ? "text-destructive" : ""}`}>{c.balanceIn == null ? "—" : fmtNum(c.balanceIn)}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
            <dt className="text-muted-foreground">{c.nativeSymbol} for fees</dt>
            <dd className="tabular-nums">{c.nativeBalance == null ? "—" : fmtNum(c.nativeBalance)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="space-y-2">
        <div className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Price protection</div>
        <div role="radiogroup" aria-label="Price protection" className="flex flex-wrap gap-2">
          {SLIPPAGE_CHOICES_BPS.map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={slippage === b}
              onClick={() => setSlippage(b)}
              className={`rounded-sm border px-3 py-1.5 text-sm ${slippage === b ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {pct(b)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          You get at least <span className="font-semibold text-foreground tabular-nums">{fmtNum(minOut)} {toSym}</span>, or the swap cancels itself and your coins stay put.
          {slippage >= 300 ? " Coins with a built-in tax may need 3–10%." : ""}
        </p>
      </div>

      {blocked ? <p className="rounded-sm border border-warning/50 bg-warning/10 p-3 text-sm">{blocked}</p> : null}
      {short && !blocked ? <p className="text-sm text-destructive">Your pocket holds less {fromSym} than that.</p> : null}
      {go.data ? (
        <p role="status" className="flex items-start gap-2 rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Check Telegram and tap Approve. The request ends in 15 minutes, and nothing moves until you tap it. Progress shows under My swaps.
        </p>
      ) : null}
      {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}

      <Button
        type="button"
        className="w-full bg-action text-action-foreground hover:bg-action/90 disabled:opacity-40"
        disabled={!c || Boolean(blocked) || short || go.isPending}
        onClick={() => { go.reset(); setConfirming(true); }}
      >
        Swap {fromSym} → {toSym}
      </Button>

      <Dialog open={confirming} onOpenChange={(o) => { if (!go.isPending) setConfirming(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swap from your pocket?</DialogTitle>
            <DialogDescription>Seeds asks your Telegram for an Approve tap first. Nothing moves until you tap it.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <Line k="You send" v={`${fmtNum(Number(amount))} ${fromSym}`} />
            <Line k="You get about" v={`${fmtNum(d.best.amountOut)} ${toSym}`} />
            <Line k="At least" v={`${fmtNum(minOut)} ${toSym}`} />
            <Line k="Through" v={`${d.best.venueName} on ${def.name}${d.tsd ? " + TSD Bridge" : ""}`} />
            <Line k="Lands in" v="Your own trading pocket" />
            <Line k="Network fee" v={`Paid in ${def.nativeSymbol} from your pocket`} />
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {d.tsd ? (
              <li>
                {d.tsd.side === "buy"
                  ? `TSD Bridge first turns your TSD into about ${fmtNum(d.tsd.usdc)} USDC in your own pocket (fee ${d.tsd.bridgeFeeBps / 100}%). If the pool price moves more than 2% meanwhile, Seeds stops and you keep the USDC.`
                  : `The pool swaps to about ${fmtNum(d.tsd.usdc)} USDC in your pocket, then TSD Bridge issues TSD for it (fee ${d.tsd.bridgeFeeBps / 100}%).`}
              </li>
            ) : null}
            <li>The pool gets permission to spend exactly this amount, never more. Tokens need one extra small network fee for that the first time.</li>
            <li>Before sending, Seeds checks the price again and does a test run. If either fails, nothing is swapped.</li>
            {d.risk.level !== "ok" ? <li className="text-destructive">{d.risk.level === "danger" ? "High risk:" : "Be careful:"} {d.risk.reasons[0]}</li> : null}
          </ul>
          {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={go.isPending} onClick={() => setConfirming(false)}>Not now</Button>
            <Button type="button" className="bg-action text-action-foreground hover:bg-action/90" disabled={go.isPending} onClick={() => go.mutate()}>
              {go.isPending ? "Checking the price…" : "Send to Telegram for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

export function QuoteDetails({ d, network, from, to }: { d: Awaited<ReturnType<typeof quoteDexSwap>>; network: DexNetwork; from: DexCoin; to: DexCoin }) {
  const tone =
    d.risk.level === "danger" ? "border-destructive/50 bg-destructive/10" : d.risk.level === "caution" ? "border-warning/50 bg-warning/10" : "border-primary/40 bg-primary/10";
  const title = d.risk.level === "danger" ? "High risk" : d.risk.level === "caution" ? "Be careful" : "Looks normal";
  const fromSym = displaySymbol(network, from.address, from.symbol);
  const toSym = displaySymbol(network, to.address, to.symbol);
  const explorer = getChain(network).explorer;
  return (
    <div className="space-y-4">
      {d.best ? (
        <div className="rounded-sm border border-border bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Best price: {d.best.venueName}</h2>
            <span className="font-mono text-[11px] text-muted-foreground">{d.best.via ? `through ${d.best.via}` : "direct pool"}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            1 {fromSym} ≈ {fmtNum(d.best.amountOut / d.amountIn)} {toSym}
          </p>
          {d.others.length ? (
            <ul className="mt-3 space-y-1 border-t border-border pt-3 font-mono text-xs">
              {d.others.map((o) => (
                <li key={o.venueName} className="flex justify-between gap-3 text-muted-foreground">
                  <span>{o.venueName}{o.hops > 1 ? " · 2 steps" : ""}</span>
                  <span className="tabular-nums">{fmtNum(o.amountOut)} {toSym}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={`rounded-sm border p-5 ${tone}`} role="status">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          {d.risk.level === "ok" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <AlertTriangle className={`h-4 w-4 ${d.risk.level === "danger" ? "text-destructive" : "text-warning"}`} />}
          {title}
        </div>
        {d.roundTripLoss !== null ? (
          <p className="mb-2 text-sm">
            Sell-back check: selling straight back would return about {Math.round((1 - d.roundTripLoss) * 1000) / 10}% of what you put in.
          </p>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {d.risk.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>

      <div className="grid gap-2 font-mono text-[11px] sm:grid-cols-2">
        {[from, to].filter((c) => !isNative(c.address) && !isTsdDex(c.address)).map((c) => (
          <a key={c.address} href={`${explorer}${c.address}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-primary hover:underline">
            <span className="shrink-0">{displaySymbol(network, c.address, c.symbol)} contract</span>
            <span className="truncate">{c.address}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

