import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Zap } from "lucide-react";
import { lockAiPlan } from "@/lib/ai/ai.functions";
import type { PlanSettings } from "@/lib/ai/plan";
import { inputCls } from "./ui";

export function LockPanel({ settings, signedIn }: { settings: PlanSettings; signedIn: boolean }) {
  const qc = useQueryClient();
  const lock = useServerFn(lockAiPlan);
  const [name, setName] = useState("");
  const [commit, setCommit] = useState<string>("");
  const [telegram, setTelegram] = useState(true);
  const amount = commit === "" ? settings.amount : Number(commit);
  const m = useMutation({
    mutationFn: () => lock({ data: { name, commitTsd: amount, settings: settings as unknown as Record<string, unknown>, telegramDaily: telegram } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["ai-my-plans"] });
      document.getElementById("my-plans")?.scrollIntoView({ behavior: "smooth" });
    },
  });

  return (
    <section className="rounded-sm border border-primary/50 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-primary" />
        <h3 className="font-display text-lg font-extrabold">Like it? Lock it in.</h3>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Your plan is saved to your account with the TSD you commit. Every day Seeds runs it on fresh prices and sends you a
        Telegram message: "Based on your plan, we should…".
      </p>
      {signedIn ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
        >
          <label className="text-sm">
            <span className="font-semibold">Plan name</span>
            <input className={`${inputCls} mt-1`} maxLength={60} placeholder="e.g. My BTC/ETH/LTC basket" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="font-semibold">Commit (TSD)</span>
            <input className={`${inputCls} mt-1`} type="number" min={10} placeholder={String(settings.amount)} value={commit} onChange={(e) => setCommit(e.target.value)} />
          </label>
          <button type="submit" className="seed-btn sm:w-auto" disabled={m.isPending || !name.trim() || !settings.coins.length}>
            {m.isPending ? "Locking…" : "Lock in plan"}
          </button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-3">
            <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />
            Send me the daily check on Telegram
          </label>
          {m.error ? <p role="alert" className="text-sm text-destructive sm:col-span-3">{(m.error as Error).message}</p> : null}
          {m.isSuccess ? <p className="text-sm text-primary sm:col-span-3">Locked in. Today's check is below in My plans.</p> : null}
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
