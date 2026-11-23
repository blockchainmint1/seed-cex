import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Plus, Trash2, Upload } from "lucide-react";
import { getAdminIgniteClasses, saveIgniteClass, uploadIgnitePhoto } from "@/lib/ignite-classes.functions";
import {
  CLASS_STATUSES, DEFAULT_AGENDA, DEFAULT_BENEFITS, TIMEZONES, classPrice, dateRangeLabel, photoSrc, usd0, utcToZoned, zonedToUtc,
  type AgendaItem, type ClassInput, type IgniteClassPublic,
} from "@/lib/ignite-classes";
import { Note, TabTitle, fieldLabel, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/ignite-classes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "To the Moon classes — Seeds admin" },
      { name: "description", content: "Create and edit To the Moon classes: instructor, photo, seats, price, schedule, agenda and requirements." },
      { property: "og:title", content: "To the Moon classes — Seeds admin" },
      { property: "og:description", content: "Manage Seeds To the Moon classes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClassesPage,
});

type AdminClass = IgniteClassPublic & { held: number; confirmed: number };
type SessionRow = { date: string; start: string; end: string };
type Form = Omit<ClassInput, "sessions" | "benefits"> & { sessions: SessionRow[]; benefitsText: string };

const STATUS_HELP: Record<string, string> = {
  draft: "Hidden from the public. Only admins see it.",
  open: "Shown on /to-the-moon and taking registrations.",
  closed: "Shown, but not taking registrations.",
  done: "Finished. Hidden from upcoming classes.",
};

function toForm(c: AdminClass | null): Form {
  const tz = c?.timezone ?? "America/Chicago";
  return {
    slug: c?.slug ?? "", name: c?.name ?? "", tagline: c?.tagline ?? "", status: c?.status ?? "draft",
    instructorName: c?.instructorName ?? "Bobby Gray", instructorBio: c?.instructorBio ?? "", instructorPhotoUrl: c?.instructorPhotoUrl ?? "",
    capacity: c?.capacity ?? 100, feeUsd: c?.feeUsd ?? 99, depositUsd: c?.depositUsd ?? 400, minersFree: c?.minersFree ?? true, timezone: tz,
    sessions: (c?.sessions ?? []).map((s) => { const a = utcToZoned(s.starts_at, tz); const b = utcToZoned(s.ends_at, tz); return { date: a.date, start: a.time, end: b.time }; }),
    location: c?.location ?? "Live online", requirements: c?.requirements ?? "",
    agenda: c?.agenda?.length ? c.agenda : DEFAULT_AGENDA, benefitsText: (c?.benefits?.length ? c.benefits : DEFAULT_BENEFITS).join("\n"),
  };
}

function toInput(f: Form): { input: ClassInput; bad: boolean } {
  let bad = false;
  const sessions = f.sessions.map((s) => {
    const a = zonedToUtc(s.date, s.start, f.timezone);
    const b = zonedToUtc(s.date, s.end, f.timezone);
    if (!a || !b) bad = true;
    return { starts_at: a ?? "", ends_at: b ?? "" };
  });
  return {
    bad,
    input: {
      ...f, sessions, capacity: Number(f.capacity), feeUsd: Number(f.feeUsd), depositUsd: Number(f.depositUsd),
      agenda: f.agenda.filter((a) => a.title.trim()), benefits: f.benefitsText.split("\n").map((x) => x.trim()).filter(Boolean),
    },
  };
}

