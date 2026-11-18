import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Plus, Search, Trash2, Undo2, X } from "lucide-react";
import { getWithdrawalSettings, saveWithdrawalTiers, setWithdrawalOverride, type LimitMemberRow } from "@/lib/admin-settings.functions";
import { DEFAULT_TIERS, MAX_TIERS, tiersProblem, type WithdrawTier } from "@/lib/withdraw-limits";
import { pageOf } from "@/lib/admin-accounts";
import { Card, Note, TabTitle, fieldLabel, inputCls } from "@/components/account/ui";
import { Loading, Pager, SortHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Settings — Seeds admin" },
      { name: "description", content: "Set Seeds withdrawal levels: low limits for new members that rise as they build history, plus per-member changes." },
      { property: "og:title", content: "Settings — Seeds admin" },
      { property: "og:description", content: "Withdrawal levels and per-member limits for Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminSettingsPage,
});

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const PAGE_SIZES = [25, 50, 100] as const;
type Key = "name" | "level" | "days" | "withdrawals" | "withdrawn" | "trades";
const FILTERS = [
  { v: "all", label: "Everyone" },
  { v: "admin", label: "Set by admin" },
  { v: "paused", label: "Paused" },
] as const;

function AdminSettingsPage() {
  const load = useServerFn(getWithdrawalSettings);
  const q = useQuery({ queryKey: ["admin-withdraw-settings"], queryFn: () => load(), retry: false });
  const d = q.data;
  return (
    <div className="space-y-5">
      <TabTitle title="Settings" desc="Withdrawal limits. New members start low, and their limits rise on their own as they build history on Seeds." />
      {q.isPending ? <Loading /> : q.error || !d ? <p role="alert" className="text-sm text-destructive">Couldn't load settings. Refresh to retry.</p> : (
        <>
          <Note tone="info">
            These limits cover <b>PulseChain withdrawals (PLS and pHEX)</b>, the only time Seeds sends coins out of a member's pocket for them.
            Other coins leave through HME Wallet, which Seeds can't limit.{" "}
            {d.pilotAdminOnly ? <>Right now only admins can withdraw while the first real-money tests run, so these levels apply to admins only for now.</> : null}
          </Note>
          <TierEditor tiers={d.tiers} members={d.members} maxWaiting={d.maxWaiting} />
          <MemberLimits members={d.members} tiers={d.tiers} me={d.me} />
          <Card title="History" desc="Every change to levels or a member's limits, newest first.">
            {d.history.length === 0 ? <p className="text-sm text-muted-foreground">No changes yet.</p> : (
              <ul className="space-y-2 text-sm">
                {d.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span>
                      <span className="font-semibold">{h.actorName}</span> {h.text}
                      {h.targetName ? <> <span className="font-semibold">{h.targetName}</span></> : null}
                      {h.note ? <span className="text-muted-foreground"> — "{h.note}"</span> : null}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{fmtAgo(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

type NumField = "perWithdrawalUsd" | "dailyUsd" | "holdHours" | "minAccountDays" | "minWithdrawals" | "minWithdrawnUsd" | "minTrades";
const LIMIT_COLS: { k: NumField; label: string; prefix?: string }[] = [
  { k: "perWithdrawalUsd", label: "Each", prefix: "$" },
  { k: "dailyUsd", label: "Per day", prefix: "$" },
  { k: "holdHours", label: "Wait (hrs)" },
];
const NEED_COLS: { k: NumField; label: string; prefix?: string }[] = [
  { k: "minAccountDays", label: "Days on Seeds" },
  { k: "minWithdrawals", label: "Withdrawals done" },
  { k: "minWithdrawnUsd", label: "Withdrawn", prefix: "$" },
  { k: "minTrades", label: "Trades done" },
];

function TierEditor({ tiers, members, maxWaiting }: { tiers: WithdrawTier[]; members: LimitMemberRow[]; maxWaiting: number }) {
  const qc = useQueryClient();
  const save = useServerFn(saveWithdrawalTiers);
  const [draft, setDraft] = useState<WithdrawTier[]>(tiers);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  useEffect(() => setDraft(tiers), [tiers]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(tiers);
  const problem = tiersProblem(draft);
  const count = (lvl: number) => members.filter((m) => m.level === lvl).length;

  const setNum = (i: number, k: NumField, raw: string) =>
    setDraft((list) => list.map((t, j) => (j === i ? { ...t, [k]: raw === "" ? 0 : Number(raw) } : t)));
  const add = () => setDraft((list) => {
    const last = list[list.length - 1];
    return [...list, { ...last, level: list.length + 1, name: `Level ${list.length + 1}`, minAccountDays: Math.max(1, last.minAccountDays) }];
  });
  const remove = (i: number) => setDraft((list) => list.filter((_, j) => j !== i).map((t, j) => ({ ...t, level: j + 1 })));

  async function onSave() {
    setBusy(true); setNotice(null);
    try {
      await save({ data: { tiers: draft } });
      setNotice({ tone: "ok", text: "Levels saved. Members' limits changed right away; withdrawals already waiting keep the limits they were asked under." });
      await qc.invalidateQueries({ queryKey: ["admin-withdraw-settings"] });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally { setBusy(false); }
  }

  // Table inputs get fixed widths (inputCls is full-width, which collapses inside table cells).
  const box = "rounded-sm border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary";
  const cell = `${box} w-24 text-right num`;
  return (
    <section className="min-w-0 rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold">Withdrawal levels</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Everyone starts on level 1. A member moves up on their own once they meet <b>every</b> requirement for the next level.
            The "per day" limit counts the last 24 hours. Up to {maxWaiting} withdrawals can wait at once.
          </p>
        </div>
      </header>
      <div className="relative overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="label-caps text-muted-foreground">
            <tr>
              <th className="px-3 pt-2.5 text-left font-normal" colSpan={2}></th>
              <th className="border-l border-border px-3 pt-2.5 text-left font-normal" colSpan={3}>Limits</th>
              <th className="border-l border-border px-3 pt-2.5 text-left font-normal" colSpan={4}>To reach this level</th>
              <th colSpan={2}></th>
            </tr>
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 text-left font-normal">#</th>
              <th scope="col" className="px-3 py-2 text-left font-normal">Name</th>
              {LIMIT_COLS.map((c, i) => <th key={c.k} scope="col" className={`px-3 py-2 text-right font-normal ${i === 0 ? "border-l border-border" : ""}`}>{c.label}</th>)}
              {NEED_COLS.map((c, i) => <th key={c.k} scope="col" className={`px-3 py-2 text-right font-normal ${i === 0 ? "border-l border-border" : ""}`}>{c.label}</th>)}
              <th scope="col" className="px-3 py-2 text-right font-normal">Members</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.map((t, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{t.level}</td>
                <td className="px-3 py-2">
                  <input aria-label={`Level ${t.level} name`} className={`${box} w-32`} value={t.name} maxLength={40}
                    onChange={(e) => setDraft((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </td>
                {LIMIT_COLS.map((c, ci) => (
                  <td key={c.k} className={`px-3 py-2 text-right ${ci === 0 ? "border-l border-border" : ""}`}>
                    <NumInput label={`Level ${t.level} ${c.label}`} prefix={c.prefix} value={t[c.k]} onChange={(v) => setNum(i, c.k, v)} cls={cell} />
                  </td>
                ))}
                {NEED_COLS.map((c, ci) => (
                  <td key={c.k} className={`px-3 py-2 text-right ${ci === 0 ? "border-l border-border" : ""}`}>
                    {i === 0
                      ? <span className="text-xs text-muted-foreground">{ci === 0 ? "everyone starts here" : ""}</span>
                      : <NumInput label={`Level ${t.level} ${c.label}`} prefix={c.prefix} value={t[c.k]} onChange={(v) => setNum(i, c.k, v)} cls={cell} />}
                  </td>
                ))}
                <td className="px-3 py-2 text-right num text-muted-foreground">{count(t.level)}</td>
                <td className="px-3 py-2 text-right">
                  {i > 0 && i === draft.length - 1 ? (
                    <button type="button" aria-label={`Remove level ${t.level}`} onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 border-t border-border px-5 py-3.5">
        {dirty && problem ? <Note tone="error">{problem}</Note> : null}
        {notice ? <Note tone={notice.tone}>{notice.text}</Note> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onSave} disabled={!dirty || !!problem || busy}>{busy ? "Saving…" : "Save levels"}</Button>
          <Button size="sm" variant="outline" onClick={() => { setDraft(tiers); setNotice(null); }} disabled={!dirty || busy}><Undo2 /> Undo changes</Button>
          <Button size="sm" variant="outline" onClick={add} disabled={draft.length >= MAX_TIERS || busy}><Plus /> Add level</Button>
          <button type="button" className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setDraft(DEFAULT_TIERS)}>
            Fill in the starting levels
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Raising a level's requirements can move members down; lowering them moves members up. Withdrawals already waiting aren't affected.</p>
      </div>
    </section>
  );
}

function NumInput({ label, value, onChange, prefix, cls }: { label: string; value: number; onChange: (v: string) => void; prefix?: string; cls: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {prefix ? <span className="text-xs text-muted-foreground">{prefix}</span> : null}
      <input aria-label={label} className={cls} inputMode="decimal" type="number" min={0} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

function MemberLimits({ members, tiers, me }: { members: LimitMemberRow[]; tiers: WithdrawTier[]; me: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>("all");
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "level", dir: "desc" });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [editing, setEditing] = useState<LimitMemberRow | null>(null);

  const matched = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = members.filter((m) =>
      (!s || m.name.toLowerCase().includes(s) || (m.hmMemberId ?? "").toLowerCase().includes(s) || m.id.startsWith(s))
      && (filter === "all" || (filter === "admin" ? m.source === "admin" : m.frozen)));
    const sign = sort.dir === "asc" ? 1 : -1;
    const val = (m: LimitMemberRow): string | number => ({
      name: m.name.toLowerCase(), level: m.frozen ? -1 : m.level, days: m.history.accountDays,
      withdrawals: m.history.withdrawals, withdrawn: m.history.withdrawnUsd, trades: m.history.trades,
    })[sort.key];
    return [...list].sort((a, b) => (val(a) < val(b) ? -sign : val(a) > val(b) ? sign : a.name.localeCompare(b.name)));
  }, [members, search, filter, sort]);
  const view = pageOf(matched, page, size);
  const onSort = (k: Key) => { setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" })); setPage(0); };
  const H = (label: string, k: Key, align: "left" | "right" = "right") => <SortHeader label={label} k={k} sort={sort} onSort={onSort} align={align} />;

  return (
    <section className="min-w-0 rounded-md border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h3 className="font-display text-base font-bold">Member limits · {matched.length}{matched.length !== members.length ? ` of ${members.length}` : ""}</h3>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search members</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input className={`${inputCls} py-1.5 pr-8 pl-8`} placeholder="Name, member id or user id" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            {search ? (
              <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setPage(0); }}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            ) : null}
          </label>
          <div role="group" aria-label="Show" className="flex rounded-sm border border-border p-0.5">
            {FILTERS.map((f) => (
              <button key={f.v} type="button" aria-pressed={filter === f.v} onClick={() => { setFilter(f.v); setPage(0); }}
                className={`rounded-sm px-2.5 py-1 text-xs ${filter === f.v ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="relative overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="label-caps text-muted-foreground">
            <tr className="border-b border-border">
              {H("Name", "name", "left")}
              {H("Level", "level", "left")}
              <th scope="col" className="px-3 py-2 text-right font-normal">Each / per day</th>
              {H("Days", "days")}
              {H("Withdrawals", "withdrawals")}
              {H("Withdrawn", "withdrawn")}
              {H("Trades", "trades")}
              <th scope="col" className="px-3 py-2"><span className="sr-only">Change</span></th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((m) => (
              <tr key={m.id} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-semibold">{m.name}{m.id === me ? <span className="ml-2 font-mono text-[10px] text-muted-foreground uppercase">you</span> : null}</td>
                <td className="px-3 py-2">
                  {m.frozen ? <span className="mr-1.5 rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] text-destructive uppercase">paused</span> : null}
                  <span>{m.level} · {m.levelName}</span>
                  {m.source === "admin" ? <span className="ml-1.5 rounded-sm bg-warn/15 px-1.5 py-0.5 font-mono text-[10px] text-foreground uppercase" title={m.note ?? undefined}>set by admin</span> : null}
                </td>
                <td className="px-3 py-2 text-right num text-muted-foreground">{m.frozen ? "—" : `${usd(m.perWithdrawalUsd)} / ${usd(m.dailyUsd)}`}</td>
                <td className="px-3 py-2 text-right num">{m.history.accountDays}</td>
                <td className="px-3 py-2 text-right num">{m.history.withdrawals}</td>
                <td className="px-3 py-2 text-right num">{usd(m.history.withdrawnUsd)}</td>
                <td className="px-3 py-2 text-right num">{m.history.trades}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" disabled={m.id === me} title={m.id === me ? "You can't change your own limits. Ask another admin." : undefined} onClick={() => setEditing(m)}>Change</Button>
                </td>
              </tr>
            ))}
            {view.rows.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-muted-foreground">No one matches.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <Pager page={view.page} pages={view.pages} from={view.from} to={view.to} total={matched.length} size={size} sizes={PAGE_SIZES}
        onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} />
      <EditDialog member={editing} tiers={tiers} onClose={() => setEditing(null)} />
    </section>
  );
}

function EditDialog({ member, tiers, onClose }: { member: LimitMemberRow | null; tiers: WithdrawTier[]; onClose: () => void }) {
  const qc = useQueryClient();
  const change = useServerFn(setWithdrawalOverride);
  const [level, setLevel] = useState<string>("auto");
  const [frozen, setFrozen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!member) return;
    setLevel(member.source === "admin" ? String(member.level) : "auto");
    setFrozen(member.frozen); setNote(member.note ?? ""); setErr(null);
  }, [member]);

  if (!member) return null;
  const isAuto = level === "auto" && !frozen;
  const noteOk = note.trim().length >= 3;

  async function submit(clear: boolean) {
    setBusy(true); setErr(null);
    try {
      await change({ data: { userId: member!.id, clear, level: clear || level === "auto" ? null : Number(level), frozen: clear ? false : frozen, note: note.trim() } });
      await qc.invalidateQueries({ queryKey: ["admin-withdraw-settings"] });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdrawal limits for {member.name}</DialogTitle>
          <DialogDescription>
            {member.history.accountDays} days on Seeds · {member.history.withdrawals} withdrawals ({usd(member.history.withdrawnUsd)}) · {member.history.trades} trades.
            We'll email them about the change.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block">
            <span className={fieldLabel}>Level</span>
            <select className={`${inputCls} mt-1`} value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="auto">Automatic — moves up with their history</option>
              {tiers.map((t) => <option key={t.level} value={t.level}>{t.level} · {t.name} — {usd(t.perWithdrawalUsd)} each, {usd(t.dailyUsd)} a day</option>)}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">A set level stays put (up or down) until you switch them back to automatic.</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--destructive)]" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
            <span>
              <span className="flex items-center gap-1.5 text-sm"><Pause className="h-3.5 w-3.5" /> Pause all withdrawals</span>
              <span className="block text-xs text-muted-foreground">Blocks new withdrawals and stops any that are still waiting from being sent.</span>
            </span>
          </label>
          <label className="block">
            <span className={fieldLabel}>Note (required, members don't see it)</span>
            <textarea className={`${inputCls} mt-1 min-h-[4.5rem]`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, e.g. 'Known OG member, verified by phone'" />
          </label>
          {err ? <Note tone="error">{err}</Note> : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {member.source === "admin" || member.frozen ? (
            <Button variant="outline" disabled={busy} onClick={() => submit(true)}>Back to automatic</Button>
          ) : <span />}
          <Button disabled={busy || isAuto || !noteOk} onClick={() => submit(false)}>{busy ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
