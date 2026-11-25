import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { getTonSwapContext, getTonSwaps, startTonUsdtSwap, type quoteTonUsdt } from "@/lib/ston/ston.functions";
import { truncateMiddle } from "@/lib/format";

export type TonUsdtQuote = Awaited<ReturnType<typeof quoteTonUsdt>>;

const fmt = (n: number | null | undefined, d = 6) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
const STATUS: Record<string, string> = { signing: "Sending", sent: "Waiting for STON.fi", unknown: "Checking", done: "Done", refunded: "TON returned", failed: "Not sent" };

/** TON -> USD₮ on TON through STON.fi, from and back to the member's own TON pocket. */
export function TonUsdtResult({ q, amount, onSent }: { q: TonUsdtQuote; amount: string; onSent?: () => void }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const fetchCtx = useServerFn(getTonSwapContext);
  const fetchList = useServerFn(getTonSwaps);
  const ctx = useQuery({ queryKey: ["ton-swap-ctx", user?.id ?? null], queryFn: () => fetchCtx(), enabled: Boolean(user), refetchInterval: 60_000 });
  const list = useQuery({ queryKey: ["ton-swaps", user?.id ?? null], queryFn: () => fetchList(), enabled: Boolean(user), refetchInterval: 15_000 });
  const start = useServerFn(startTonUsdtSwap);
  const go = useMutation({
    mutationFn: () => start({ data: { amount, shownOutUnits: q.outUnits } }),
    onSuccess: () => { setConfirming(false); onSent?.(); if (typeof window !== "undefined") document.getElementById("my-swaps")?.scrollIntoView({ behavior: "smooth", block: "start" }); void qc.invalidateQueries({ queryKey: ["ton-swaps"] }); void qc.invalidateQueries({ queryKey: ["ton-swap-ctx"] }); },
  });
  const c = ctx.data;
  const short = c?.balanceTon != null && Number(amount) + q.networkTon > c.balanceTon;

  return (
    <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">STON.fi: TON → USD₮ on TON</h2>
        {c?.pocket ? <span className="font-mono text-[11px] text-muted-foreground">{truncateMiddle(c.pocket, 6, 4)}</span> : null}
      </div>
      <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
        <Cell k="You get about" v={`${fmt(q.out, 4)} USD₮`} />
        <Cell k="At least (1% protection)" v={`${fmt(q.minOut, 4)} USD₮`} />
        <Cell k="Network fees (TON, most comes back)" v={`about ${fmt(q.networkTon, 3)} TON`} />
        {c && !c.blocker ? <Cell k="TON in your pocket" v={fmt(c.balanceTon)} bad={short} /> : null}
        {c && !c.blocker ? <Cell k="USD₮ on TON in your pocket" v={fmt(c.balanceUsdt, 2)} /> : null}
      </dl>
      <p className="text-xs text-muted-foreground">
        STON.fi is TON's biggest exchange. Your TON pocket sends TON to STON.fi's pool and the pool pays Tether's USD₮ back to the same pocket — or returns your TON if the price slips past your minimum. Coins never leave your own pocket for anyone else.
      </p>
      {!user ? (
        <p className="text-sm text-muted-foreground"><Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to swap from your trading pocket.</p>
      ) : c?.blocker ? (
        <p className="text-sm text-muted-foreground">{c.blocker}</p>
      ) : confirming ? (
        <div className="space-y-2 rounded-sm border border-border p-3">
          <p className="text-sm">Swap {amount} TON for at least {fmt(q.minOut, 4)} USD₮ on TON? This starts right away.</p>
          <div className="flex gap-2">
            <Button type="button" className="bg-action text-action-foreground hover:bg-action/90" disabled={go.isPending} onClick={() => go.mutate()}>{go.isPending ? "Sending…" : "Yes, swap"}</Button>
            <Button variant="outline" disabled={go.isPending} onClick={() => setConfirming(false)}>Not now</Button>
          </div>
        </div>
      ) : (
        <Button type="button" className="bg-action text-action-foreground hover:bg-action/90 disabled:opacity-40" disabled={short || !c} onClick={() => setConfirming(true)}>{short ? "Not enough TON" : "Swap TON to USD₮"}</Button>
      )}
      {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}
      {list.data?.swaps.length ? (
        <div className="space-y-1">
          <div className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Your TON swaps</div>
          <ul className="space-y-1 font-mono text-xs">
            {list.data.swaps.slice(0, 5).map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2">
                <span>{fmt(s.ton)} TON → {s.gotUsdt != null ? `${fmt(s.gotUsdt, 4)}` : `≥ ${fmt(s.minUsdt, 4)}`} USD₮</span>
                <span className={s.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {STATUS[s.status] ?? s.status}
                  {s.txid ? <> · <a className="text-primary underline" href={`https://tonviewer.com/transaction/${s.txid}`} target="_blank" rel="noreferrer">view</a></> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Cell({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/60 pb-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={bad ? "text-destructive" : ""}>{v}</dd>
    </div>
  );
}
