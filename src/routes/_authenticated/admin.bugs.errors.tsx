import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { adminGetClientError, adminListClientErrors, adminSetClientErrorHandled, adminSetErrorLog, type AdminErrorGroup } from "@/lib/qa/qa-admin.functions";
import { Card, Note, TabTitle, Toggle, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { BugsTabs } from "@/components/admin/BugsTabs";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/bugs/errors")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Browser errors — Seeds admin" },
      { name: "description", content: "Seeds' own private log of browser errors nobody reported, grouped by message." },
      { property: "og:title", content: "Browser errors — Seeds admin" },
      { property: "og:description", content: "Seeds' own private error log, grouped by message." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminErrors,
});

function AdminErrors() {
  const qc = useQueryClient();
  const load = useServerFn(adminListClientErrors);
  const q = useQuery({ queryKey: ["admin-client-errors"], queryFn: () => load(), retry: false, refetchInterval: 60_000 });
  const saveSwitch = useServerFn(adminSetErrorLog);
  const toggle = useMutation({ mutationFn: (enabled: boolean) => saveSwitch({ data: { enabled } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-client-errors"] }) });
  const [show, setShow] = useState<"open" | "handled" | "all">("open");
  const [search, setSearch] = useState("");
  const [openSig, setOpenSig] = useState<string | null>(null);

  const all = q.data?.rows ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((r) => (show === "all" || (show === "open" ? !r.handled_at : !!r.handled_at)) && (!s || r.message.toLowerCase().includes(s) || r.source.toLowerCase().includes(s)));
  }, [all, show, search]);
  const openCount = all.filter((r) => !r.handled_at).length;
  const weekCount = all.reduce((n, r) => n + r.last_week, 0);

  return (
    <div className="space-y-6">
      <TabTitle title="Bugs & feedback" desc="Reports beta testers send, plus browser errors nobody reported." />
      <BugsTabs />
      {q.isPending ? <Loading /> : q.error ? <Note tone="error">{(q.error as Error).message}</Note> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[["Open errors", openCount], ["Seen this week", weekCount], ["Kinds logged", all.length]].map(([l, v]) => (
              <div key={l} className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{l}</p>
                <p className="font-display text-2xl font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <Card title="Error log" desc="Pages quietly send errors here when something breaks in a visitor's browser. Messages are cleaned first: no links, emails, addresses, codes or amounts. Nothing is sent from sign-in, Seeds Key, Security, Withdraw or admin pages, and nothing leaves Seeds. New errors (and ones that come back after you mark them handled) post a heads-up to the bugs Telegram group, at most 10 an hour.">
            <Toggle checked={q.data.enabled} disabled={toggle.isPending} label="Log browser errors" onChange={(v) => toggle.mutate(v)} />
            {toggle.error ? <div className="mt-2"><Note tone="error">{(toggle.error as Error).message}</Note></div> : null}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search message or file" aria-label="Search errors" className={`${inputCls} pl-9`} />
              </div>
              <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={`${inputCls} h-9 w-auto py-1 text-xs`}>
                <option value="open">Open</option><option value="handled">Handled</option><option value="all">All</option>
              </select>
            </div>
            {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{all.length ? "Nothing matches." : "No errors logged yet."}</p> : (
              <ul className="divide-y divide-border/60">
                {rows.map((r) => <ErrorRow key={r.signature} r={r} open={openSig === r.signature} onToggle={() => setOpenSig((s) => (s === r.signature ? null : r.signature))} />)}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ErrorRow({ r, open, onToggle }: { r: AdminErrorGroup; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient();
  const getOne = useServerFn(adminGetClientError);
  const setHandled = useServerFn(adminSetClientErrorHandled);
  const detail = useQuery({ queryKey: ["admin-client-error", r.signature], queryFn: () => getOne({ data: { signature: r.signature } }), enabled: open, retry: false });
  const m = useMutation({ mutationFn: (handled: boolean) => setHandled({ data: { signature: r.signature, handled } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-client-errors"] }) });
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block break-words font-mono text-xs text-foreground">{r.message}</span>
            <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
              {r.kind === "rejection" ? "Unhandled promise" : "Error"} · {r.occurrences.toLocaleString()} total · {r.last_week} this week · last {fmtAgo(r.last_seen)} · first {fmtAgo(r.first_seen)}{r.source ? ` · ${r.source}` : ""}
              {r.handled_at ? ` · handled by ${r.handled_by || "admin"} ${fmtAgo(r.handled_at)}` : ""}
            </span>
          </span>
        </button>
        <Button type="button" size="sm" variant={r.handled_at ? "ghost" : "outline"} disabled={m.isPending} onClick={() => m.mutate(!r.handled_at)}>{r.handled_at ? "Reopen" : "Mark handled"}</Button>
      </div>
      {open ? (
        <div className="mt-3 pl-6">
          {detail.isPending ? <Loading /> : detail.error ? <Note tone="error">{(detail.error as Error).message}</Note> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-xs">
                <thead><tr className="border-b border-border text-left font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  <th className="px-2 py-1">When</th><th className="px-2 py-1">Page</th><th className="px-2 py-1">Site</th><th className="px-2 py-1">Browser</th><th className="px-2 py-1">Screen</th><th className="px-2 py-1">Version</th><th className="px-2 py-1">Account</th>
                </tr></thead>
                <tbody>{detail.data.rows.map((d) => (
                  <tr key={d.id} className="border-b border-border/40">
                    <td className="whitespace-nowrap px-2 py-1 font-mono">{fmtAgo(d.created_at)}</td>
                    <td className="px-2 py-1 font-mono">{d.page_path || "/"}</td>
                    <td className="px-2 py-1">{d.host}</td>
                    <td className="px-2 py-1">{[d.browser, d.os].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-2 py-1 font-mono">{d.viewport || "—"}</td>
                    <td className="px-2 py-1 font-mono">{d.app_version || "—"}</td>
                    <td className="px-2 py-1">{d.account || "Visitor"}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">Newest 50 shown. Details are kept 90 days, at most 200 a day per error.</p>
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}
