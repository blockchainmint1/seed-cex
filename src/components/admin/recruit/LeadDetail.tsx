import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Note, fieldLabel, inputCls } from "@/components/account/ui";
import { Loading } from "@/components/admin/ui";
import {
  draftRecruitMessage, getRecruitLead, markRecruitMessage, refreshRecruitLead, saveRecruitMessage, updateRecruitLead,
} from "@/lib/recruit/recruit.functions";
import { CHANNELS, CHANNEL_LABEL, CHANNEL_MAX, SOURCE_LABEL, STAGES, STAGE_INFO, canMoveStage, outreachProblems, type Channel, type Source, type Stage } from "@/lib/recruit/recruit-rules";
import { fmtAgo, fmtTime } from "@/lib/format";
import { ContactIcons, GradePill, money } from "./bits";

type Detail = Awaited<ReturnType<typeof getRecruitLead>>;

export function LeadDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const load = useServerFn(getRecruitLead);
  const q = useQuery({ queryKey: ["recruit-lead", id], queryFn: () => load({ data: { id: id! } }), enabled: !!id });
  return (
    <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {q.isPending ? <div className="p-2"><Loading /></div> : q.error ? <Note tone="error">Couldn't load this lead. Close and try again.</Note> : q.data ? <Body d={q.data} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function useRefresh(id: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["recruit-lead", id] }),
    qc.invalidateQueries({ queryKey: ["recruit-leads"] }),
    qc.invalidateQueries({ queryKey: ["recruit-overview"] }),
  ]);
}

