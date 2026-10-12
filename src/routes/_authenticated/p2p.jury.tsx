import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { listDisputes, resolveDispute, voteDispute } from "@/lib/p2p.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/p2p/jury")({
  head: () => ({
    meta: [
      { title: "Community Jury — Seeds P2P" },
      { name: "description", content: "Experienced Seeds traders review P2P disputes; admins make the final ruling." },
      { property: "og:title", content: "Community Jury — Seeds P2P" },
      { property: "og:description", content: "Community-reviewed P2P disputes on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Jury,
});

function Jury() {
  const qc = useQueryClient();
  const fetch = useServerFn(listDisputes);
  const vote = useServerFn(voteDispute);
  const resolve = useServerFn(resolveDispute);
  const q = useQuery({ queryKey: ["p2p-jury"], queryFn: () => fetch(), refetchInterval: 30_000 });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const done = () => qc.invalidateQueries({ queryKey: ["p2p-jury"] });
  const err = (e: unknown) => toast.error((e as Error).message);
  const v = useMutation({ mutationFn: (x: { id: string; vote: "release" | "refund" }) => vote({ data: { ...x, note: notes[x.id] ?? "" } }), onSuccess: done, onError: err });
  const r = useMutation({ mutationFn: (x: { id: string; outcome: "release" | "refund" }) => resolve({ data: x }), onSuccess: done, onError: err });
  const d = q.data;
  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <Link to="/p2p" className="font-mono text-xs text-muted-foreground hover:text-primary">← Marketplace</Link>
      <h1 className="mt-2 font-display text-3xl font-extrabold">Community jury</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Traders with 3+ completed P2P trades can review disputes and vote. Seeds admins read every vote and make the final ruling.
        You can't vote on your own trades.
      </p>
      {d && !d.eligible ? (
        <p className="mt-6 rounded-sm border border-border bg-surface p-4 text-sm">
          You have {d.completedTrades} completed P2P trade{d.completedTrades === 1 ? "" : "s"}. Finish 3 to join the jury.
        </p>
      ) : null}
      <div className="mt-6 space-y-4">
        {d?.disputes.length === 0 ? <p className="text-sm text-muted-foreground">No open disputes. 🎉</p> : null}
        {d?.disputes.map((x) => (
          <section key={x.id} className="rounded-sm border border-border bg-surface p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div className="font-mono text-sm">
                {x.crypto} {x.asset} for ${x.fiat.toFixed(2)} via {x.method} · seller <b>{x.seller}</b> · buyer <b>{x.buyer}</b>
              </div>
              <div className="font-mono text-xs text-muted-foreground">{x.release} release · {x.refund} cancel</div>
            </div>
            <p className="mt-2 text-sm"><b>Opened by the {x.openedBy}:</b> {x.reason || "no reason given"}</p>
            {x.flagged ? <p className="mt-1 text-sm text-destructive">⚠ {x.flagged}</p> : null}
            {x.chat.length ? (
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-xs text-primary">Read the trade chat ({x.chat.length})</summary>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-sm border border-border bg-background p-3 text-sm">
                  {x.chat.map((m, i) => <p key={i}><b className="font-mono text-xs">{m.who}:</b> {m.body}</p>)}
                </div>
              </details>
            ) : null}
            {d.eligible ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input className="max-w-sm" placeholder="Your reasoning (optional)" value={notes[x.id] ?? ""} onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })} />
                <Button size="sm" variant={x.myVote === "release" ? "default" : "outline"} onClick={() => v.mutate({ id: x.id, vote: "release" })}>Buyer paid — release</Button>
                <Button size="sm" variant={x.myVote === "refund" ? "default" : "outline"} onClick={() => v.mutate({ id: x.id, vote: "refund" })}>Not paid — cancel</Button>
              </div>
            ) : null}
            {d.isAdmin ? (
              <div className="mt-3 border-t border-border pt-3">
                {x.notes.map((n, i) => <p key={i} className="font-mono text-xs text-muted-foreground">{n.vote}: {n.note || "—"}</p>)}
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => { if (confirm("Send the seller's coins to the buyer?")) r.mutate({ id: x.id, outcome: "release" }); }}>Admin: release</Button>
                  <Button size="sm" variant="outline" onClick={() => r.mutate({ id: x.id, outcome: "refund" })}>Admin: cancel</Button>
                  <Link to="/p2p/trade/$id" params={{ id: x.id }} className="self-center font-mono text-xs text-primary">Open trade →</Link>
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
