import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Mail, Search, Send, X } from "lucide-react";
import { cancelIgniteSeat, moveIgniteSeat, type AdminIgniteRow } from "@/lib/admin.functions";
import { checkIgniteMiner, setIgniteMinerMark } from "@/lib/ignite-classes.functions";
import { sendIgniteMessage, sendIgniteReminders } from "@/lib/ignite-admin.functions";
import { BODY_MAX, MAX_RECIPIENTS, REMINDABLE, filterIgniteRows, reminderBlock, sortIgniteRows, validateMessage, type SortKey } from "@/lib/ignite-admin";
import { Note, TabTitle, fieldLabel, inputCls } from "@/components/account/ui";
import { Loading, SortHeader, Stat, short, useAdminIgnite } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/ignite")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Ignite registrants — Seeds admin" },
      { name: "description", content: "Everyone registered for the Ignite class: search, sort, email registrants and send payment reminders." },
      { property: "og:title", content: "Ignite class registrants — Seeds admin" },
      { property: "og:description", content: "Registrants, payments and messages for the Ignite class." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IgniteAdminPage,
});

const FILTERS = [
  { v: "all", label: "All" },
  { v: "confirmed", label: "Paid" },
  { v: "unpaid", label: "Not paid yet" },
  { v: "canceled", label: "Cancelled" },
] as const;

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  confirmed: { label: "paid", cls: "bg-primary/15 text-primary" },
  pending: { label: "pending", cls: "bg-warn/15 text-foreground" },
  underpaid: { label: "underpaid", cls: "bg-warn/15 text-foreground" },
  expired: { label: "not paid", cls: "bg-muted text-muted-foreground" },
  canceled: { label: "cancelled", cls: "bg-muted text-muted-foreground line-through" },
};

type SendResult = { sent: string[]; skipped: { name: string; reason: string }[]; failed: string[] };

function paidLabel(r: AdminIgniteRow) {
  if (r.status !== "confirmed" && !r.paidAsset) return r.method === "peer" ? "Peer Pay" : "—";
  return `${r.paidUsd != null ? `$${r.paidUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} ` : ""}${r.paidAsset ?? r.paidChain ?? ""}${r.method === "peer" ? " · Peer Pay" : ""}`.trim();
}

function csvCell(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  // Neutralise spreadsheet formulas, then quote.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function summary(r: SendResult, what: string) {
  const parts = [`${what} sent to ${r.sent.length} ${r.sent.length === 1 ? "person" : "people"}.`];
  if (r.skipped.length) parts.push(`Skipped ${r.skipped.length}: ${r.skipped.slice(0, 4).map((s) => `${s.name} (${s.reason})`).join("; ")}${r.skipped.length > 4 ? "…" : ""}`);
  if (r.failed.length) parts.push(`Couldn't send to ${r.failed.join(", ")}.`);
  return parts.join(" ");
}

