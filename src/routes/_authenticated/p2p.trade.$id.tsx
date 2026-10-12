import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { getP2pTrade, leaveFeedback, p2pAction, resolveDispute, sendP2pMessage } from "@/lib/p2p.functions";
import { STATUS_LABEL } from "@/lib/p2p-config";
import { SellerBadge } from "@/components/p2p/SellerBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/p2p/trade/$id")({
  head: () => ({
    meta: [
      { title: "P2P Trade Room — Seeds" },
      { name: "description", content: "Payment instructions, chat and release for your Seeds peer-to-peer trade." },
      { property: "og:title", content: "P2P Trade Room — Seeds" },
      { property: "og:description", content: "Your peer-to-peer trade on Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TradeRoom,
});

function useCountdown(iso: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function TradeRoom() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fetch = useServerFn(getP2pTrade);
  const act = useServerFn(p2pAction);
  const send = useServerFn(sendP2pMessage);
  const fb = useServerFn(leaveFeedback);
  const resolve = useServerFn(resolveDispute);
  const q = useQuery({ queryKey: ["p2p-trade", id], queryFn: () => fetch({ data: { id } }), refetchInterval: 8000 });
  const refresh = () => qc.invalidateQueries({ queryKey: ["p2p-trade", id] });
  const err = (e: unknown) => toast.error((e as Error).message);
  const action = useMutation({
    mutationFn: (v: { action: "paid" | "cancel" | "release" | "dispute"; reason?: string }) => act({ data: { id, ...v } }),
    onSuccess: refresh, onError: err,
  });
  const [msg, setMsg] = useState("");
  const chat = useMutation({ mutationFn: () => send({ data: { id, body: msg } }), onSuccess: () => { setMsg(""); refresh(); }, onError: err });
  const [comment, setComment] = useState("");
  const feedback = useMutation({ mutationFn: (positive: boolean) => fb({ data: { id, positive, comment } }), onSuccess: refresh, onError: err });
  const rule = useMutation({ mutationFn: (outcome: "release" | "refund") => resolve({ data: { id, outcome } }), onSuccess: refresh, onError: err });
  const t = q.data;
  const left = useCountdown(t?.expiresAt ?? new Date().toISOString());
  if (!t) return <main className="mx-auto max-w-7xl px-5 py-10 text-muted-foreground">{q.error ? (q.error as Error).message : "Loading…"}</main>;

  const buyer = t.role === "buyer";
  const seller = t.role === "seller";
  const ended = t.status === "released" || t.status === "cancelled";

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-10 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <Link to="/p2p/dashboard" className="font-mono text-xs text-muted-foreground hover:text-primary">← My P2P desk</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-extrabold">
            {buyer ? "Buying" : seller ? "Selling" : "Reviewing"} {t.crypto} {t.asset}
          </h1>
          <span className="rounded-sm border border-primary px-2 py-1 font-mono text-xs text-primary uppercase">{STATUS_LABEL[t.status] ?? t.status}</span>
        </div>

        {t.flagged ? (
          <div className="flex gap-2 rounded-sm border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {t.flagged}
          </div>
        ) : null}

        <section className="rounded-sm border border-border bg-surface p-4">
          <SellerBadge handle={t.seller.handle} stats={t.seller.stats} />
          <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm md:grid-cols-4">
            <div><div className="text-[10px] text-muted-foreground uppercase">Buyer pays</div>${t.fiat.toFixed(2)}</div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Seller fee</div>${t.feeFiat.toFixed(2)} ({t.feePct}%)</div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Buyer gets</div>{t.crypto} {t.asset}</div>
            <div><div className="text-[10px] text-muted-foreground uppercase">Via</div>{t.method}</div>
          </div>
        </section>

        {t.status === "open" ? (
          <section className="rounded-sm border border-primary bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-bold tracking-widest uppercase">Payment instructions</h2>
              <span className="font-mono text-lg text-primary">{left}</span>
            </div>
            <pre className="mt-3 whitespace-pre-wrap rounded-sm border border-border bg-background p-3 font-mono text-sm">{t.instructions}</pre>
            <div className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              Memo / reference: <b className="text-foreground">{t.id.slice(0, 8).toUpperCase()}</b>
              <button onClick={() => { navigator.clipboard.writeText(t.id.slice(0, 8).toUpperCase()); toast.success("Copied"); }}><Copy className="h-3 w-3" /></button>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Send exactly <b className="text-foreground">${t.fiat.toFixed(2)}</b> by {t.method} from an account in your own name.</li>
              <li>Tap "I've paid" before the timer runs out.</li>
              <li>The seller checks their account and releases {t.asset} to your wallet.</li>
            </ol>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {buyer && t.status === "open" ? (
            <>
              <Button disabled={action.isPending || Boolean(t.flagged)} onClick={() => action.mutate({ action: "paid" })}>I've paid</Button>
              <Button variant="outline" onClick={() => action.mutate({ action: "cancel" })}>Cancel trade</Button>
            </>
          ) : null}
          {seller && t.status === "open" ? <Button variant="outline" onClick={() => action.mutate({ action: "cancel" })}>Cancel (hurts your score)</Button> : null}
          {seller && (t.status === "paid" || t.status === "open") ? (
            <Button disabled={action.isPending} onClick={() => { if (confirm(`Only release once $${t.fiat.toFixed(2)} is in your account. Release ${t.crypto} ${t.asset}?`)) action.mutate({ action: "release" }); }}>
              {action.isPending ? "Sending…" : `Payment received — release ${t.asset}`}
            </Button>
          ) : null}
          {(t.role !== "admin") && (t.status === "paid" || (seller && t.status === "open")) ? (
            <Button variant="outline" onClick={() => { const r = prompt("What went wrong?"); if (r !== null) action.mutate({ action: "dispute", reason: r }); }}>Open dispute</Button>
          ) : null}
        </div>

        {t.status === "released" && t.releaseTxid ? (
          <p className="break-all font-mono text-xs text-primary">Released · tx {t.releaseTxid}</p>
        ) : null}
        {t.status === "disputed" ? (
          <section className="rounded-sm border border-border bg-surface p-4 text-sm">
            <b>Dispute:</b> {t.disputeReason || "no reason given"}
            <div className="mt-1 font-mono text-xs text-muted-foreground">Jury: {t.votes.release} release · {t.votes.refund} cancel</div>
            {t.isAdmin ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => rule.mutate("release")}>Rule: release to buyer</Button>
                <Button size="sm" variant="outline" onClick={() => rule.mutate("refund")}>Rule: cancel, seller keeps coins</Button>
              </div>
            ) : null}
          </section>
        ) : null}

        {ended && t.role !== "admin" ? (
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-display text-sm font-bold tracking-widest uppercase">Feedback</h2>
            {t.myFeedback ? (
              <p className="mt-2 text-sm text-muted-foreground">Thanks — you left {t.myFeedback.positive ? "👍" : "👎"} feedback.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <Input placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => feedback.mutate(true)}>👍 Good trade</Button>
                  <Button size="sm" variant="outline" onClick={() => feedback.mutate(false)}>👎 Bad trade</Button>
                </div>
              </div>
            )}
          </section>
        ) : null}
        <p className="break-all font-mono text-[11px] text-muted-foreground">Coins go to: {t.buyerAddress}</p>
      </div>

      <section className="flex h-[640px] flex-col rounded-sm border border-border bg-surface">
        <header className="border-b border-border px-4 py-2.5 font-display text-[11px] font-bold tracking-[0.18em] uppercase">
          Chat with {buyer ? t.seller.handle : t.buyer}
        </header>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {t.messages.map((m) => (
            <div key={m.id} className={m.system ? "text-center font-mono text-[11px] text-muted-foreground" : m.mine ? "text-right" : ""}>
              {m.system ? m.body : (
                <span className={`inline-block max-w-[85%] rounded-sm px-3 py-2 text-left text-sm ${m.mine ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                  <span className="block font-mono text-[10px] opacity-70">{m.who}</span>{m.body}
                </span>
              )}
            </div>
          ))}
        </div>
        {!ended ? (
          <form className="flex gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); if (msg.trim()) chat.mutate(); }}>
            <Textarea rows={1} className="min-h-9" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message…" />
            <Button type="submit" disabled={chat.isPending}>Send</Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
