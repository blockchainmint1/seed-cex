import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAiPlans, updateMyAiPlan } from "@/lib/ai/ai.functions";
import type { PlanSettings } from "@/lib/ai/plan";
import type { AiCoin } from "@/lib/ai/market";
import { Panel } from "./ui";

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function MyPlans({ coins, highlight, onLoad }: { coins: AiCoin[]; highlight?: string; onLoad: (s: PlanSettings) => void }) {
  const qc = useQueryClient();
  const fetchPlans = useServerFn(getMyAiPlans);
  const update = useServerFn(updateMyAiPlan);
  const q = useQuery({ queryKey: ["ai-my-plans"], queryFn: () => fetchPlans() });
  const m = useMutation({
    mutationFn: (v: { id: string; status?: "locked" | "paused" | "ended"; telegramDaily?: boolean }) => update({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-my-plans"] }),
  });
  const symbol = (id: string) => coins.find((c) => c.id === id)?.symbol.toUpperCase() ?? id;

  return (
    <div id="my-plans" className="scroll-mt-24">
      <Panel title="My plans">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your plans…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{(q.error as Error).message}</p>
        ) : !q.data?.plans.length ? (
          <p className="text-sm text-muted-foreground">No plans yet. Test one above, then lock it in.</p>
        ) : (
          <div className="space-y-4">
            {!q.data.telegramLinked ? (
              <p className="rounded-sm border border-warn/50 bg-warn/10 p-3 text-xs">
                Telegram isn't connected, so daily checks only show here. <Link to="/account" className="font-semibold underline">Connect Telegram in Profile</Link>.
              </p>
            ) : null}
            {q.data.plans.map((p) => (
              <article key={p.id} className={`rounded-sm border p-4 ${p.id === highlight ? "border-primary" : "border-border"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-base font-extrabold">{p.name}</h3>
                    <p className="num text-xs text-muted-foreground">
                      {p.commitTsd.toLocaleString("en-US")} TSD · {p.settings.mode === "momentum" ? "Follow the strongest" : "Basket"} ·{" "}
                      {p.settings.coins.map(symbol).join(", ")} · locked {p.lockedAt.slice(0, 10)}
                    </p>
                  </div>
                  <span className={`rounded-sm px-2 py-0.5 font-mono text-[11px] uppercase ${p.status === "locked" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {p.status === "locked" ? "live" : p.status}
                  </span>
                </div>
                {p.lastCheck ? (
                  <pre className="mt-3 rounded-sm bg-background/60 p-3 font-sans text-sm whitespace-pre-wrap">{plain(p.lastCheck.message)}</pre>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">First daily check runs at the next scheduled time.</p>
                )}
                {p.status !== "ended" ? (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button className="seed-btn-ghost min-h-0 px-3 py-1.5 text-xs" onClick={() => onLoad(p.settings)}>Open in tester</button>
                    <button className="seed-btn-ghost min-h-0 px-3 py-1.5 text-xs" disabled={m.isPending}
                      onClick={() => m.mutate({ id: p.id, status: p.status === "locked" ? "paused" : "locked" })}>
                      {p.status === "locked" ? "Pause" : "Resume"}
                    </button>
                    <button className="seed-btn-ghost min-h-0 px-3 py-1.5 text-xs" disabled={m.isPending}
                      onClick={() => m.mutate({ id: p.id, telegramDaily: !p.telegramDaily })}>
                      Telegram: {p.telegramDaily ? "on" : "off"}
                    </button>
                    <button className="seed-btn-ghost min-h-0 px-3 py-1.5 text-xs text-ask" disabled={m.isPending}
                      onClick={() => { if (confirm(`End "${p.name}"? This can't be undone.`)) m.mutate({ id: p.id, status: "ended" }); }}>
                      End plan
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
