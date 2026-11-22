import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Search } from "lucide-react";
import { adminListQaReports, adminSetQaSettings, adminSetQaTelegramGroup, type AdminQaRow } from "@/lib/qa/qa-admin.functions";
import { QA_CATEGORIES, QA_SEVERITIES, QA_STATUSES, categoryLabel, isOpenReport, qaCsv, refLabel, severityLabel, statusLabel } from "@/lib/qa/qa-rules";
import { Card, Note, TabTitle, Toggle, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { BugsTabs } from "@/components/admin/BugsTabs";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/bugs/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Bugs & feedback — Seeds admin" },
      { name: "description", content: "Triage beta testers' bug reports and feedback: status, severity, assignee and duplicates." },
      { property: "og:title", content: "Bugs & feedback — Seeds admin" },
      { property: "og:description", content: "Triage beta testers' bug reports and feedback." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminBugs,
});

export const SEVERITY_TONE: Record<string, string> = { critical: "text-destructive font-semibold", high: "text-warning font-semibold", medium: "text-foreground", low: "text-muted-foreground" };

type Sort = "ref" | "updated" | "severity" | "status";
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER = Object.fromEntries(QA_STATUSES.map((s, i) => [s.id, i]));

function AdminBugs() {
  const qc = useQueryClient();
  const load = useServerFn(adminListQaReports);
  const q = useQuery({ queryKey: ["admin-qa"], queryFn: () => load(), retry: false, refetchInterval: 60_000 });
  const save = useServerFn(adminSetQaSettings);
  const setSettings = useMutation({
    mutationFn: (v: { enabled: boolean; recordingsEnabled: boolean }) => save({ data: v }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-qa"] }); void qc.invalidateQueries({ queryKey: ["qa-state"] }); },
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [assignee, setAssignee] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showDups, setShowDups] = useState(false);
  const [sort, setSort] = useState<{ k: Sort; dir: 1 | -1 }>({ k: "ref", dir: -1 });

  const all = q.data?.rows ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = all.filter((r) =>
      (showDups || !r.duplicate_of) &&
      (status === "" || (status === "open" ? isOpenReport(r) || (showDups && r.status !== "verified") : r.status === status)) &&
      (!severity || (severity === "none" ? !r.severity : r.severity === severity)) &&
      (!category || r.category === category) &&
      (!assignee || (assignee === "none" ? !r.assignee_id : r.assignee_id === assignee)) &&
      (!from || r.created_at.slice(0, 10) >= from) && (!to || r.created_at.slice(0, 10) <= to) &&
      (!s || [refLabel(r.ref_no), r.title, r.description, r.reporter, r.page_path, r.steps, r.actual].some((v) => v.toLowerCase().includes(s))));
    const val = (r: AdminQaRow): number | string =>
      sort.k === "ref" ? r.ref_no : sort.k === "updated" ? r.updated_at : sort.k === "severity" ? SEV_ORDER[r.severity ?? ""] ?? 9 : STATUS_ORDER[r.status] ?? 9;
    return [...list].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir);
  }, [all, search, status, severity, category, assignee, from, to, showDups, sort]);

  const counts = useMemo(() => {
    const c = { open: 0, critical: 0, retest: 0, untriaged: 0 };
    for (const r of all) {
      if (!isOpenReport(r)) continue;
      c.open++;
      if (r.severity === "critical") c.critical++;
      if (r.status === "ready_for_retest") c.retest++;
      if (!r.severity) c.untriaged++;
    }
    return c;
  }, [all]);

  const exportCsv = () => {
    const blob = new Blob([qaCsv(rows.map((r) => ({ ...r, reporter: r.reporter, assignee: r.assignee })))], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `seeds-qa-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const head = (k: Sort, label: string) => (
    <th className="px-3 py-2 text-left"><button type="button" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === "ref" || k === "updated" ? -1 : 1 }))} className="uppercase hover:text-foreground">{label}{sort.k === k ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button></th>
  );
  const sel = `${inputCls} h-9 w-auto py-1 text-xs`;

  return (
    <div className="space-y-6">
      <TabTitle title="Bugs & feedback" desc="Reports beta testers send with the Feedback button. Testers only ever see their own." />
      <BugsTabs />
      {q.isPending ? <Loading /> : q.error ? <Note tone="error">{(q.error as Error).message}</Note> : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Open", counts.open], ["Critical", counts.critical], ["Not triaged", counts.untriaged], ["Waiting on retest", counts.retest]].map(([l, v]) => (
              <div key={l} className="rounded-sm border border-border bg-surface p-4">
                <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{l}</p>
                <p className="font-display text-2xl font-black tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <Card title="Test mode" desc="Off hides the Feedback button for everyone and refuses new reports. Reports already sent stay here.">
            <div className="space-y-3">
              <Toggle checked={q.data.settings.enabled} disabled={setSettings.isPending} label="Feedback button on for beta testers and admins" onChange={(v) => setSettings.mutate({ enabled: v, recordingsEnabled: q.data.settings.recordingsEnabled })} />
              <Toggle checked={q.data.settings.recordingsEnabled} disabled={setSettings.isPending} label="Allow short screen recordings (30 s)" onChange={(v) => setSettings.mutate({ enabled: q.data.settings.enabled, recordingsEnabled: v })} />
              {setSettings.error ? <Note tone="error">{(setSettings.error as Error).message}</Note> : null}
            </div>
          </Card>

          <TelegramGroupCard current={q.data.settings.telegramChatId} onSaved={() => void qc.invalidateQueries({ queryKey: ["admin-qa"] })} />

          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search number, title, text, reporter or page" aria-label="Search reports" className={`${inputCls} pl-9`} />
              </div>
              <button type="button" onClick={exportCsv} disabled={!rows.length} className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"><Download className="h-3.5 w-3.5" />CSV ({rows.length})</button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
                <option value="open">Open (not verified)</option><option value="">Any status</option>
                {QA_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)} className={sel}>
                <option value="">Any severity</option><option value="none">Not set</option>
                {QA_SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={sel}>
                <option value="">Any category</option>
                {QA_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={sel}>
                <option value="">Anyone</option><option value="none">Unassigned</option>
                {q.data.admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
              <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
              <label className="flex items-center gap-1 text-xs text-muted-foreground"><input type="checkbox" checked={showDups} onChange={(e) => setShowDups(e.target.checked)} className="accent-primary" />Show duplicates</label>
            </div>
            {rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{all.length ? "Nothing matches these filters." : "No reports yet."}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                      {head("ref", "Report")}
                      <th className="px-3 py-2 text-left uppercase">Title</th>
                      <th className="px-3 py-2 text-left uppercase">Category</th>
                      {head("severity", "Severity")}
                      {head("status", "Status")}
                      <th className="px-3 py-2 text-left uppercase">Assignee</th>
                      <th className="px-3 py-2 text-left uppercase">Reporter</th>
                      {head("updated", "Updated")}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 align-top hover:bg-accent/30">
                        <td className="px-3 py-2 font-mono text-xs"><Link to="/admin/bugs/$ref" params={{ ref: String(r.ref_no) }} className="text-primary hover:underline">{refLabel(r.ref_no)}</Link></td>
                        <td className="px-3 py-2">
                          <Link to="/admin/bugs/$ref" params={{ ref: String(r.ref_no) }} className="font-semibold hover:text-primary">{r.title}</Link>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {r.page_path || "—"}{r.files ? ` · ${r.files} file${r.files === 1 ? "" : "s"}` : ""}{r.comments ? ` · ${r.comments} comment${r.comments === 1 ? "" : "s"}` : ""}
                            {r.duplicates ? ` · ${r.duplicates} duplicate${r.duplicates === 1 ? "" : "s"}` : ""}{r.duplicate_of_ref ? ` · duplicate of ${refLabel(r.duplicate_of_ref)}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{categoryLabel(r.category)}</td>
                        <td className={`px-3 py-2 text-xs ${SEVERITY_TONE[r.severity ?? ""] ?? "text-muted-foreground"}`}>{severityLabel(r.severity)}</td>
                        <td className="px-3 py-2 text-xs">{statusLabel(r.status)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.assignee || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.reporter}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted-foreground">{fmtAgo(r.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** Which Telegram group gets new reports and status changes (text only; files stay in Seeds). */
function TelegramGroupCard({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const save = useServerFn(adminSetQaTelegramGroup);
  const [value, setValue] = useState(current ?? "");
  const m = useMutation({ mutationFn: (chatId: string) => save({ data: { chatId } }), onSuccess: onSaved });
  return (
    <Card title="Telegram group" desc="New reports and status changes are posted to this group by the Seeds bot. Posts carry the report's text and a link here; screenshots, files and recordings stay private in Seeds. Leave empty to message each admin instead.">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(value); }}>
        <input className={`${inputCls} max-w-xs font-mono`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="-1001234567890" aria-label="Telegram group id" inputMode="numeric" />
        <button type="submit" disabled={m.isPending || value.trim() === (current ?? "")} className="rounded-lg bg-action px-4 py-2 text-sm font-semibold text-action-foreground disabled:opacity-50">
          {m.isPending ? "Checking…" : "Save"}
        </button>
        <span className="text-xs text-muted-foreground">{current ? `Posting to ${current}` : "Not set: admins get a direct message"}</span>
      </form>
      {m.error ? <div className="mt-2"><Note tone="error">{(m.error as Error).message}</Note></div> : null}
      {m.isSuccess ? <div className="mt-2"><Note tone="ok">Saved. {value.trim() ? "A short “connected” note was posted to the group." : ""}</Note></div> : null}
    </Card>
  );
}

