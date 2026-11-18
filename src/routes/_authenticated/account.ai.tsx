import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Pencil, Play, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { editMyAiPlan, getMyAiPlans, updateMyAiPlan, type MyAiPlan } from "@/lib/ai/ai.functions";
import { aiCoinsQuery } from "@/lib/ai/market";
import { basketTargets } from "@/lib/ai/plan";
import { LOCK_LIMITS } from "@/lib/ai/lock-rules";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, Note, TabTitle, fieldLabel, inputCls } from "@/components/account/ui";

export const Route = createFileRoute("/_authenticated/account/ai")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "AI strategies — Seeds" },
      { name: "description", content: "See, edit, pause, resume or end your locked Seeds AI plans, switch daily Telegram checks and read each day's plan check." },
      { property: "og:title", content: "AI strategies — Seeds" },
      { property: "og:description", content: "Manage your locked Seeds AI trading plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiTab,
});

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const STATUS: Record<string, { label: string; cls: string }> = {
  locked: { label: "Live", cls: "bg-primary/15 text-primary" },
  paused: { label: "Paused", cls: "bg-warn/15 text-foreground" },
  ended: { label: "Ended", cls: "bg-muted text-muted-foreground" },
};

function AiTab() {
  const qc = useQueryClient();
  const fetchPlans = useServerFn(getMyAiPlans);
  const update = useServerFn(updateMyAiPlan);
  const edit = useServerFn(editMyAiPlan);
  const q = useQuery({ queryKey: ["ai-my-plans"], queryFn: () => fetchPlans() });
  const coins = useQuery(aiCoinsQuery);
  const symbol = (id: string) => (id === "tsd" ? "TSD" : coins.data?.find((c) => c.id === id)?.symbol.toUpperCase() ?? id);
  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-my-plans"] });
  const status = useMutation({ mutationFn: (v: { id: string; status?: "locked" | "paused" | "ended"; telegramDaily?: boolean }) => update({ data: v }), onSuccess: refresh });
  const [editing, setEditing] = useState<MyAiPlan | null>(null);
  const [ending, setEnding] = useState<MyAiPlan | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  const plans = q.data?.plans ?? [];
  const current = plans.filter((p) => p.status !== "ended");
  const ended = plans.filter((p) => p.status === "ended");
  const live = plans.filter((p) => p.status === "locked");

  return (
    <div className="space-y-5">
      <TabTitle
        title="AI strategies"
        desc="Your locked plans. Every day Seeds runs each live plan on fresh prices and tells you what it would do."
        right={<Button asChild size="sm"><Link to="/ai"><Sparkles /> Test a new plan</Link></Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Mini label="Live plans" value={`${live.length} of ${LOCK_LIMITS.maxActivePlans}`} />
        <Mini label="TSD committed (live)" value={live.reduce((s, p) => s + p.commitTsd, 0).toLocaleString("en-US")} />
        <Mini label="Buying" value={q.data?.executionEnabled ? "On" : "Paper only"} />
      </div>

      {q.data && !q.data.executionEnabled ? (
        <Note tone="info"><b>Plans run on paper for now.</b> Seeds sends the daily check but doesn't buy or sell yet — that switches on after real-money tests and the auditor's review.</Note>
      ) : null}
      {q.data && !q.data.telegramLinked ? (
        <Note tone="warn">Telegram isn't connected, so daily checks only show here. <Link to="/account/alerts" className="font-semibold text-primary underline">Connect Telegram</Link>.</Note>
      ) : null}
      {status.error ? <Note tone="error">{(status.error as Error).message}</Note> : null}

      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Loading your plans…</p>
      ) : q.error ? (
        <Note tone="error">{(q.error as Error).message}</Note>
      ) : !current.length ? (
        <Card>
          <p className="text-sm text-muted-foreground">No live plans. Try a basket or momentum rule on real price history, then lock it in.</p>
          <Button asChild className="mt-3"><Link to="/ai"><Sparkles /> Open Seeds AI</Link></Button>
        </Card>
      ) : (
        current.map((p) => <PlanCard key={p.id} p={p} symbol={symbol} busy={status.isPending}
          onStatus={(s) => status.mutate({ id: p.id, status: s })}
          onTelegram={() => status.mutate({ id: p.id, telegramDaily: !p.telegramDaily })}
          onEdit={() => setEditing(p)} onEnd={() => setEnding(p)} />)
      )}

      {ended.length ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowEnded((v) => !v)}>{showEnded ? "Hide" : "Show"} ended plans ({ended.length})</Button>
          {showEnded ? <div className="mt-3 space-y-3">{ended.map((p) => <PlanCard key={p.id} p={p} symbol={symbol} busy />)}</div> : null}
        </div>
      ) : null}

      <EditDialog plan={editing} maxCommit={q.data?.limits.maxCommitTsd} onClose={() => setEditing(null)}
        onSave={async (v) => { await edit({ data: v }); await refresh(); setEditing(null); }} />

      <AlertDialog open={Boolean(ending)} onOpenChange={(o) => { if (!o) setEnding(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End “{ending?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Daily checks stop for good and the plan can't be restarted. To stop for a while, pause it instead.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (ending) status.mutate({ id: ending.id, status: "ended" }); setEnding(null); }}>End plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
      <p className="num mt-1 font-display text-lg font-bold">{value}</p>
    </div>
  );
}

function rulesOf(p: MyAiPlan, symbol: (id: string) => string): [string, string][] {
  const s = p.settings;
  const out: [string, string][] = [];
  if (s.mode === "momentum") {
    out.push(["Rule", `Hold the strongest ${s.topK} by ${s.lookback}-day return`]);
    out.push(["Trend filter", s.trendMA ? `Skip coins below their ${s.trendMA}-day average` : "Off"]);
    out.push(["Max per coin", `${s.cap}%`]);
  } else {
    const t = basketTargets(s);
    out.push(["Shares", s.coins.map((c) => `${symbol(c)} ${Math.round((t[c] ?? 0) * 1000) / 10}%`).join(" · ")]);
    out.push(["Rebalance band", s.drift ? `Only when a coin is ${s.drift} points off` : "Every check"]);
  }
  out.push(["Checks", s.rebalance === "daily" ? "Daily" : s.rebalance === "weekly" ? "Weekly (Mondays)" : "Monthly"]);
  out.push(["Stop-loss", s.stopLoss ? `Sell to TSD after a ${s.stopLoss}% drop from the high` : "Off"]);
  out.push(["TSD reserve", s.reserve ? `${s.reserve}% always in TSD` : "None"]);
  out.push(["Trading cost", `${(s.feeBps / 100).toFixed(2)}%`]);
  return out;
}

function PlanCard({ p, symbol, busy, onStatus, onTelegram, onEdit, onEnd }: {
  p: MyAiPlan; symbol: (id: string) => string; busy: boolean;
  onStatus?: (s: "locked" | "paused") => void; onTelegram?: () => void; onEdit?: () => void; onEnd?: () => void;
}) {
  const [history, setHistory] = useState(false);
  const st = STATUS[p.status] ?? STATUS.ended!;
  const open = p.status !== "ended";
  return (
    <Card
      title={<span className="flex flex-wrap items-center gap-2">{p.name}<span className={`rounded-sm px-2 py-0.5 font-mono text-[10px] uppercase ${st.cls}`}>{st.label}</span></span>}
      desc={`${p.commitTsd.toLocaleString("en-US")} TSD · ${p.settings.mode === "momentum" ? "Follow the strongest" : "Basket"} · ${p.settings.coins.map(symbol).join(", ")} · locked ${p.lockedAt.slice(0, 10)}`}
    >
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rulesOf(p, symbol).map(([k, v]) => (
          <div key={k} className="flex gap-2"><dt className="w-32 shrink-0 text-muted-foreground">{k}</dt><dd className="min-w-0">{v}</dd></div>
        ))}
      </dl>
      <div className="mt-4">
        <p className={fieldLabel}>Latest check{p.lastCheck ? ` · ${p.lastCheck.day}` : ""}</p>
        {p.lastCheck ? (
          <pre className="mt-1 rounded-sm bg-background/60 p-3 font-sans text-sm whitespace-pre-wrap">{plain(p.lastCheck.message)}</pre>
        ) : <p className="mt-1 text-xs text-muted-foreground">The first check runs at the next scheduled time.</p>}
        {p.history.length > 1 ? (
          <>
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => setHistory((v) => !v)}>{history ? "Hide" : "Show"} earlier checks ({p.history.length - 1})</Button>
            {history ? (
              <ul className="mt-2 space-y-2">
                {p.history.slice(1).map((h) => (
                  <li key={h.day} className="rounded-sm border border-border p-3 text-sm">
                    <span className="font-mono text-[11px] text-muted-foreground">{h.day}{h.sentAt ? " · sent to Telegram" : ""}</span>
                    <p className="mt-1 whitespace-pre-wrap">{plain(h.message)}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      {open && onStatus ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onStatus(p.status === "locked" ? "paused" : "locked")}>
            {p.status === "locked" ? <><Pause /> Pause</> : <><Play /> Resume</>}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil /> Edit name & amount</Button>
          <Button asChild size="sm" variant="outline"><Link to="/ai" search={{ plan: p.id, edit: true }}><SlidersHorizontal /> Change rules</Link></Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onTelegram}>Telegram daily: {p.telegramDaily ? "on" : "off"}</Button>
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={onEnd}><Trash2 /> End plan</Button>
        </div>
      ) : null}
    </Card>
  );
}

function EditDialog({ plan, maxCommit, onClose, onSave }: {
  plan: MyAiPlan | null; maxCommit?: number; onClose: () => void;
  onSave: (v: { id: string; name: string; commitTsd: number }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [commit, setCommit] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [forId, setForId] = useState<string | null>(null);
  if (plan && forId !== plan.id) { setForId(plan.id); setName(plan.name); setCommit(String(plan.commitTsd)); setErr(null); }
  return (
    <Dialog open={Boolean(plan)} onOpenChange={(o) => { if (!o) { setForId(null); onClose(); } }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Edit plan</DialogTitle>
          <DialogDescription>To change coins or rules, use “Change rules” — it opens the plan in the tester so you can see the result first.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault(); if (!plan) return;
          setSaving(true); setErr(null);
          try { await onSave({ id: plan.id, name, commitTsd: Number(commit) }); setForId(null); } catch (x) { setErr(x instanceof Error ? x.message : "Couldn't save."); } finally { setSaving(false); }
        }}>
          <label className="block">
            <span className={fieldLabel}>Plan name</span>
            <input className={`${inputCls} mt-1`} maxLength={LOCK_LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Commit (TSD)</span>
            <input className={`${inputCls} mt-1`} type="number" min={LOCK_LIMITS.minCommitTsd} max={maxCommit} value={commit} onChange={(e) => setCommit(e.target.value)} />
            <span className="mt-1 block text-xs text-muted-foreground">{LOCK_LIMITS.minCommitTsd}–{(maxCommit ?? 1000).toLocaleString("en-US")} TSD.</span>
          </label>
          {err ? <Note tone="error">{err}</Note> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => { setForId(null); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