function ClassesPage() {
  const fetchAll = useServerFn(getAdminIgniteClasses);
  const q = useQuery({ queryKey: ["admin-ignite-classes"], queryFn: () => fetchAll(), retry: false });
  const [editing, setEditing] = useState<AdminClass | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <TabTitle title="To the Moon classes" desc="Every class gets its own page at /to-the-moon/<address>. Prices here are what checkout charges."
        right={editing ? null : <Button size="sm" onClick={() => setEditing("new")}><Plus /> New class</Button>} />
      {notice ? <Note tone="ok">{notice}</Note> : null}
      {editing ? (
        <ClassEditor initial={editing === "new" ? null : editing} onDone={(msg) => { setEditing(null); if (msg) setNotice(msg); }} />
      ) : q.isPending ? <Loading /> : q.error || !q.data ? <p role="alert" className="text-sm text-destructive">{(q.error as Error | null)?.message ?? "Couldn't load classes."}</p> : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="label-caps text-muted-foreground">
              <tr className="border-b border-border">
                {["Class", "Status", "Dates", "Instructor", "Price", "Seats", ""].map((h) => <th key={h} scope="col" className="px-3 py-2 text-left font-normal">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => {
                const p = classPrice(c, "unknown");
                return (
                  <tr key={c.id} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2"><span className="font-semibold">{c.name}</span><span className="block font-mono text-xs text-muted-foreground">/to-the-moon/{c.slug}</span></td>
                    <td className="px-3 py-2"><span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase">{c.status}</span></td>
                    <td className="px-3 py-2 text-xs">{dateRangeLabel(c.sessions, c.timezone)}</td>
                    <td className="px-3 py-2 text-xs">{c.instructorName}</td>
                    <td className="px-3 py-2 text-xs">{usd0(p.totalUsd)}<span className="block text-muted-foreground">{usd0(c.feeUsd)} class + {usd0(c.depositUsd)} deposit{c.minersFree && c.feeUsd > 0 ? " · miners free" : ""}</span></td>
                    <td className="px-3 py-2 text-xs">{c.confirmed} paid · {c.held} held / {c.capacity}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        {c.status !== "draft" ? <Button asChild size="sm" variant="ghost" className="h-7 px-2"><Link to="/to-the-moon/$slug" params={{ slug: c.slug }} target="_blank"><ExternalLink /> Page</Link></Button> : null}
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditing(c)}>Edit</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {q.data.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-muted-foreground">No classes yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClassEditor({ initial, onDone }: { initial: AdminClass | null; onDone: (msg?: string) => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveIgniteClass);
  const upload = useServerFn(uploadIgnitePhoto);
  const [f, setF] = useState<Form>(() => toForm(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | "save" | "photo">(null);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const price = classPrice({ feeUsd: Number(f.feeUsd) || 0, depositUsd: Number(f.depositUsd) || 0, minersFree: f.minersFree }, "unknown");
  const minerPrice = classPrice({ feeUsd: Number(f.feeUsd) || 0, depositUsd: Number(f.depositUsd) || 0, minersFree: f.minersFree }, "miner");
  const E = ({ k }: { k: string }) => (errors[k] ? <span className="mt-1 block text-xs text-destructive">{errors[k]}</span> : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { input, bad } = toInput(f);
    if (bad) { setErrors({ sessions: "Fill in a date, start and end for every session." }); return; }
    if (f.status === "open" && initial?.status !== "open" && !window.confirm(`Open ${f.name} to the public? It shows on /to-the-moon and starts taking payments right away.`)) return;
    setBusy("save");
    try {
      const r = await save({ data: { id: initial?.id ?? null, input } });
      if (!r.ok) { setErrors(r.errors); return; }
      await qc.invalidateQueries({ queryKey: ["admin-ignite-classes"] });
      await qc.invalidateQueries({ queryKey: ["admin-ignite"] });
      onDone(`${f.name} saved.`);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(null); }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setErr("Photo must be under 3 MB."); return; }
    setBusy("photo"); setErr(null);
    try {
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Couldn't read the photo.")); r.readAsDataURL(file); });
      const { url } = await upload({ data: { dataUrl } });
      set("instructorPhotoUrl", url);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(null); }
  }

  const photo = photoSrc(f.instructorPhotoUrl);
  return (
    <form onSubmit={submit} className="space-y-6 rounded-md border border-border bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">{initial ? `Edit ${initial.name}` : "New class"}</h2>
        {initial ? <p className="text-xs text-muted-foreground">{initial.confirmed} paid · {initial.held} seats held</p> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className={fieldLabel}>Class name</span><input className={`${inputCls} mt-1`} value={f.name} maxLength={60} onChange={(e) => set("name", e.target.value)} placeholder="Spark" /><E k="name" /></label>
        <label className="block"><span className={fieldLabel}>Page address</span>
          <div className="mt-1 flex items-center gap-1"><span className="font-mono text-xs text-muted-foreground">/to-the-moon/</span><input className={inputCls} value={f.slug} maxLength={40} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="spark" /></div>
          <span className="mt-1 block text-xs text-muted-foreground">Lowercase letters, numbers and dashes. Don't change it once people have the link.</span><E k="slug" />
        </label>
        <label className="block md:col-span-2"><span className={fieldLabel}>One-line pitch (optional)</span><input className={`${inputCls} mt-1`} value={f.tagline} maxLength={200} onChange={(e) => set("tagline", e.target.value)} placeholder="Two afternoons, one weekend: wallet to first trade." /><E k="tagline" /></label>
        <label className="block"><span className={fieldLabel}>Status</span>
          <select className={`${inputCls} mt-1`} value={f.status} onChange={(e) => set("status", e.target.value)}>{CLASS_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <span className="mt-1 block text-xs text-muted-foreground">{STATUS_HELP[f.status]}</span><E k="status" />
        </label>
        <label className="block"><span className={fieldLabel}>Where</span><input className={`${inputCls} mt-1`} value={f.location} maxLength={120} onChange={(e) => set("location", e.target.value)} /><E k="location" /></label>
      </div>

      <fieldset className="space-y-3">
        <legend className={fieldLabel}>Instructor</legend>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col items-center gap-2">
            {photo ? <img src={photo} alt="" className="size-24 rounded-xl object-cover" /> : <div className="flex size-24 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">No photo</div>}
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary">
              <Upload className="size-3.5" /> {busy === "photo" ? "Uploading…" : photo ? "Replace" : "Upload photo"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => pickPhoto(e.target.files?.[0])} />
            </label>
            {photo ? <button type="button" className="text-xs text-muted-foreground underline" onClick={() => set("instructorPhotoUrl", "")}>Remove</button> : null}
            <E k="instructorPhotoUrl" />
          </div>
          <div className="min-w-[16rem] flex-1 space-y-3">
            <label className="block"><span className={fieldLabel}>Name</span><input className={`${inputCls} mt-1`} value={f.instructorName} maxLength={80} onChange={(e) => set("instructorName", e.target.value)} /><E k="instructorName" /></label>
            <label className="block"><span className={fieldLabel}>Short bio (optional)</span><textarea className={`${inputCls} mt-1 min-h-20`} value={f.instructorBio} maxLength={600} onChange={(e) => set("instructorBio", e.target.value)} /><E k="instructorBio" /></label>
          </div>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-4">
        <legend className={`${fieldLabel} md:col-span-4`}>Seats and price</legend>
        <label className="block"><span className={fieldLabel}>Seats</span><input type="number" min={1} max={5000} className={`${inputCls} mt-1`} value={f.capacity} onChange={(e) => set("capacity", Number(e.target.value))} /><E k="capacity" /></label>
        <label className="block"><span className={fieldLabel}>Class fee (USD)</span><input type="number" min={0} step="0.01" className={`${inputCls} mt-1`} value={f.feeUsd} onChange={(e) => set("feeUsd", Number(e.target.value))} /><E k="feeUsd" /></label>
        <label className="block"><span className={fieldLabel}>Trade deposit (USD)</span><input type="number" min={0} step="0.01" className={`${inputCls} mt-1`} value={f.depositUsd} onChange={(e) => set("depositUsd", Number(e.target.value))} /><E k="depositUsd" /></label>
        <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.minersFree} onChange={(e) => set("minersFree", e.target.checked)} /> Free for HME miners</label>
        <p className="text-sm md:col-span-4">
          Total to register: <strong>{usd0(price.totalUsd)}</strong>{f.minersFree && price.feeUsd > 0 ? <> · HME miners pay <strong>{usd0(minerPrice.totalUsd)}</strong> (class fee waived, deposit still applies)</> : null}
        </p>
        {initial && initial.held > 0 ? <p className="text-xs text-muted-foreground md:col-span-4">Price changes apply to new checkouts only. People who already paid or have a checkout open keep their price.</p> : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={fieldLabel}>Schedule</legend>
        <label className="block max-w-xs"><span className={fieldLabel}>Time zone</span>
          <select className={`${inputCls} mt-1`} value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>{TIMEZONES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select><E k="timezone" />
        </label>
        {f.sessions.map((s, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="sr-only">Session {i + 1} date</span><input type="date" className={inputCls} value={s.date} onChange={(e) => set("sessions", f.sessions.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} /></label>
            <label className="block"><span className="sr-only">Starts</span><input type="time" className={inputCls} value={s.start} onChange={(e) => set("sessions", f.sessions.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} /></label>
            <span className="pb-2 text-muted-foreground">to</span>
            <label className="block"><span className="sr-only">Ends</span><input type="time" className={inputCls} value={s.end} onChange={(e) => set("sessions", f.sessions.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} /></label>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove session ${i + 1}`} onClick={() => set("sessions", f.sessions.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => { const last = f.sessions[f.sessions.length - 1]; set("sessions", [...f.sessions, { date: last?.date ?? "", start: last?.start ?? "13:00", end: last?.end ?? "17:00" }]); }}><Plus /> Add session</Button>
        <E k="sessions" />
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={fieldLabel}>Agenda / curriculum</legend>
        {f.agenda.map((a, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[14rem_1fr_auto]">
            <input className={inputCls} value={a.title} maxLength={80} placeholder="Topic" onChange={(e) => set("agenda", f.agenda.map((x: AgendaItem, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <input className={inputCls} value={a.detail} maxLength={300} placeholder="What it covers" onChange={(e) => set("agenda", f.agenda.map((x: AgendaItem, j) => (j === i ? { ...x, detail: e.target.value } : x)))} />
            <Button type="button" size="sm" variant="ghost" aria-label="Remove topic" onClick={() => set("agenda", f.agenda.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => set("agenda", [...f.agenda, { title: "", detail: "" }])}><Plus /> Add topic</Button>
        <E k="agenda" />
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block"><span className={fieldLabel}>What every seat includes (one per line)</span><textarea className={`${inputCls} mt-1 min-h-32`} value={f.benefitsText} onChange={(e) => set("benefitsText", e.target.value)} /><E k="benefits" /></label>
        <label className="block"><span className={fieldLabel}>Requirements (what to bring)</span><textarea className={`${inputCls} mt-1 min-h-32`} value={f.requirements} maxLength={2000} onChange={(e) => set("requirements", e.target.value)} placeholder={"A phone or computer\nAn Honest.Money account\nThe trade deposit"} /><E k="requirements" /></label>
      </div>

      {err ? <Note tone="error">{err}</Note> : null}
      {Object.keys(errors).length ? <Note tone="warn">Fix the highlighted fields: {Object.values(errors).slice(0, 3).join(" ")}</Note> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy !== null}>{busy === "save" ? "Saving…" : "Save class"}</Button>
        <Button type="button" variant="ghost" onClick={() => onDone()} disabled={busy === "save"}>Cancel</Button>
      </div>
    </form>
  );
}
