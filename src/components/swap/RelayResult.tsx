import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { getRelaySwapContext, startRelaySwap, type quoteRelaySwap } from "@/lib/relay/relay.functions";
import { legs, NETWORK_NAME, RELAY_DEFAULT_SLIPPAGE_BPS, RELAY_SLIPPAGE_CHOICES_BPS, SYMBOL, type RelayDirection } from "@/lib/relay/rules";
import { truncateMiddle } from "@/lib/format";

export type RelayQuoteResult = Awaited<ReturnType<typeof quoteRelaySwap>>;

const fmtNum = (n: number) => (n === 0 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : n.toPrecision(6).replace(/0+$/, ""));
const usd = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

/** ETH on Ethereum <-> HYPE on Hyperliquid through Relay, from and back to the member's own pocket. */
export function RelayResult({ q, amount }: { q: RelayQuoteResult; amount: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const direction = q.direction as RelayDirection;
  const { from, to } = legs(direction);
  const [slippage, setSlippage] = useState<number>(RELAY_DEFAULT_SLIPPAGE_BPS);
  const [confirming, setConfirming] = useState(false);
  const fetchCtx = useServerFn(getRelaySwapContext);
  const ctx = useQuery({ queryKey: ["relay-ctx", user?.id ?? null, direction], queryFn: () => fetchCtx({ data: { direction } }), enabled: Boolean(user), refetchInterval: 60_000 });
  const start = useServerFn(startRelaySwap);
  const go = useMutation({
    mutationFn: () => start({ data: { direction, amount, shownOut: q.out, slippageBps: slippage } }),
    onSuccess: () => { setConfirming(false); void qc.invalidateQueries({ queryKey: ["relay-swaps"] }); },
  });
  const minOut = q.out * (1 - slippage / 10_000);
  const c = ctx.data;
  const short = c?.balanceIn != null && Number(amount) > c.balanceIn;

  return (
    <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Relay: {SYMBOL[from]} → {SYMBOL[to]}</h2>
        {c?.pocket ? <span className="font-mono text-[11px] text-muted-foreground">{truncateMiddle(c.pocket, 6, 4)}</span> : null}
      </div>
      <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
        <Cell k="Relay's fee + price gap" v={usd(q.feeUsd)} />
        <Cell k="Usually arrives in" v={q.seconds != null ? `${Math.max(1, Math.round(q.seconds))} seconds` : "a few minutes"} />
        {c && !c.blocker ? <Cell k={`${c.symbolIn} in your pocket`} v={c.balanceIn == null ? "—" : fmtNum(c.balanceIn)} bad={short} /> : null}
      </dl>
      <p className="text-xs text-muted-foreground">
        Relay is an outside bridge. Your pocket pays {SYMBOL[from]} into Relay's deposit contract on {NETWORK_NAME[from]}, and Relay pays {SYMBOL[to]} to the same pocket on {NETWORK_NAME[to]} — or refunds you.
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
            <p className="text-xs text-muted-foreground">If Relay's price falls under <span className="font-semibold text-foreground tabular-nums">{fmtNum(minOut)} {SYMBOL[to]}</span> before sending, Seeds doesn't send.</p>
          </div>
          {c?.blocker ? <p className="rounded-sm border border-warning/50 bg-warning/10 p-3 text-sm">{c.blocker}</p> : null}
          {short && !c?.blocker ? <p className="text-sm text-destructive">Your pocket holds less {SYMBOL[from]} than that.</p> : null}
          {go.data ? (
            <p role="status" className="flex items-start gap-2 rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
              <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Check Telegram and tap Approve. Nothing moves until you tap it. Progress shows under My swaps.
            </p>
          ) : null}
          {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}
          <Button type="button" className="w-full bg-action text-action-foreground hover:bg-action/90 disabled:opacity-40"
            disabled={!c || Boolean(c.blocker) || short || go.isPending} onClick={() => { go.reset(); setConfirming(true); }}>
            Swap {SYMBOL[from]} → {SYMBOL[to]}
          </Button>
        </>
      )}

      <Dialog open={confirming} onOpenChange={(o) => { if (!go.isPending) setConfirming(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swap through Relay?</DialogTitle>
            <DialogDescription>Seeds asks your Telegram for an Approve tap first. Nothing moves until you tap it.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <Line k="You send" v={`${fmtNum(Number(amount))} ${SYMBOL[from]} on ${NETWORK_NAME[from]}`} />
            <Line k="You get about" v={`${fmtNum(q.out)} ${SYMBOL[to]}`} />
            <Line k="Seeds sends only if at least" v={`${fmtNum(minOut)} ${SYMBOL[to]}`} />
            <Line k="Lands in" v={`Your own pocket on ${NETWORK_NAME[to]}`} />
            <Line k="Network fee" v={`Paid in ${SYMBOL[from]} from your pocket`} />
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Before sending, Seeds asks Relay again and checks the deposit pays only your own pocket, for exactly this amount, through Relay's known contract. Then it does a test run.</li>
            <li>Relay is run by a third party. If it can't deliver, it refunds to your pocket.</li>
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

function Cell({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={`tabular-nums ${bad ? "text-destructive" : ""}`}>{v}</dd>
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