function Body({ d }: { d: Detail }) {
  const l = d.lead;
  const refresh = useRefresh(l.id);
  const update = useServerFn(updateRecruitLead);
  const rescore = useServerFn(refreshRecruitLead);
  const [busy, setBusy] = useState(false);

  async function move(stage: Stage) {
    setBusy(true);
    try { await update({ data: { id: l.id, stage } }); toast.success(`Moved to ${STAGE_INFO[stage].label}`); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't move it."); }
    finally { setBusy(false); }
  }
  async function reread() {
    setBusy(true);
    try { const r = await rescore({ data: { id: l.id } }); toast.success(`Updated from CoinMarketCap: score ${r.score}`); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't refresh it."); }
    finally { setBusy(false); }
  }

  const next = STAGES.filter((s) => canMoveStage(l.stage as Stage, s));
  return (
    <div className="space-y-6">
      <SheetHeader className="text-left">
        <SheetTitle className="flex flex-wrap items-center gap-2 font-display text-xl">
          {l.name} <span className="font-mono text-sm text-muted-foreground">{l.symbol}</span> <GradePill score={l.score} />
        </SheetTitle>
        <SheetDescription>
          {STAGE_INFO[l.stage as Stage].label} · found via {SOURCE_LABEL[l.source as Source]}{l.source_detail ? ` (${l.source_detail})` : ""} · {fmtAgo(l.created_at)}
        </SheetDescription>
      </SheetHeader>

      {d.application ? <Note tone="ok">They applied on /list ({d.application.package} package, status: {d.application.status}) {fmtAgo(d.application.created_at)}. See Admin → Listings.</Note> : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Traded 24h" value={money(l.volume_24h_usd)} />
        <Fact label="Market size" value={money(l.market_cap_usd)} />
        <Fact label="Markets elsewhere" value={l.num_market_pairs == null ? "—" : String(l.num_market_pairs)} />
        <Fact label="Network" value={l.chain ?? (l.cmc_id && !l.contract ? "Own chain" : "—")} />
      </section>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ContactIcons website={l.website} twitter={l.twitter} telegram={l.telegram} email={l.email} />
        {l.cmc_slug ? <a href={`https://coinmarketcap.com/currencies/${l.cmc_slug}/`} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 hover:text-primary">CoinMarketCap <ExternalLink className="h-3 w-3" /></a> : null}
        {l.facts_at ? <span>Numbers from {fmtAgo(l.facts_at)}</span> : null}
        {l.cmc_id ? <Button size="sm" variant="ghost" disabled={busy} onClick={reread}><RefreshCw /> Refresh numbers</Button> : null}
      </div>

      <section>
        <h4 className={fieldLabel}>Why it scored {l.score}</h4>
        <ul className="mt-2 space-y-1 text-sm">
          {l.score_reasons.map((r, i) => (
            <li key={i} className="flex gap-2"><span className={`w-8 shrink-0 text-right font-mono text-xs ${r.points ? "text-primary" : "text-muted-foreground"}`}>+{r.points}</span><span>{r.text}</span></li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">Seeds works the score out from the numbers above. The AI doesn't set it.</p>
      </section>

      <section>
        <h4 className={fieldLabel}>Move to</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {next.length ? next.map((s) => (
            <Button key={s} size="sm" variant={["passed", "declined", "dead"].includes(s) ? "ghost" : "outline"} disabled={busy} onClick={() => move(s)} title={STAGE_INFO[s].hint}>{STAGE_INFO[s].label}</Button>
          )) : <p className="text-sm text-muted-foreground">This lead is finished.</p>}
        </div>
      </section>

      <Messages d={d} />
      <EditForm d={d} />

      <section>
        <h4 className={fieldLabel}>History</h4>
        <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
          {d.events.map((e) => (
            <li key={e.id}>{fmtTime(e.created_at)} · {d.names[e.actor ?? ""] ?? "Seeds"} · {describe(e.kind, e.detail as Record<string, unknown>)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function describe(kind: string, d: Record<string, unknown>) {
  if (kind === "stage") return `moved ${String(d.from)} → ${String(d.to)}`;
  if (kind === "found") return `found (${String(d.source ?? "")}${d.exchange ? `, ${String(d.exchange)}` : d.from ? `, ${String(d.from)}` : ""})`;
  if (kind === "draft") return `${d.ai ? "AI drafted" : "wrote"} a ${CHANNEL_LABEL[(d.channel as Channel) ?? "other"]} message`;
  if (kind === "sent") return `sent a ${CHANNEL_LABEL[(d.channel as Channel) ?? "other"]} message`;
  if (kind === "edit") return `edited ${(d.fields as string[] | undefined)?.join(", ") ?? ""}`;
  if (kind === "rescored") return `refreshed numbers: score ${String(d.from)} → ${String(d.to)}`;
  if (kind === "discarded") return "binned a draft";
  return kind;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2">
      <div className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{label}</div>
      <div className="mt-0.5 font-display text-sm font-bold">{value}</div>
    </div>
  );
}

function Messages({ d }: { d: Detail }) {
  const l = d.lead;
  const refresh = useRefresh(l.id);
  const draft = useServerFn(draftRecruitMessage);
  const save = useServerFn(saveRecruitMessage);
  const [channel, setChannel] = useState<Channel>(l.telegram ? "telegram" : l.email ? "email" : "x");
  const [angle, setAngle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function writeAi() {
    setBusy(true); setErr(null);
    try {
      const r = await draft({ data: { id: l.id, channel, ...(angle.trim() ? { angle: angle.trim() } : {}) } });
      if (!r.ok) setErr(r.error); else { toast.success("Draft ready. Read it, edit it, then send it yourself."); await refresh(); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't write a draft."); }
    finally { setBusy(false); }
  }
  async function blank() {
    setBusy(true); setErr(null);
    try { await save({ data: { leadId: l.id, channel, subject: null, body: "Hi team," } }); await refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't start a message."); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-3">
      <h4 className={fieldLabel}>Outreach</h4>
      <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={inputCls} aria-label="Channel">
          {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </select>
        <input value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={300} className={inputCls} placeholder="Optional angle, e.g. “mention our AI baskets” or “they just left MEXC”" />
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button size="sm" disabled={busy} onClick={writeAi}><Sparkles /> {busy ? "Writing…" : "Write with AI"}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={blank}>Type my own</Button>
        </div>
        <p className="text-[11px] text-muted-foreground sm:col-span-2">Seeds never sends these. Copy the message, send it from your own Telegram, X or email, then press “I sent it”.</p>
        {err ? <div className="sm:col-span-2"><Note tone="error">{err}</Note></div> : null}
      </div>
      {d.messages.map((m) => <MessageCard key={m.id} m={m} leadId={l.id} names={d.names} />)}
    </section>
  );
}

function MessageCard({ m, leadId, names }: { m: Detail["messages"][number]; leadId: string; names: Record<string, string> }) {
  const refresh = useRefresh(leadId);
  const save = useServerFn(saveRecruitMessage);
  const mark = useServerFn(markRecruitMessage);
  const [subject, setSubject] = useState(m.subject ?? "");
  const [body, setBody] = useState(m.body);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSubject(m.subject ?? ""); setBody(m.body); }, [m.subject, m.body]);
  const ch = m.channel as Channel;
  const dirty = subject !== (m.subject ?? "") || body !== m.body;
  const problems = outreachProblems((ch === "email" && subject ? `${subject}\n` : "") + body, ch);
  const draft = m.status === "draft";

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "That didn't work."); }
    finally { setBusy(false); }
  }
  const copy = async () => {
    await navigator.clipboard.writeText(ch === "email" && subject ? `Subject: ${subject}\n\n${body}` : body);
    toast.success("Copied");
  };

  return (
    <div className={`rounded-md border p-3 ${draft ? "border-border" : "border-border/50 opacity-80"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <span>{CHANNEL_LABEL[ch]} · {m.ai_written ? "AI draft" : "typed"} by {names[m.created_by] ?? "admin"} · {fmtAgo(m.created_at)}</span>
        <span className={m.status === "sent" ? "text-primary" : ""}>{m.status === "sent" ? `Sent by ${names[m.sent_by ?? ""] ?? "admin"} ${fmtAgo(m.sent_at!)}` : m.status === "discarded" ? "Binned" : `${body.length} / ${CHANNEL_MAX[ch]}`}</span>
      </div>
      {ch === "email" ? <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!draft} maxLength={200} className={`${inputCls} mt-2`} placeholder="Subject" /> : null}
      <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!draft} rows={Math.min(14, Math.max(5, body.split("\n").length + 1))} className={`${inputCls} mt-2 font-sans`} />
      {draft && problems.length ? <div className="mt-2"><Note tone="warn">{problems.join(" ")}</Note></div> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copy}><Copy /> Copy</Button>
        {draft ? (
          <>
            {dirty ? <Button size="sm" variant="outline" disabled={busy || !body.trim()} onClick={() => run(() => save({ data: { leadId, id: m.id, channel: ch, subject: subject || null, body } }), "Saved")}>Save changes</Button> : null}
            <Button size="sm" disabled={busy || dirty || problems.length > 0} onClick={() => run(() => mark({ data: { id: m.id, action: "sent" } }), "Marked as sent")} title={dirty ? "Save your changes first" : undefined}>I sent it</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => mark({ data: { id: m.id, action: "discard" } }), "Binned")}>Bin it</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function EditForm({ d }: { d: Detail }) {
  const l = d.lead;
  const refresh = useRefresh(l.id);
  const update = useServerFn(updateRecruitLead);
  const init = { contact_name: l.contact_name ?? "", email: l.email ?? "", website: l.website ?? "", twitter: l.twitter ?? "", telegram: l.telegram ?? "", discord: l.discord ?? "", finder: l.finder ?? "", notes: l.notes ?? "" };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(init), [l.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dirty = (Object.keys(f) as (keyof typeof f)[]).some((k) => f[k] !== init[k]);
  async function submit() {
    setBusy(true);
    try {
      const n = (v: string) => (v.trim() ? v.trim() : null);
      await update({ data: { id: l.id, contact_name: n(f.contact_name), email: n(f.email), website: n(f.website), twitter: n(f.twitter), telegram: n(f.telegram), discord: n(f.discord), finder: n(f.finder), notes: n(f.notes) } });
      toast.success("Saved"); await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  }
  const row = (k: keyof typeof f, label: string, ph = "") => (
    <label className="grid gap-1 text-xs text-muted-foreground">{label}<input value={f[k]} onChange={set(k)} className={inputCls} placeholder={ph} /></label>
  );
  return (
    <section className="space-y-3">
      <h4 className={fieldLabel}>Contacts and notes</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {row("contact_name", "Person to talk to", "e.g. founder's first name")}
        {row("email", "Email", "team@coin.io")}
        {row("website", "Website")}
        {row("twitter", "X account", "https://x.com/…")}
        {row("telegram", "Telegram", "https://t.me/…")}
        {row("discord", "Discord")}
        {row("finder", "Brought in by", "creator, listing agent or affiliate (for the 20% finder's fee)")}
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">Private notes<textarea value={f.notes} onChange={set("notes")} rows={3} maxLength={4000} className={inputCls} placeholder="What you know about them. The AI reads this for context but won't quote it." /></label>
      <Button size="sm" variant="outline" disabled={busy || !dirty} onClick={submit}>Save contacts and notes</Button>
    </section>
  );
}
