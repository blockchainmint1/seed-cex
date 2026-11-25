import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { startHypeChainSwap, type quoteHypeChainSwap } from "@/lib/hype-chain/hype-chain.functions";
import { getRelaySwapContext } from "@/lib/relay/relay.functions";
import { RELAY_DEFAULT_SLIPPAGE_BPS, RELAY_SLIPPAGE_CHOICES_BPS } from "@/lib/relay/rules";
import { chainEndSymbol, chainMinimum, chainSteps, hasTonStep, relayIsSecond, relayLegDirection } from "@/lib/hype-chain/rules";

export type HypeChainQuoteResult = Awaited<ReturnType<typeof quoteHypeChainSwap>>;
const fmtNum = (n: number) => (n === 0 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : n.toPrecision(6).replace(/0+$/, ""));

/** Any coin or TSD <-> HYPE in one Telegram tap: through ETH, then Relay (or the reverse). */
export function HypeChainResult({ q, amount, symbol }: { q: HypeChainQuoteResult; amount: string; symbol: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const toHype = relayIsSecond(q.direction);
  const symIn = toHype ? symbol : "HYPE", symOut = toHype ? chainEndSymbol(q.direction) : symbol;
  const [slippage, setSlippage] = useState<number>(RELAY_DEFAULT_SLIPPAGE_BPS * 2);
  const [confirming, setConfirming] = useState(false);
  const fetchCtx = useServerFn(getRelaySwapContext);
  const ctx = useQuery({ queryKey: ["relay-ctx", user?.id ?? null, q.direction], queryFn: () => fetchCtx({ data: { direction: relayLegDirection(q.direction) } }), enabled: Boolean(user), refetchInterval: 60_000 });
  const start = useServerFn(startHypeChainSwap);
  const go = useMutation({
    mutationFn: () => start({ data: { direction: q.direction, via: q.via, coin: q.coin, amount, shownOut: q.out, slippageBps: slippage } }),
    onSuccess: () => { setConfirming(false); void qc.invalidateQueries({ queryKey: ["hype-chains"] }); },
  });
  if (!q.ok) return <p className="rounded-sm border border-border bg-surface p-5 text-sm text-destructive">{q.error}</p>;
  const minOut = chainMinimum(q.out, slippage);
  const steps = chainSteps(q.direction, q.via, symbol).slice(1);
  const blocker = ctx.data?.blocker ?? null;
  const three = hasTonStep(q.direction);
  const keeps = three ? "the ETH or TON" : "the ETH";

  return (
    <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-bold">{symIn} → {symOut} in one tap</h2>
      <ol className="space-y-1 font-mono text-xs">
        {steps.map((s, i) => <li key={s}>Step {i + 1}: {s}{i === 0 ? ` (≈ ${fmtNum(q.mid)} ETH)` : i === 1 && q.ton != null ? ` (≈ ${fmtNum(q.ton)} TON)` : ""}</li>)}
      </ol>
      <p className="text-xs text-muted-foreground">
        {three ? "One Telegram tap covers all three steps. Each step uses only what actually arrived from the step before, and only if the price still meets your minimum. If it doesn't, Seeds stops and the ETH or TON stays in your pocket." : "One Telegram tap covers both steps. Step 2 uses only the ETH that actually arrived, and only if the price still meets your minimum. If it doesn't, Seeds stops and the ETH stays in your pocket."}
      </p>
      {!user ? (
        <p className="text-sm text-muted-foreground"><Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to swap from your trading pocket.</p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Price protection</div>
            <div role="radiogroup" aria-label="Price protection" className="flex flex-wrap gap-2">
              {RELAY_SLIPPAGE_CHOICES_BPS.map((b) => (
                <button key={b} type="button" role="radio" aria-checked={slippage === b} onClick={() => setSlippage(b)}
                  className={`rounded-sm border px-3 py-1.5 text-sm ${slippage === b ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  {b / 100}%
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">If the price falls under <span className="font-semibold text-foreground tabular-nums">{fmtNum(minOut)} {symOut}</span> before the last step, Seeds stops and keeps {keeps} in your pocket.</p>
          </div>
          {blocker ? <p className="rounded-sm border border-warning/50 bg-warning/10 p-3 text-sm">{blocker}</p> : null}
          {go.data ? (
            <p role="status" className="flex items-start gap-2 rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
              <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Check Telegram and tap Approve. Nothing moves until you tap it. Progress shows under My swaps.
            </p>
          ) : null}
          {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}
          <Button type="button" className="w-full bg-action text-action-foreground hover:bg-action/90 disabled:opacity-40"
            disabled={!ctx.data || Boolean(blocker) || go.isPending} onClick={() => { go.reset(); setConfirming(true); }}>
            Swap {symIn} → {symOut}
          </Button>
        </>
      )}
      <Dialog open={confirming} onOpenChange={(o) => { if (!go.isPending) setConfirming(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swap {symIn} → {symOut}?</DialogTitle>
            <DialogDescription>One Approve tap in Telegram covers {three ? "all three steps" : "both steps"}. Nothing moves until you tap it.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <ol className="space-y-1 rounded-sm border border-border p-3 font-mono text-xs">
              {steps.map((s, i) => <li key={s}>{i + 1}. {s}</li>)}
            </ol>
            <Line k="You send" v={`${fmtNum(Number(amount))} ${symIn}`} />
            <Line k="You get about" v={`${fmtNum(q.out)} ${symOut}`} />
            <Line k={three ? "Last step runs only if at least" : "Step 2 runs only if at least"} v={`${fmtNum(minOut)} ${symOut}`} />
            <Line k="Lands in" v="Your own trading pocket" />
            <Line k="Network fees" v={three ? "Paid from your pocket (ETH for the Ethereum step, TON for the TON step)" : "Paid from your pocket (ETH for the Ethereum step)"} />
          </dl>
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
