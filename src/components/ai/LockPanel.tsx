import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Pencil, Zap } from "lucide-react";
import { editMyAiPlan, lockAiPlan } from "@/lib/ai/ai.functions";
import type { PlanSettings } from "@/lib/ai/plan";
import { inputCls } from "./ui";

export type EditingPlan = { id: string; name: string; commitTsd: number };

export function LockPanel({ settings, signedIn, editing, onStopEditing }: {
  settings: PlanSettings;
  signedIn: boolean;
  editing?: EditingPlan | null;
  onStopEditing?: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const lock = useServerFn(lockAiPlan);
  const edit = useServerFn(editMyAiPlan);
  const [name, setName] = useState("");
  const [commit, setCommit] = useState<string>("");
  const [telegram, setTelegram] = useState(true);
  useEffect(() => {
    if (editing) { setName(editing.name); setCommit(String(editing.commitTsd)); }
  }, [editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = commit === "" ? settings.amount : Number(commit);
  const m = useMutation({
    mutationFn: () => lock({ data: { name, commitTsd: amount, settings: settings as unknown as Record<string, unknown>, telegramDaily: telegram } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["ai-my-plans"] });
      if (editing) { onStopEditing?.(); navigate({ to: "/account/ai" }); return; }
      document.getElementById("my-plans")?.scrollIntoView({ behavior: "smooth" });
    },
  });
  const save = useMutation({
    mutationFn: () => edit({ data: { id: editing!.id, name, commitTsd: amount, settings: settings as unknown as Record<string, unknown> } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-my-plans"] }); navigate({ to: "/account/ai" }); },
  });
  const err = (editing ? save.error ?? m.error : m.error) as Error | null;

  return (
    <section className="rounded-sm border border-primary/50 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        {editing ? <Pencil className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-primary" />}
        <h3 className="font-display text-lg font-extrabold">{editing ? `Editing “${editing.name}”` : "Like it? Lock it in."}</h3>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        {editing
          ? "Change the coins or rules above and check the result, then save. Tomorrow's daily check uses the new rules."
          : "Your plan is saved to your account with the TSD you commit. Every day Seeds runs it on fresh prices and sends you a Telegram message: \"Based on your plan, we should…\"."}
      </p>
      {signedIn ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (editing) save.mutate(); else m.mutate(); }}
        >
          <label className="text-sm">
            <span className="font-semibold">Plan name</span>
            <input className={`${inputCls} mt-1`} maxLength={60} placeholder="e.g. My BTC/ETH/LTC basket" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Commit (TSD)</span>
            <input className={`${inputCls} mt-1`} type="number" min={10} placeholder={String(settings.amount)} value={commit} onChange={(e) => setCommit(e.target.value)} />
          </label>
          <button type="submit" className="seed-btn sm:w-auto" disabled={m.isPending || save.isPending || !name.trim() || !settings.coins.length}>
            {editing ? (save.isPending ? "Saving…" : "Save changes") : m.isPending ? "Locking…" : "Lock in plan"}
          </button>
          {editing ? (
            <div className="flex flex-wrap gap-3 text-xs sm:col-span-3">
              <button type="button" className="text-primary underline" disabled={m.isPending} onClick={() => m.mutate()}>Lock as a new plan instead</button>
              <button type="button" className="text-muted-foreground underline" onClick={() => onStopEditing?.()}>Stop editing</button>
              <Link to="/account/ai" className="text-muted-foreground underline">Back to my strategies</Link>
            </div>
          ) : (
            <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
              <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />
              Send me the daily check on Telegram
            </label>
          )}
          {err ? <p role="alert" className="text-sm text-destructive sm:col-span-3">{err.message}</p> : null}
          {m.isSuccess && !editing ? <p className="text-sm text-primary sm:col-span-3">Locked in. Manage it any time in <Link to="/account/ai" className="underline">Profile → AI strategies</Link>.</p> : null}
        </form>
      ) : (
        <Link to="/auth" search={{ redirect: "/ai" }} className="seed-btn mt-4 sm:w-auto">Sign in with Honest.Money to lock it in</Link>
      )}
      <div className="mt-4 flex items-start gap-2 rounded-sm border border-border bg-background/60 p-3 text-xs text-muted-foreground">
        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p>
          <span className="font-semibold text-foreground">EXECUTE is coming next.</span> Seeds will turn your TSD into these coins
          inside your own HME trading pocket — Seeds never holds them. It switches on after the first real-money tests and the
          auditor's review. Until then a locked plan runs on paper.
        </p>
      </div>
    </section>
  );
}
