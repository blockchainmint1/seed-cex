import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Mail, Plus, Search } from "lucide-react";
import { addIgniteInterest, getAdminIgniteClasses, getIgniteInterest, sendIgniteInterestMessage, type InterestRow } from "@/lib/ignite-classes.functions";
import { interestRecipients } from "@/lib/ignite-classes";
import { BODY_MAX, validateMessage } from "@/lib/ignite-admin";
import { Note, TabTitle, fieldLabel, inputCls } from "@/components/account/ui";
import { Loading, Stat } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/ignite-interest")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Ignite interest list — Seeds admin" },
      { name: "description", content: "People who want to hear about new Ignite classes, including everyone who registered but didn't pay." },
      { property: "og:title", content: "Ignite interest list — Seeds admin" },
      { property: "og:description", content: "Email people about new Ignite classes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InterestPage,
});

const SOURCE: Record<string, string> = { unpaid_registration: "Registered, didn't pay", registration: "Registered", signup: "Signed up on /ignite", admin: "Added by admin" };

function InterestPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(getIgniteInterest);
  const fetchClasses = useServerFn(getAdminIgniteClasses);
  const send = useServerFn(sendIgniteInterestMessage);
  const add = useServerFn(addIgniteInterest);
  const q = useQuery({ queryKey: ["admin-ignite-interest"], queryFn: () => fetchList(), retry: false });
  const classes = useQuery({ queryKey: ["admin-ignite-classes"], queryFn: () => fetchClasses(), retry: false });
  const [search, setSearch] = useState("");
  const [includeSeated, setIncludeSeated] = useState(false);
  const [compose, setCompose] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);

  const rows = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => !t || r.email.includes(t) || (r.fullName ?? "").toLowerCase().includes(t));
  }, [q.data, search]);
  const recipients = useMemo(() => interestRecipients(rows, includeSeated), [rows, includeSeated]);

  function downloadCsv() {
    const cell = (v: string | null) => { const s = v ?? ""; const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return `"${safe.replace(/"/g, '""')}"`; };
    const lines = [["Email", "Name", "How they joined", "Has a seat", "Joined", "Unsubscribed"].map(cell).join(","),
      ...rows.map((r) => [r.email, r.fullName, SOURCE[r.source] ?? r.source, r.seatClass ?? "", r.createdAt, r.unsubscribedAt].map(cell).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `ignite-interest-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const d = q.data ?? [];
  return (
    <div className="space-y-5">
      <TabTitle title="Ignite interest list" desc={<>Not tied to any class. Everyone who registered but didn't pay is here, plus anyone who signed up on <Link to="/ignite" className="text-primary underline">/ignite</Link>. Email them when you add a class.</>} />
      {q.isPending ? <Loading /> : q.error ? <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="On the list" value={String(d.filter((r) => !r.unsubscribedAt).length)} tone="good" />
            <Stat label="No seat yet" value={String(d.filter((r) => !r.unsubscribedAt && !r.hasSeat).length)} />
            <Stat label="Already have a seat" value={String(d.filter((r) => r.hasSeat).length)} />
            <Stat label="Unsubscribed" value={String(d.filter((r) => r.unsubscribedAt).length)} />
          </div>
          {notice ? <Note tone={notice.tone}>{notice.text}</Note> : null}
          <section className="min-w-0 rounded-md border border-border bg-surface">
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <span className="sr-only">Search</span>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input className={`${inputCls} py-1.5 pl-8`} placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={includeSeated} onChange={(e) => setIncludeSeated(e.target.checked)} /> Include people who already have a seat</label>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus /> Add people</Button>
                <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!rows.length}><Download /> CSV</Button>
                <Button size="sm" onClick={() => setCompose(true)} disabled={!recipients.length}><Mail /> Email {recipients.length}</Button>
              </div>
            </header>
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="label-caps sticky top-0 bg-surface text-muted-foreground">
                  <tr className="border-b border-border">{["Email", "Name", "How they joined", "Seat", "Joined", "Last emailed"].map((h) => <th key={h} scope="col" className="px-3 py-2 text-left font-normal">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 500).map((r) => (
                    <tr key={r.id} className={`border-b border-border/50 last:border-0 ${r.unsubscribedAt ? "text-muted-foreground line-through" : ""}`}>
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2">{r.fullName ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{SOURCE[r.source] ?? r.source}</td>
                      <td className="px-3 py-2 text-xs">{r.seatClass ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{fmtAgo(r.createdAt)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.lastEmailedAt ? fmtAgo(r.lastEmailedAt) : "—"}</td>
                    </tr>
                  ))}
                  {!rows.length ? <tr><td colSpan={6} className="px-3 py-6 text-muted-foreground">{d.length ? "No one matches." : "No one on the list yet."}</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">Showing {Math.min(rows.length, 500)} of {rows.length}. Unsubscribed people are never emailed. Every email has a one-click unsubscribe link.</p>
          </section>
        </>
      )}

      <InterestComposer open={compose} recipients={recipients} classes={(classes.data ?? []).filter((c) => c.status === "open")} onClose={() => setCompose(false)}
        onSend={async (subject, body, classSlug) => {
          const ids = recipients.map((r) => r.id);
          let sent = 0, skipped = 0; const failed: string[] = [];
          // 200 per call keeps each server call well inside its outgoing-request budget.
          for (let i = 0; i < ids.length; i += 200) {
            const r = await send({ data: { ids: ids.slice(i, i + 200), subject, body, classSlug } });
            sent += r.sent.length; skipped += r.skipped.length; failed.push(...r.failed);
          }
          setNotice({ tone: failed.length ? "error" : "ok", text: `Sent to ${sent}.${skipped ? ` Skipped ${skipped} (unsubscribed).` : ""}${failed.length ? ` Couldn't send to ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}.` : ""}` });
          setCompose(false);
          await qc.invalidateQueries({ queryKey: ["admin-ignite-interest"] });
        }} />

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-lg">
          <AddPeople onAdd={async (text) => {
            const r = await add({ data: { text } });
            setNotice({ tone: r.bad.length ? "warn" : "ok", text: `Added ${r.added}.${r.bad.length ? ` Couldn't read: ${r.bad.slice(0, 5).join(", ")}` : ""} People already on the list stay as they were.` });
            setAdding(false);
            await qc.invalidateQueries({ queryKey: ["admin-ignite-interest"] });
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddPeople({ onAdd }: { onAdd: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <DialogHeader><DialogTitle>Add people to the interest list</DialogTitle><DialogDescription>One per line: an email, or Name &lt;email&gt;. Only add people who asked to hear about classes.</DialogDescription></DialogHeader>
      <textarea className={`${inputCls} min-h-40`} value={text} onChange={(e) => setText(e.target.value)} placeholder={"jane@example.com\nSam Lee <sam@example.com>"} />
      <Button disabled={busy || !text.trim()} onClick={async () => { setBusy(true); try { await onAdd(text); } finally { setBusy(false); } }}>{busy ? "Adding…" : "Add"}</Button>
    </>
  );
}

function InterestComposer({ open, recipients, classes, onClose, onSend }: {
  open: boolean; recipients: InterestRow[]; classes: { slug: string; name: string }[]; onClose: () => void;
  onSend: (subject: string, body: string, classSlug: string | null) => Promise<void>;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [slug, setSlug] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const problems = validateMessage({ subject, body });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {recipients.length} {recipients.length === 1 ? "person" : "people"}</DialogTitle>
          <DialogDescription>From Seeds &lt;no-reply@seeds.honest.money&gt;. Includes a button to the class page and a one-click unsubscribe link.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (problems.subject || problems.body) { setErr(problems.subject ?? problems.body ?? null); return; }
          if (!window.confirm(`Send this to ${recipients.length} people now?`)) return;
          setSending(true); setErr(null);
          try { await onSend(subject, body, slug || null); setSubject(""); setBody(""); } catch (e2) { setErr((e2 as Error).message); } finally { setSending(false); }
        }}>
          <label className="block"><span className={fieldLabel}>Button links to</span>
            <select className={`${inputCls} mt-1`} value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">All upcoming classes (/ignite)</option>
              {classes.map((c) => <option key={c.slug} value={c.slug}>{c.name} (/ignite/{c.slug})</option>)}
            </select>
          </label>
          <label className="block"><span className={fieldLabel}>Subject</span><input className={`${inputCls} mt-1`} value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder="A new Ignite class just opened" /></label>
          <label className="block"><span className={fieldLabel}>Message</span>
            <textarea className={`${inputCls} mt-1 min-h-40`} value={body} maxLength={BODY_MAX + 200} onChange={(e) => setBody(e.target.value)} placeholder={"Hi {first},\n\nSpark runs December 5–6, 1–5 PM Central…"} />
            <span className="mt-1 block text-xs text-muted-foreground">Type {"{first}"} to greet each person by name. Leave a blank line between paragraphs.</span>
          </label>
          {err ? <Note tone="error">{err}</Note> : null}
          <div className="flex gap-2"><Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send"}</Button><Button type="button" variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
