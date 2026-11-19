import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TabTitle } from "@/components/account/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminAiRefresh, adminAiRunChecks, adminAiSaveSettings, adminAiSetCoin, getAdminAi } from "@/lib/ai/ai.functions";
import { Panel, inputCls } from "@/components/ai/ui";

export const Route = createFileRoute("/_authenticated/admin/ai")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Seeds AI Admin — coins, price data and plans" },
      { name: "description", content: "Operator view of Seeds AI: which coins are offered, price-history health, live member plans and daily checks." },
      { property: "og:title", content: "Seeds AI Admin" },
      { property: "og:description", content: "Coins, price data and member plans for Seeds AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAiPage,
});

function AdminAiPage() {
  const qc = useQueryClient();
  const fetchAdmin = useServerFn(getAdminAi);
  const setCoin = useServerFn(adminAiSetCoin);
  const refresh = useServerFn(adminAiRefresh);
  const saveSettings = useServerFn(adminAiSaveSettings);
  const runChecks = useServerFn(adminAiRunChecks);
  const q = useQuery({ queryKey: ["admin-ai"], queryFn: () => fetchAdmin() });
  const reload = () => qc.invalidateQueries({ queryKey: ["admin-ai"] });
  const coinM = useMutation({ mutationFn: (v: { id: string; active: boolean }) => setCoin({ data: v }), onSuccess: reload });
  const refreshM = useMutation({ mutationFn: () => refresh(), onSuccess: () => setTimeout(reload, 8000) });
  const checksM = useMutation({ mutationFn: () => runChecks(), onSuccess: reload });
  const [limit, setLimit] = useState("");
  const [maxCommit, setMaxCommit] = useState("");
  const [memberMax, setMemberMax] = useState("");
  useEffect(() => {
    if (q.data) { setLimit(String(q.data.settings.oneTapLimitUsd)); setMaxCommit(String(q.data.settings.maxCommitTsd)); setMemberMax(String(q.data.settings.oneTapMemberMaxUsd)); }
  }, [q.data]);
  const settingsM = useMutation({ mutationFn: () => saveSettings({ data: { oneTapLimitUsd: Number(limit), oneTapMemberMaxUsd: Number(memberMax), maxCommitTsd: Number(maxCommit) } }), onSuccess: reload });
  const testerM = useMutation({
    mutationFn: (on: boolean) => saveSettings({ data: { oneTapLimitUsd: q.data!.settings.oneTapLimitUsd, maxCommitTsd: q.data!.settings.maxCommitTsd, testerExecution: on } }),
    onSuccess: reload,
  });

  return (
    <div className="space-y-8">
      <TabTitle title="Seeds AI" desc="Coins members can plan with, price-history health, and every locked plan." />

      {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : q.error ? (
        <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : q.data ? (
        <>
          <Panel
            title={`Coins offered (${q.data.coins.filter((c) => c.active).length})`}
            right={
              <button className="seed-btn-ghost min-h-0 px-3 py-1.5 text-xs" disabled={refreshM.isPending} onClick={() => refreshM.mutate()}>
                {refreshM.isPending ? "Queuing…" : refreshM.data ? `Queued ${refreshM.data.queued} downloads` : "Download missing prices"}
              </button>
            }
          >
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm whitespace-nowrap">
                <thead className="label-caps text-left"><tr>
                  <th className="py-2 pl-4 font-normal">Coin</th><th className="pl-4 font-normal">Buys via</th><th className="pl-4 text-right font-normal">Days saved</th>
                  <th className="pl-4 font-normal">From</th><th className="pl-4 font-normal">Latest</th><th className="pl-4 font-normal">Source</th><th className="pr-4 text-right font-normal">Offered</th>
                </tr></thead>
                <tbody>
                  {q.data.coins.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="py-2 pl-4 font-semibold">{c.name} <span className="font-mono text-[11px] text-muted-foreground uppercase">{c.symbol}</span></td>
                      <td className="pl-4 font-mono text-xs">{c.swapCoin ?? "—"}</td>
                      <td className="num text-right">{c.days.toLocaleString()}</td>
                      <td className="num pl-4 text-muted-foreground">{c.firstDay ?? "—"}</td>
                      <td className="num pl-4 text-muted-foreground">{c.lastDay ?? "—"}</td>
                      <td className="pl-4 text-xs text-muted-foreground">{c.source ?? "—"}</td>
                      <td className="pr-4 text-right">
                        <button className="seed-btn-ghost min-h-0 px-3 py-1 text-xs" disabled={coinM.isPending} onClick={() => coinM.mutate({ id: c.id, active: !c.active })}>
                          {c.active ? "On" : "Off"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {q.data.addable.length ? (
              <div className="mt-8 flex flex-wrap items-center gap-2 text-xs">
                <span className="label-caps">Add</span>
                {q.data.addable.map((c) => (
                  <button key={c.geckoId} className="seed-btn-ghost min-h-0 px-3 py-1 text-xs" disabled={coinM.isPending} onClick={() => coinM.mutate({ id: c.geckoId, active: true })}>
                    + {c.name}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              Only coins Seeds can buy and sell back through THORChain can be added. Other coins (like SHIB) need a new buying route first.
            </p>
          </Panel>

          <Panel title="Limits">
            <form className="grid gap-3 sm:grid-cols-[12rem_12rem_12rem_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); settingsM.mutate(); }}>
              <label className="text-sm"><span className="font-semibold">Default one-tap limit ($)</span>
                <input className={`${inputCls} mt-1`} type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} /></label>
              <label className="text-sm"><span className="font-semibold">Highest a member can set ($)</span>
                <input className={`${inputCls} mt-1`} type="number" min={0} value={memberMax} onChange={(e) => setMemberMax(e.target.value)} /></label>
              <label className="text-sm"><span className="font-semibold">Max per plan (TSD)</span>
                <input className={`${inputCls} mt-1`} type="number" min={10} value={maxCommit} onChange={(e) => setMaxCommit(e.target.value)} /></label>
              <button className="seed-btn sm:w-auto" disabled={settingsM.isPending}>{settingsM.isPending ? "Saving…" : "Save limits"}</button>
            </form>
            {settingsM.error ? <p className="mt-2 text-sm text-destructive">{(settingsM.error as Error).message}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-sm border border-border p-3 text-sm">
              <span>
                Real buying for <b>beta testers</b> (admins included): <span className="font-semibold">{q.data.settings.adminExecutionEnabled ? "on" : "off"}</span>
              </span>
              <button className="seed-btn-ghost min-h-0 px-3 py-1 text-xs" disabled={testerM.isPending}
                onClick={() => testerM.mutate(!q.data!.settings.adminExecutionEnabled)}>
                {testerM.isPending ? "Saving…" : q.data.settings.adminExecutionEnabled ? "Switch off for everyone" : "Switch on"}
              </button>
              {testerM.error ? <span className="text-destructive">{(testerM.error as Error).message}</span> : null}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Buying for other members: <span className="font-semibold text-foreground">{q.data.settings.executionEnabled ? "on" : "off"}</span> (their plans stay on paper).
              Beta testers have no plan-size, plan-count or swap-size limit; the max per plan above applies to other members. One-tap limit: trade days up to it confirm with one tap in Telegram, bigger ones are confirmed on Seeds.
              Every member starts on the default; in Account → Alerts they can lower theirs any time, or raise it up to the highest above with a two-factor code. Switching off stops trades that haven't started.
            </p>
          </Panel>

          <Panel
            title={`Member plans (${q.data.plans.filter((p) => p.status === "locked").length} live)`}
            right={
              <button className="seed-btn-ghost min-h-0 px-3 py-1.5 text-xs" disabled={checksM.isPending} onClick={() => checksM.mutate()}>
                {checksM.isPending ? "Running…" : checksM.data ? `Checked ${checksM.data.checked}, sent ${checksM.data.sent}` : "Run today's checks now"}
              </button>
            }
          >
            {!q.data.plans.length ? <p className="text-sm text-muted-foreground">No plans locked yet.</p> : (
              <div className="-m-4 overflow-x-auto">
                <table className="w-full min-w-[46rem] text-sm whitespace-nowrap">
                  <thead className="label-caps text-left"><tr>
                    <th className="py-2 pl-4 font-normal">Member</th><th className="pl-4 font-normal">Plan</th><th className="pl-4 font-normal">Kind</th><th className="text-right font-normal">Coins</th>
                    <th className="text-right font-normal">TSD</th><th className="pl-4 font-normal">Status</th><th className="font-normal">Locked</th><th className="pr-4 text-right font-normal">Alerts (7d)</th>
                  </tr></thead>
                  <tbody>
                    {q.data.plans.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-2 pl-4">{p.member}</td><td className="pl-4 font-semibold">{p.name}</td>
                        <td className="pl-4 text-xs">{p.mode === "momentum" ? "Strongest" : "Basket"}</td>
                        <td className="num text-right">{p.coins}</td><td className="num text-right">{p.commitTsd.toLocaleString("en-US")}</td>
                        <td className="pl-4 font-mono text-xs uppercase">{p.status === "locked" ? "live" : p.status}</td>
                        <td className="num text-muted-foreground">{p.lockedAt.slice(0, 10)}</td><td className="num pr-4 text-right">{p.alerts7d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {checksM.error ? <p className="mt-2 text-sm text-destructive">{(checksM.error as Error).message}</p> : null}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