function IgniteAdminPage() {
  const qc = useQueryClient();
  const q = useAdminIgnite();
  const remind = useServerFn(sendIgniteReminders);
  const message = useServerFn(sendIgniteMessage);
  const cancel = useServerFn(cancelIgniteSeat);
  const move = useServerFn(moveIgniteSeat);
  const markMiner = useServerFn(setIgniteMinerMark);
  const checkMiner = useServerFn(checkIgniteMiner);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [minerCheck, setMinerCheck] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [compose, setCompose] = useState<AdminIgniteRow[] | null>(null);
  const [detail, setDetail] = useState<AdminIgniteRow | null>(null);
  const d = q.data;

  const className = useMemo(() => new Map((d?.classes ?? []).map((c) => [c.id, c.name])), [d]);
  const inClass = useMemo(() => (d ? (classFilter === "all" ? d.rows : d.rows.filter((r) => r.classId === classFilter)) : []), [d, classFilter]);
  const rows = useMemo(() => sortIgniteRows(filterIgniteRows(inClass, search, filter), sort.key, sort.dir), [inClass, search, filter, sort]);
  const selClass = d?.classes.find((c) => c.id === classFilter) ?? null;
  const paidInClass = inClass.filter((r) => r.status === "confirmed");
  const pickedRows = useMemo(() => (d ? d.rows.filter((r) => picked.has(r.id)) : []), [d, picked]);
  const pickedUnpaid = pickedRows.filter((r) => (REMINDABLE as readonly string[]).includes(r.status));
  const allShownPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const reload = () => qc.invalidateQueries({ queryKey: ["admin-ignite"] });

  const onSort = (k: SortKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "createdAt" || k === "lastEmailedAt" || k === "paidUsd" ? "desc" : "asc" }));
  const togglePick = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setPicked((p) => { const n = new Set(p); for (const r of rows) { if (allShownPicked) n.delete(r.id); else n.add(r.id); } return n; });

  async function sendReminders(list: AdminIgniteRow[]) {
    if (!list.length) return;
    const who = list.length === 1 ? list[0]!.fullName : `${list.length} people`;
    if (!window.confirm(`Email a "finish your registration" link to ${who}?\n\nThe link opens the registration page, where they pay the deposit with a fresh checkout.`)) return;
    setBusy("remind");
    setNotice(null);
    try {
      const r = await remind({ data: { ids: list.map((x) => x.id) } });
      setNotice({ tone: r.failed.length ? "error" : r.sent.length ? "ok" : "warn", text: summary(r, "Payment link") });
      await reload();
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function onCancel(r: AdminIgniteRow) {
    if (!window.confirm(`Cancel ${r.fullName}'s Ignite seat? This frees the seat. Refund the payment in NectarPay separately.`)) return;
    setBusy(r.id);
    try {
      await cancel({ data: { id: r.id } });
      setNotice({ tone: "ok", text: `${r.fullName}'s seat was cancelled.` });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  function downloadCsv() {
    const head = ["Name", "Email", "Phone", "Class", "Status", "Paid", "Paid by", "Referred by", "Registered", "Last emailed", "Marketing opt-in"];
    const lines = rows.map((r) => [r.fullName, r.email, r.phone, r.classId ? className.get(r.classId) ?? "" : "", r.status, paidLabel(r), r.payerName ?? "", r.refCode ?? "", r.createdAt, r.lastEmailedAt ?? "", r.marketingOptIn ? "yes" : "no"].map(csvCell).join(","));
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ignite-registrants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <TabTitle
        title="Ignite registrants"
        desc={selClass ? `${selClass.name} · ${selClass.dates}${selClass.time ? ` · ${selClass.time}` : ""} · ${selClass.capacity} seats` : "Everyone who registered for any Ignite class: payments, messages and reminders."}
      />
      {q.isPending ? <Loading /> : q.error || !d ? <p role="alert" className="text-sm text-destructive">Couldn't load registrations. Refresh to retry.</p> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Class" className="flex flex-wrap rounded-sm border border-border p-0.5">
              {[{ id: "all", name: "All classes" }, ...d.classes].map((c) => (
                <button key={c.id} type="button" aria-pressed={classFilter === c.id} onClick={() => { setClassFilter(c.id); setPicked(new Set()); }}
                  className={`rounded-sm px-2.5 py-1 text-xs ${classFilter === c.id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {c.name}{"status" in c && c.status === "draft" ? " (draft)" : ""}
                </button>
              ))}
            </div>
            <Link to="/admin/ignite-classes" className="text-xs font-semibold text-primary underline-offset-4 hover:underline">Manage classes</Link>
            <Link to="/admin/ignite-interest" className="text-xs font-semibold text-primary underline-offset-4 hover:underline">Interest list</Link>
            {selClass && paidInClass.length ? (
              <Button size="sm" className="ml-auto" disabled={paidInClass.length > MAX_RECIPIENTS} onClick={() => setCompose(paidInClass)}>
                <Mail /> Email everyone paid in {selClass.name} ({paidInClass.length})
              </Button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <Stat label="Paid" value={String(paidInClass.length)} tone="good" />
            <Stat label="Seats left" value={selClass ? `${Math.max(0, selClass.capacity - selClass.held)} / ${selClass.capacity}` : String(d.classes.filter((c) => c.status === "open").reduce((n, c) => n + Math.max(0, c.capacity - c.held), 0))} />
            <Stat label="Not paid yet" value={String(inClass.filter((r) => (REMINDABLE as readonly string[]).includes(r.status)).length)} tone={d.pending ? "warn" : undefined} />
            <Stat label="Registered" value={String(inClass.filter((r) => r.status !== "canceled").length)} />
            <Stat label="Cancelled" value={String(inClass.filter((r) => r.status === "canceled").length)} />
          </div>

          {notice ? (
            <div className="flex items-start gap-2">
              <div className="flex-1"><Note tone={notice.tone}>{notice.text}</Note></div>
              <button type="button" aria-label="Dismiss" className="mt-2 text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>
            </div>
          ) : null}

          <section className="min-w-0 rounded-md border border-border bg-surface">
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                <span className="sr-only">Search registrants</span>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input className={`${inputCls} py-1.5 pl-8`} placeholder="Name, email, phone, referrer" value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <div role="group" aria-label="Show" className="flex flex-wrap rounded-sm border border-border p-0.5">
                {FILTERS.map((f) => (
                  <button key={f.v} type="button" aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}
                    className={`rounded-sm px-2.5 py-1 text-xs ${filter === f.v ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!rows.length}><Download /> CSV</Button>
              </div>
            </header>

            {picked.size ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5 text-sm">
                <span className="font-semibold">{picked.size} selected</span>
                <Button size="sm" onClick={() => setCompose(pickedRows)} disabled={pickedRows.length > MAX_RECIPIENTS}><Mail /> Email selected</Button>
                <Button size="sm" variant="outline" disabled={!pickedUnpaid.length || busy === "remind"} onClick={() => sendReminders(pickedUnpaid)}>
                  <Send /> {busy === "remind" ? "Sending…" : `Send payment link (${pickedUnpaid.length} unpaid)`}
                </Button>
                <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => setPicked(new Set())}>Clear</button>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="label-caps text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="w-8 px-3 py-2">
                      <input type="checkbox" aria-label="Select all shown" className="h-4 w-4 accent-[var(--primary)]" checked={allShownPicked} onChange={toggleAll} />
                    </th>
                    <SortHeader label="Name" k="fullName" sort={sort} onSort={onSort} />
                    <SortHeader label="Email" k="email" sort={sort} onSort={onSort} />
                    <th scope="col" className="px-3 py-2 text-left font-normal">Phone</th>
                    <th scope="col" className="px-3 py-2 text-left font-normal">Class</th>
                    <SortHeader label="Status" k="status" sort={sort} onSort={onSort} />
                    <SortHeader label="Paid" k="paidUsd" sort={sort} onSort={onSort} />
                    <SortHeader label="Referred by" k="refCode" sort={sort} onSort={onSort} />
                    <SortHeader label="Registered" k="createdAt" sort={sort} onSort={onSort} />
                    <SortHeader label="Last emailed" k="lastEmailedAt" sort={sort} onSort={onSort} />
                    <th scope="col" className="bg-surface px-3 py-2 text-right font-normal lg:sticky lg:right-0 lg:shadow-[-8px_0_8px_-8px_var(--border)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const chip = STATUS_CHIP[r.status] ?? { label: r.status, cls: "bg-muted text-muted-foreground" };
                    const block = reminderBlock(r.status, r.lastReminderAt);
                    return (
                      <tr key={r.id} className={`border-b border-border/50 last:border-0 ${picked.has(r.id) ? "bg-primary/5" : ""}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" aria-label={`Select ${r.fullName}`} className="h-4 w-4 accent-[var(--primary)]" checked={picked.has(r.id)} onChange={() => togglePick(r.id)} />
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" className="font-semibold hover:text-primary hover:underline" onClick={() => setDetail(r)}>{r.fullName}</button>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.email}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.phone}</td>
                        <td className="px-3 py-2 text-xs">{r.classId ? className.get(r.classId) ?? "—" : "—"}{r.minerDiscountUsd > 0 ? <span className="block text-primary">miner: fee waived</span> : null}</td>
                        <td className="px-3 py-2"><span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase ${chip.cls}`}>{chip.label}</span></td>
                        <td className="px-3 py-2 text-xs">{paidLabel(r)}{r.payerName ? <span className="block text-muted-foreground">by {r.payerName}</span> : null}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.refCode ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{fmtAgo(r.createdAt)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.lastEmailedAt ? fmtAgo(r.lastEmailedAt) : "—"}</td>
                        <td className={`px-3 py-2 lg:sticky lg:right-0 lg:shadow-[-8px_0_8px_-8px_var(--border)] ${picked.has(r.id) ? "bg-accent" : "bg-surface"}`}>
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setCompose([r])} title="Write an email"><Mail /> Email</Button>
                            {(REMINDABLE as readonly string[]).includes(r.status) ? (
                              <Button size="sm" variant="outline" className="h-7 px-2" disabled={!!block || busy === "remind"} title={block ?? "Email a link to finish paying"} onClick={() => sendReminders([r])}>
                                <Send /> Payment link
                              </Button>
                            ) : null}
                            {r.status !== "canceled" ? (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy === r.id} onClick={() => onCancel(r)}>
                                {busy === r.id ? "Cancelling…" : "Cancel seat"}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? <tr><td colSpan={11} className="px-3 py-6 text-muted-foreground">{d.rows.length ? "No one matches." : "No registrations yet."}</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              Showing {rows.length} of {d.rows.length}. A payment link goes to the registration page, which opens a fresh checkout. Each person can get one every 12 hours.
            </p>
          </section>
        </>
      )}

      <Composer
        recipients={compose}
        onClose={() => setCompose(null)}
        onSend={async (subject, body) => {
          const r = await message({ data: { ids: compose!.map((x) => x.id), subject, body } });
          setNotice({ tone: r.failed.length ? "error" : "ok", text: summary(r, "Message") });
          setCompose(null);
          await reload();
        }}
      />

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) { setDetail(null); setMinerCheck(null); } }}>
        <DialogContent className="max-w-lg">
          {detail ? (
            <>
              <DialogHeader>
                <DialogTitle>{detail.fullName}</DialogTitle>
                <DialogDescription>{detail.email} · {detail.phone}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Class</dt><dd>{detail.classId ? className.get(detail.classId) ?? "—" : "—"}</dd>
                <dt className="text-muted-foreground">Seat price</dt><dd>${detail.amountUsd.toLocaleString("en-US")}{detail.minerDiscountUsd > 0 ? ` (class fee waived: miner)` : ""}</dd>
                <dt className="text-muted-foreground">Status</dt><dd>{STATUS_CHIP[detail.status]?.label ?? detail.status}</dd>
                <dt className="text-muted-foreground">Paid</dt><dd>{paidLabel(detail)}</dd>
                <dt className="text-muted-foreground">Paid by</dt><dd>{detail.payerName ?? (detail.status === "confirmed" && detail.method !== "peer" ? "self" : "—")}</dd>
                <dt className="text-muted-foreground">Invoice</dt><dd className="font-mono text-xs" title={detail.invoiceId ?? undefined}>{short(detail.invoiceId)}</dd>
                <dt className="text-muted-foreground">Referred by</dt><dd>{detail.refCode ?? "—"}</dd>
                <dt className="text-muted-foreground">Honest.Money</dt><dd>{detail.hmLinked ? "linked" : "not linked"}</dd>
                <dt className="text-muted-foreground">Updates opt-in</dt><dd>{detail.marketingOptIn ? "yes" : "no"}</dd>
                <dt className="text-muted-foreground">Registered</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd>
                {detail.confirmedAt ? (<><dt className="text-muted-foreground">Confirmed</dt><dd>{new Date(detail.confirmedAt).toLocaleString()}</dd></>) : null}
              </dl>
              <div>
                <p className={fieldLabel}>Emails from admins</p>
                {detail.emails.length ? (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {detail.emails.map((m, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{m.kind === "reminder" ? "Payment link" : m.subject}{m.status === "failed" ? <span className="ml-1 text-destructive">(failed)</span> : null}</span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtAgo(m.sentAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-sm text-muted-foreground">None yet.</p>}
              </div>
              <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                <p className={fieldLabel}>HME miner (class fee waived)</p>
                <p className="text-xs text-muted-foreground">
                  {detail.minerMark === true ? "Marked as a miner by an admin." : detail.minerMark === false ? "Marked as not a miner by an admin." : "No admin mark: Seeds asks Honest.Money for mining hash power when they check out."}
                  {minerCheck ? ` Check now: ${minerCheck}.` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy === "miner"} onClick={async () => {
                    setBusy("miner"); setMinerCheck(null);
                    try { const r = await checkMiner({ data: { userId: detail.userId } }); setMinerCheck(`${r.status === "miner" ? "miner" : r.status === "not_miner" ? "not a miner" : "couldn't tell"} (${r.source === "admin" ? "admin mark" : r.source === "honest-money" ? "Honest.Money" : "no answer"})`); }
                    catch (e) { setMinerCheck((e as Error).message); } finally { setBusy(null); }
                  }}>Check now</Button>
                  {([[true, "Mark miner"], [false, "Mark not a miner"], [null, "Clear mark"]] as const).map(([v, label]) => (
                    <Button key={label} size="sm" variant="ghost" disabled={busy === "miner" || detail.minerMark === v} onClick={async () => {
                      setBusy("miner");
                      try { await markMiner({ data: { userId: detail.userId, isMiner: v } }); setDetail({ ...detail, minerMark: v }); await reload(); }
                      finally { setBusy(null); }
                    }}>{label}</Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">A mark changes the price of their next checkout only. Seats already paid keep what was paid.</p>
              </div>
              {detail.status !== "canceled" && d && d.classes.length > 1 ? (
                <label className="block text-sm">
                  <span className={fieldLabel}>Move seat to another class</span>
                  <select className={`${inputCls} mt-1`} value={detail.classId ?? ""} disabled={busy === "move"} onChange={async (e) => {
                    const to = e.target.value;
                    const name = className.get(to);
                    if (!to || to === detail.classId || !window.confirm(`Move ${detail.fullName}'s seat to ${name}? What they paid stays the same.`)) return;
                    setBusy("move");
                    try { const r = await move({ data: { id: detail.id, classId: to } }); setNotice({ tone: "ok", text: `${detail.fullName} moved to ${r.className}.` }); setDetail({ ...detail, classId: to }); await reload(); }
                    catch (err) { setNotice({ tone: "error", text: (err as Error).message }); }
                    finally { setBusy(null); }
                  }}>
                    {d.classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.dates}{c.status === "draft" ? " (draft)" : ""}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setCompose([detail]); setDetail(null); }}><Mail /> Email {detail.fullName.split(" ")[0]}</Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Composer({ recipients, onClose, onSend }: { recipients: AdminIgniteRow[] | null; onClose: () => void; onSend: (subject: string, body: string) => Promise<void> }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const problems = validateMessage({ subject, body });
  const open = !!recipients;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problems.subject || problems.body || !recipients) return;
    setSending(true);
    setErr(null);
    try {
      await onSend(subject, body);
      setSubject(""); setBody(""); setTried(false);
    } catch (e2) {
      setErr((e2 as Error).message || "Couldn't send. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Email {recipients?.length === 1 ? recipients[0]!.fullName : `${recipients?.length ?? 0} registrants`}</DialogTitle>
          <DialogDescription>
            Goes to the email they registered with, from Seeds &lt;no-reply@seeds.honest.money&gt;. Replies go to support@honest.money.
          </DialogDescription>
        </DialogHeader>
        {recipients && recipients.length > 1 ? (
          <p className="max-h-16 overflow-y-auto rounded-sm border border-border bg-background px-3 py-2 text-xs text-muted-foreground">{recipients.map((r) => r.fullName).join(", ")}</p>
        ) : null}
        <form className="space-y-3" onSubmit={submit}>
          <label className="block">
            <span className={fieldLabel}>Subject</span>
            <input className={`${inputCls} mt-1`} value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} placeholder="Your Zoom link for Monday" />
            {tried && problems.subject ? <span className="mt-1 block text-xs text-destructive">{problems.subject}</span> : null}
          </label>
          <label className="block">
            <span className={fieldLabel}>Message</span>
            <textarea className={`${inputCls} mt-1 min-h-40`} value={body} maxLength={BODY_MAX + 200} onChange={(e) => setBody(e.target.value)} placeholder={"Hi {first},\n\nHere's everything you need for Monday…"} />
            <span className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>Type {"{first}"} to greet each person by first name. Leave a blank line between paragraphs.</span>
              <span>{body.length.toLocaleString()}/{BODY_MAX.toLocaleString()}</span>
            </span>
            {tried && problems.body ? <span className="mt-1 block text-xs text-destructive">{problems.body}</span> : null}
          </label>
          {err ? <Note tone="error">{err}</Note> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button type="submit" disabled={sending}><Send /> {sending ? "Sending…" : `Send to ${recipients?.length ?? 0}`}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
