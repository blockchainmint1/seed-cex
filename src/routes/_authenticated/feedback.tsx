import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip } from "lucide-react";
import { listMyQaReports, replyToMyQaReport, retestMyQaReport } from "@/lib/qa/qa.functions";
import { categoryLabel, refLabel, severityLabel, statusLabel } from "@/lib/qa/qa-rules";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/feedback")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "My feedback reports — Seeds beta" },
      { name: "description", content: "The bug reports and feedback you've sent the Seeds team during the beta, and where each one stands." },
      { property: "og:title", content: "My feedback reports — Seeds beta" },
      { property: "og:description", content: "Follow your bug reports and feedback from the Seeds beta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyReports,
});

const STATUS_TONE: Record<string, string> = {
  new: "border-border text-muted-foreground", investigating: "border-warning/50 text-warning", fixed: "border-primary/50 text-primary",
  ready_for_retest: "border-warning bg-warning/10 text-foreground", verified: "border-primary bg-primary/10 text-primary", ignored: "border-border bg-muted text-muted-foreground",
};

function MyReports() {
  const load = useServerFn(listMyQaReports);
  const q = useQuery({ queryKey: ["my-qa-reports"], queryFn: () => load(), refetchInterval: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const reports = q.data?.reports ?? [];
  const waiting = reports.filter((r) => r.status === "ready_for_retest").length;

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <header className="mb-6 border-b border-border pb-6">
        <p className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">Beta testing</p>
        <h1 className="font-display text-3xl font-black tracking-tight">My reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Everything you've sent with the <strong className="text-foreground">Feedback</strong> button, and where it stands. Only you and the Seeds team can see these.
        </p>
      </header>
      {q.isPending ? <p className="font-mono text-xs text-muted-foreground">Loading…</p> : q.error ? (
        <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>
      ) : !q.data?.tester ? (
        <p className="text-sm text-muted-foreground">The feedback tools are for Seeds beta testers. <Link to="/account" className="text-primary hover:underline">Back to your account</Link>.</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet. Press <strong className="text-foreground">Feedback</strong> at the bottom of any page to send one.</p>
      ) : (
        <div className="space-y-3">
          {waiting ? <p className="rounded-sm border border-warning/50 bg-warning/10 p-3 text-sm"><strong>{waiting}</strong> report{waiting === 1 ? " is" : "s are"} ready for you to retest.</p> : null}
          {reports.map((r) => (
            <section key={r.id} className="rounded-sm border border-border bg-surface">
              <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
                <span className="font-mono text-xs text-muted-foreground">{refLabel(r.ref_no as number)}</span>
                <span className="flex-1 font-semibold">{r.title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{categoryLabel(r.category)} · {fmtAgo(r.created_at)}</span>
                <span className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] ${STATUS_TONE[r.status] ?? ""}`}>{r.duplicate_of ? "Same as another report" : statusLabel(r.status)}</span>
              </button>
              {open === r.id ? <ReportBody r={r} /> : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

type Mine = NonNullable<Awaited<ReturnType<typeof listMyQaReports>>>["reports"][number];

function ReportBody({ r }: { r: Mine }) {
  const qc = useQueryClient();
  const reply = useServerFn(replyToMyQaReport);
  const retest = useServerFn(retestMyQaReport);
  const [note, setNote] = useState("");
  const done = () => { setNote(""); void qc.invalidateQueries({ queryKey: ["my-qa-reports"] }); };
  const send = useMutation({ mutationFn: () => reply({ data: { id: r.id, body: note } }), onSuccess: done });
  const answer = useMutation({ mutationFn: (worked: boolean) => retest({ data: { id: r.id, worked, ...(note.trim() ? { note } : {}) } }), onSuccess: done });
  const err = (send.error ?? answer.error) as Error | null;
  const Block = ({ t, v }: { t: string; v: string }) => (v ? <div><p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">{t}</p><p className="whitespace-pre-wrap text-sm">{v}</p></div> : null);
  return (
    <div className="space-y-4 border-t border-border px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Block t="What happened" v={r.description} />
        <Block t="Page" v={r.page_path} />
        <Block t="Expected" v={r.expected} />
        <Block t="Instead" v={r.actual} />
        <Block t="Steps" v={r.steps} />
        <Block t="Severity (set by the team)" v={r.severity ? severityLabel(r.severity) : ""} />
      </div>
      {r.files.length ? (
        <ul className="flex flex-wrap gap-2">
          {r.files.map((f) => (
            <li key={f.id}>{f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 font-mono text-[11px] text-primary hover:underline"><Paperclip className="h-3 w-3" />{f.fileName}</a> : null}</li>
          ))}
        </ul>
      ) : null}
      {r.comments.length ? (
        <ol className="space-y-2">
          {r.comments.map((c) => (
            <li key={c.id} className={`rounded-sm border p-3 text-sm ${c.from_team ? "border-primary/40 bg-primary/5" : "border-border"}`}>
              <p className="mb-1 font-mono text-[10px] text-muted-foreground uppercase">{c.from_team ? "Seeds team" : "You"} · {fmtAgo(c.created_at)}</p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={4000} placeholder="Add a note for the team (optional)" className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm" />
      <div className="flex flex-wrap justify-end gap-2">
        {r.status === "ready_for_retest" ? (
          <>
            <Button type="button" variant="outline" size="sm" disabled={answer.isPending} onClick={() => answer.mutate(false)}>Still broken</Button>
            <Button type="button" size="sm" disabled={answer.isPending} onClick={() => answer.mutate(true)}>Fixed for me</Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={!note.trim() || send.isPending} onClick={() => send.mutate()}>Send note</Button>
        )}
      </div>
      {err ? <p role="alert" className="text-sm text-destructive">{err.message}</p> : null}
    </div>
  );
}
