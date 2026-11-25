import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Paperclip } from "lucide-react";
import { adminCommentQaReport, adminDeleteQaReport, adminGetQaReport, adminListQaReports, adminUpdateQaReport } from "@/lib/qa/qa-admin.functions";
import { QA_SEVERITIES, QA_STATUSES, categoryLabel, refLabel, severityLabel, statusLabel } from "@/lib/qa/qa-rules";
import { Card, Note, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/bugs/$ref")({
  staticData: { sitemap: false },
  head: ({ params }) => ({
    meta: [
      { title: `Report QA-${params.ref.padStart(4, "0")} — Seeds admin` },
      { name: "description", content: "One beta tester report: details, attachments, comments and history." },
      { property: "og:title", content: "Beta report — Seeds admin" },
      { property: "og:description", content: "One beta tester report with its triage history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BugDetail,
});

const FIELD_LABEL: Record<string, string> = { status: "Status", severity: "Severity", assignee: "Assignee", duplicate_of: "Duplicate of", retest: "Tester's retest" };

function BugDetail() {
  const ref = Number(Route.useParams().ref);
  const qc = useQueryClient();
  const load = useServerFn(adminGetQaReport);
  const q = useQuery({ queryKey: ["admin-qa", ref], queryFn: () => load({ data: { ref } }), retry: false, enabled: Number.isInteger(ref) && ref > 0 });
  const loadList = useServerFn(adminListQaReports);
  const list = useQuery({ queryKey: ["admin-qa"], queryFn: () => loadList(), retry: false });
  const update = useServerFn(adminUpdateQaReport);
  const comment = useServerFn(adminCommentQaReport);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-qa"] }); };
  type Change = { id: string; status?: string; severity?: string | null; assigneeId?: string | null; duplicateOfRef?: string | null };
  const change = useMutation({ mutationFn: (v: Change) => update({ data: v }), onSuccess: refresh });
  const del = useServerFn(adminDeleteQaReport);
  const navigate = useNavigate();
  const remove = useMutation({ mutationFn: (id: string) => del({ data: { id } }), onSuccess: () => { refresh(); void navigate({ to: "/admin/bugs" }); } });
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(true);
  const [dupRef, setDupRef] = useState("");
  const post = useMutation({ mutationFn: () => comment({ data: { id: q.data!.report.id, body, internal } }), onSuccess: () => { setBody(""); refresh(); } });

  if (q.isPending) return <Loading />;
  if (q.error) return <Note tone="error">{(q.error as Error).message}</Note>;
  const { report: r, comments, events, duplicates, duplicateOf, files } = q.data;
  const admins = list.data?.admins ?? [];
  const nameOf = (id: string | null) => (id ? admins.find((a) => a.id === id)?.name ?? "Admin" : "—");
  const shown = (field: string, v: string | null) =>
    field === "status" || field === "retest" ? (v ? statusLabel(v) : "—") : field === "severity" ? severityLabel(v) : field === "assignee" ? nameOf(v) : v ? "another report" : "none";
  const sel = `${inputCls} h-9 py-1 text-sm`;
  const Block = ({ t, v }: { t: string; v: string }) => (v ? <div><p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">{t}</p><p className="whitespace-pre-wrap text-sm">{v}</p></div> : null);

  return (
    <div className="space-y-5">
      <Link to="/admin/bugs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />All reports</Link>
      <div>
        <p className="font-mono text-xs text-muted-foreground">{refLabel(r.ref_no)} · {categoryLabel(r.category)} · from {r.reporter} · {fmtAgo(r.created_at)}</p>
        <h1 className="font-display text-2xl font-black tracking-tight">{r.title}</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card title="Report">
            <div className="grid gap-4 sm:grid-cols-2">
              <Block t="What happened" v={r.description} />
              <Block t="Steps" v={r.steps} />
              <Block t="Expected" v={r.expected} />
              <Block t="Instead" v={r.actual} />
            </div>
            <dl className="mt-4 grid gap-2 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground sm:grid-cols-2">
              <div>Page: <span className="text-foreground">{r.page_path || "—"}</span></div>
              <div>Browser: <span className="text-foreground">{r.browser || "—"}</span></div>
              <div>System: <span className="text-foreground">{r.os || "—"}</span></div>
              <div>Screen: <span className="text-foreground">{r.viewport || "—"}</span></div>
              <div>App version: <span className="text-foreground">{r.app_version || "—"}</span></div>
              <div>Sent: <span className="text-foreground">{new Date(r.created_at).toLocaleString()}</span></div>
            </dl>
          </Card>

          {files.length ? (
            <Card title={`Attachments (${files.length})`} desc="Links work for 2 minutes; reload the page for fresh ones.">
              <ul className="grid gap-3 sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.id} className="overflow-hidden rounded-sm border border-border">
                    {f.url && f.mime.startsWith("image/") ? <a href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt={f.fileName} className="max-h-72 w-full bg-background object-contain" /></a>
                      : f.url && f.mime.startsWith("video/") ? <video src={f.url} controls className="max-h-72 w-full bg-background" />
                      : null}
                    <div className="flex items-center justify-between gap-2 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      <span className="truncate">{f.fileName}{f.redacted ? " · blacked out by tester" : ""}</span>
                      {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Paperclip className="h-3 w-3" />Open</a> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Comments" desc="Team-only notes stay inside Seeds. Replies are shown to the tester under My reports.">
            {comments.length ? (
              <ol className="mb-4 space-y-2">
                {comments.map((c) => (
                  <li key={c.id} className={`rounded-sm border p-3 text-sm ${c.internal ? "border-warning/40 bg-warning/5" : c.from_team ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <p className="mb-1 font-mono text-[10px] text-muted-foreground uppercase">{c.author} · {c.internal ? "team only" : c.from_team ? "reply to tester" : "tester"} · {fmtAgo(c.created_at)}</p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="mb-4 text-sm text-muted-foreground">No comments yet.</p>}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} className={`${inputCls} w-full`} placeholder="Write a note" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-3 text-sm" role="radiogroup" aria-label="Who sees it">
                <label className="flex items-center gap-1"><input type="radio" checked={internal} onChange={() => setInternal(true)} className="accent-primary" />Team only</label>
                <label className="flex items-center gap-1"><input type="radio" checked={!internal} onChange={() => setInternal(false)} className="accent-primary" />Reply to tester</label>
              </div>
              <Button type="button" size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>{internal ? "Add note" : "Send reply"}</Button>
            </div>
            {post.error ? <Note tone="error">{(post.error as Error).message}</Note> : null}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Triage">
            <div className="space-y-3">
              <Button variant="destructive" size="sm" className="w-full" disabled={remove.isPending}
                onClick={() => { if (window.confirm(`Delete ${refLabel(r.ref_no)} for good? Its comments, history and screenshots are removed too. This can't be undone.`)) remove.mutate(r.id); }}>
                {remove.isPending ? "Deleting…" : "Delete report"}
              </Button>
              {remove.error ? <Note tone="error">{(remove.error as Error).message}</Note> : null}
              <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Status</span>
                <select value={r.status} disabled={change.isPending} onChange={(e) => change.mutate({ id: r.id, status: e.target.value })} className={sel}>
                  {QA_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Severity</span>
                <select value={r.severity ?? ""} disabled={change.isPending} onChange={(e) => change.mutate({ id: r.id, severity: e.target.value || null })} className={sel}>
                  <option value="">Not set</option>
                  {QA_SEVERITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm"><span className="text-muted-foreground">Assignee</span>
                <select value={r.assignee_id ?? ""} disabled={change.isPending} onChange={(e) => change.mutate({ id: r.id, assigneeId: e.target.value || null })} className={sel}>
                  <option value="">Unassigned</option>
                  {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <div className="space-y-1 text-sm">
                <span className="text-muted-foreground">Duplicate of</span>
                {duplicateOf ? (
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/admin/bugs/$ref" params={{ ref: String(duplicateOf.ref_no) }} className="text-primary hover:underline">{refLabel(duplicateOf.ref_no)} · {duplicateOf.title}</Link>
                    <button type="button" disabled={change.isPending} onClick={() => change.mutate({ id: r.id, duplicateOfRef: null })} className="text-xs text-muted-foreground hover:text-destructive">Not a duplicate</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input value={dupRef} onChange={(e) => setDupRef(e.target.value)} placeholder="QA-0012" aria-label="Original report number" className={`${inputCls} h-9 py-1`} />
                    <Button type="button" size="sm" variant="outline" disabled={!dupRef.trim() || change.isPending} onClick={() => change.mutate({ id: r.id, duplicateOfRef: dupRef }, { onSuccess: () => setDupRef("") })}>Mark</Button>
                  </div>
                )}
              </div>
              {change.error ? <Note tone="error">{(change.error as Error).message}</Note> : null}
            </div>
          </Card>

          {duplicates.length ? (
            <Card title={`Duplicates (${duplicates.length})`}>
              <ul className="space-y-1 text-sm">
                {duplicates.map((d) => (
                  <li key={d.id}><Link to="/admin/bugs/$ref" params={{ ref: String(d.ref_no) }} className="text-primary hover:underline">{refLabel(d.ref_no)}</Link> · {d.title} <span className="text-muted-foreground">({d.reporter})</span></li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="History">
            {events.length ? (
              <ol className="space-y-1 font-mono text-[11px] text-muted-foreground">
                {events.map((e) => (
                  <li key={e.id}>{fmtAgo(e.created_at)} · <span className="text-foreground">{e.actor}</span> · {FIELD_LABEL[e.field] ?? e.field}: {shown(e.field, e.from_value)} → {shown(e.field, e.to_value)}</li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted-foreground">No changes yet.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}
