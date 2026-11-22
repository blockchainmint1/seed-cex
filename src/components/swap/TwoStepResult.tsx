import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { PROTOCOL_LABEL } from "@/lib/xchain/assets";
import { getDexSwapContext } from "@/lib/dex/dex.functions";
import { DEFAULT_SLIPPAGE_BPS, SLIPPAGE_CHOICES_BPS } from "@/lib/dex/swap-rules";
import { DEX_NETWORKS, NATIVE } from "@/lib/dex/venues";
import { agreedMinimum } from "@/lib/swap/plan";
import { FIRST_HOP_TOLERANCE } from "@/lib/two-step/rules";
import { startTwoStepSwap, type quoteTwoStepSwap } from "@/lib/two-step/two-step.functions";

export type TwoStepQuoteResult = Awaited<ReturnType<typeof quoteTwoStepSwap>>;

const fmtNum = (n: number) =>
  n === 0 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 6 }) : n.toPrecision(6).replace(/0+$/, "");
const usd = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toPrecision(3)}`;

/** A swap Seeds does in two hops with one Telegram tap: what each hop does, the minimum, and the start button. */
export function TwoStepResult({ q, amount, symbolIn, symbolOut }: { q: TwoStepQuoteResult; amount: string; symbolIn: string; symbolOut: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [confirming, setConfirming] = useState(false);
  const net = DEX_NETWORKS[q.network];
  const first = q.direction === "dex_then_x";
  const fetchCtx = useServerFn(getDexSwapContext);
  const ctx = useQuery({
    queryKey: ["dex-ctx", user?.id ?? null, q.network, first ? q.token.address : NATIVE],
    queryFn: () => fetchCtx({ data: { network: q.network, tokenIn: first ? q.token.address : NATIVE } }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const start = useServerFn(startTwoStepSwap);
  const go = useMutation({
    mutationFn: () => start({ data: { direction: q.direction, network: q.network, token: q.token.address, coin: q.coin, amount, shownOut: q.out, slippageBps: slippage } }),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["two-step-swaps"] });
    },
  });
  if (!q.ok || !q.mid || !q.protocol) return null;
  const swapper = PROTOCOL_LABEL[q.protocol];
  const pool = `${q.venueName ?? "Pool"} on ${net.name}`;
  const hop1 = first ? `${pool}: ${symbolIn} → ${q.mid.symbol}` : `${swapper}: ${symbolIn} → ${q.mid.symbol}`;
  const hop2 = first ? `${swapper}: ${q.mid.symbol} → ${symbolOut}` : `${pool}: ${q.mid.symbol} → ${symbolOut}`;
  const minOut = agreedMinimum(q.out, slippage);
  const c = ctx.data;
  const short = first && c?.balanceIn != null && Number(amount) > c.balanceIn;
  const blocked = c?.blocker ?? null;

  return (
    <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-bold">Two steps, one tap</h2>
        <p className="text-sm text-muted-foreground">
          No single network trades {symbolIn} for {symbolOut}, so Seeds does it in two swaps through {q.mid.symbol} — both from and back into your own trading pocket.
        </p>
      </div>
      <ol className="space-y-2 font-mono text-xs">
        <li className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
          <span><span className="text-muted-foreground">1 ·</span> {hop1}</span>
          <span className="tabular-nums">≈ {fmtNum(q.midOut)} {q.mid.symbol}</span>
        </li>
        <li className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
          <span><span className="text-muted-foreground">2 ·</span> {hop2}</span>
          <span className="tabular-nums">≈ {fmtNum(q.out)} {symbolOut}</span>
        </li>
      </ol>
      <dl className="grid gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-2">
        <div className="flex justify-between"><dt className="text-muted-foreground">Value in</dt><dd>{usd(q.amountUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Value out</dt><dd>{usd(q.outUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">{swapper} fees</dt><dd>{usd(q.swapFeeUsd)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Takes about</dt><dd>{q.seconds ? `${Math.max(2, Math.round(q.seconds / 60))} min` : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Network fee</dt><dd>{net.nativeSymbol} from your pocket</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">Seeds fee</dt><dd>None</dd></div>
      </dl>
      {q.others.length ? (
        <p className="text-[11px] text-muted-foreground">
          Also checked: {q.others.map((o) => `via ${o.mid} on ${PROTOCOL_LABEL[o.protocol]} ≈ ${fmtNum(o.out)}`).join(" · ")}
        </p>
      ) : null}
      {q.risk && q.risk.level !== "ok" ? (
        <p className={`rounded-sm border p-3 text-sm ${q.risk.level === "danger" ? "border-destructive/50 bg-destructive/10" : "border-warning/50 bg-warning/10"}`}>
          {q.risk.level === "danger" ? "High risk: " : "Be careful: "}{q.risk.reasons[0]}
        </p>
      ) : null}

      {!user ? (
        <p className="text-sm text-muted-foreground">
          <Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to swap from your trading pocket.
        </p>
      ) : (
        <>
          {c && first && !blocked ? (
            <p className="font-mono text-xs text-muted-foreground">
              In your pocket: <span className={short ? "text-destructive" : "text-foreground"}>{c.balanceIn == null ? "—" : fmtNum(c.balanceIn)} {symbolIn}</span>
              {" · "}{c.nativeBalance == null ? "—" : fmtNum(c.nativeBalance)} {c.nativeSymbol} for fees
            </p>
          ) : null}
          {c && !first && !blocked ? (
            <p className="font-mono text-xs text-muted-foreground">
              Step 2 runs on {net.name}, so its {net.nativeSymbol} fee comes from your pocket — you have {c.nativeBalance == null ? "—" : fmtNum(c.nativeBalance)} {c.nativeSymbol}.
            </p>
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
                  {b / 100}%
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              You get at least <span className="font-semibold text-foreground tabular-nums">{fmtNum(minOut)} {symbolOut}</span>. If prices fall below that before step 2, Seeds stops and the {q.mid.symbol} stays in your pocket.
            </p>
          </div>
          {blocked ? <p className="rounded-sm border border-warning/50 bg-warning/10 p-3 text-sm">{blocked}</p> : null}
          {short && !blocked ? <p className="text-sm text-destructive">Your pocket holds less {symbolIn} than that.</p> : null}
          {go.data ? (
            <p role="status" className="flex items-start gap-2 rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
              <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Check Telegram and tap Approve. One tap covers both steps, and nothing moves until you tap it. Progress shows under My swaps.
            </p>
          ) : null}
          {go.error && !confirming ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}
          <Button
            type="button"
            className="w-full bg-action text-action-foreground hover:bg-action/90 disabled:opacity-40"
            disabled={!c || Boolean(blocked) || short || go.isPending || Boolean(go.data)}
            onClick={() => { go.reset(); setConfirming(true); }}
          >
            Swap {symbolIn} → {symbolOut} in two steps
          </Button>
        </>
      )}

      <Dialog open={confirming} onOpenChange={(o) => { if (!go.isPending) setConfirming(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swap in two steps?</DialogTitle>
            <DialogDescription>Seeds asks your Telegram for one Approve tap first. Nothing moves until you tap it.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <Line k="You send" v={`${fmtNum(Number(amount))} ${symbolIn}`} />
            <Line k="You get about" v={`${fmtNum(q.out)} ${symbolOut}`} />
            <Line k="At least" v={`${fmtNum(minOut)} ${symbolOut}`} />
            <Line k="Step 1" v={hop1} />
            <Line k="Step 2" v={hop2} />
            <Line k="Lands in" v="Your own trading pocket" />
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Right after your tap Seeds checks the price again. If step 1 would pay more than {FIRST_HOP_TOLERANCE * 100}% less {q.mid.symbol} than shown, nothing is sent.</li>
            <li>Step 2 uses only the {q.mid.symbol} that actually arrived. If its fresh price misses your minimum, Seeds stops and the {q.mid.symbol} stays in your pocket for you to use.</li>
            <li>The pool gets permission to spend exactly the amount swapped, never more.</li>
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
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
