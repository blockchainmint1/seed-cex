import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminAffiliateTsd, getAdminAffiliates, getAdminNewMembers } from "@/lib/affiliates.functions";
import { getAdminTsdBalances } from "@/lib/admin-members.functions";
import { AFFILIATE_PERIODS, DEFAULT_PERIOD, type AffiliatePeriod, type AffiliateSort } from "@/lib/affiliates";
import { ChevronRight, Search, X } from "lucide-react";
import { Note, TabTitle } from "@/components/account/ui";
import { Loading, Panel, SortHeader, Stat } from "@/components/admin/ui";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/affiliates")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Affiliates — Seeds admin" },
      { name: "description", content: "Who is sharing Seeds invite links, the new members they bring in, how much those members trade and how much TSD they hold." },
      { property: "og:title", content: "Affiliates — Seeds admin" },
      { property: "og:description", content: "Invite links, new members, their trading and TSD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminAffiliates,
});

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 })}`;
const num = (n: number) => n.toLocaleString("en-US");
const tsd = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const SOURCE: Record<string, string> = { sso: "Honest.Money sign-up", attach: "Joined Honest.Money later", after_signup: "Invite link", ignite: "Ignite sign-up" };

function AdminAffiliates() {
  const [days, setDays] = useState<AffiliatePeriod>(DEFAULT_PERIOD);
  const load = useServerFn(getAdminAffiliates);
  const q = useQuery({ queryKey: ["admin-affiliates", days], queryFn: () => load({ data: { days } }), retry: false, placeholderData: keepPreviousData, refetchInterval: 60_000 });

  return (
    <div className="space-y-6">
      <TabTitle
        title="Affiliates"
        desc="Who is sharing their Seeds invite link, the new members it brings in, and what those members do here. Honest.Money keeps the official referral credit; these are Seeds’ own counts."
        right={
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as AffiliatePeriod)} aria-label="Period" className="rounded-sm border border-border bg-background px-2 py-1.5 text-sm">
            {AFFILIATE_PERIODS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        }
      />
      {q.isPending ? <Loading /> : q.error ? <Note tone="error">{(q.error as Error).message}</Note> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={`New members · ${days}d`} value={num(q.data.totals.membersPeriod)} />
            <Stat label={`Referred · ${days}d`} value={num(q.data.totals.referredPeriod)} tone="good" />
            <Stat label={`Invite clicks · ${days}d`} value={num(q.data.totals.clicksPeriod)} />
            <Stat label={`Members sharing · ${days}d`} value={num(q.data.totals.sharingPeriod)} />
            <Stat label="Members, all time" value={num(q.data.totals.membersAll)} />
            <Stat label="Referred, all time" value={num(q.data.totals.referredAll)} />
            <Stat label="Opened their invite link" value={num(q.data.totals.linksOpened)} />
            <Stat label="Ignite seats paid via a code" value={num(q.data.totals.ignitePaidByRef)} />
          </div>
          <JoinChart series={q.data.series} />
          <AffiliateTable rows={q.data.affiliates} days={days} newMembers={q.data.totals.membersPeriod} />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Open a row to see the members that code brought in (all time). A sign-up counts as referred when the member joins Seeds with someone’s code within 7 days (first code wins). Clicks count people opening seeds.honest.money/invite/… links — link previews and repeat clicks within 10 minutes don’t count. Traded = exchange trades (called-off matches left out); swapped = finished swaps. TSD is read live from each member’s trading pocket.
      </p>
    </div>
  );
}

function JoinChart({ series }: { series: { day: string; total: number; referred: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.total));
  return (
    <Panel title="New members per day" right={<span className="flex items-center gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" /> referred</span><span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-muted-foreground/40" /> other</span></span>}>
      <div className="flex h-36 min-w-[36rem] items-end gap-[2px] px-4 py-3">
        {series.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.total} new, ${d.referred} referred`} className="flex h-full flex-1 flex-col justify-end">
            <div className="w-full rounded-t-[2px] bg-muted-foreground/40" style={{ height: `${(Math.max(0, d.total - d.referred) / max) * 100}%` }} />
            <div className="w-full bg-primary" style={{ height: `${(Math.min(d.referred, d.total || d.referred) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="flex min-w-[36rem] justify-between px-4 pb-2 font-mono text-[10px] text-muted-foreground">
        <span>{series[0]?.day}</span><span>{series.at(-1)?.day}</span>
      </div>
    </Panel>
  );
}

type Row = Awaited<ReturnType<typeof getAdminAffiliates>>["affiliates"][number];
type ColKey = "name" | AffiliateSort | "tsd";
const EVERYONE = "__everyone__";

function AffiliateTable({ rows, days, newMembers }: { rows: Row[]; days: number; newMembers: number }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: ColKey; dir: "asc" | "desc" }>({ key: "signupsPeriod", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(50);

  // TSD for the busiest codes (server reads at most 100 codes / 200 members), independent of sort and search.
  const tsdCodes = useMemo(() => rows.filter((r) => r.signupsAll > 0).sort((a, b) => b.signupsAll - a.signupsAll).slice(0, 100).map((r) => r.code), [rows]);
  const loadTsd = useServerFn(getAdminAffiliateTsd);
  const tsdQ = useQuery({ queryKey: ["admin-affiliate-tsd", tsdCodes], queryFn: () => loadTsd({ data: { codes: tsdCodes } }), enabled: tsdCodes.length > 0, staleTime: 60_000, retry: false });
  const tsdOf = (r: Row) => (r.signupsAll === 0 ? null : tsdQ.data?.byCode[r.code.toLowerCase()] ?? (tsdQ.data ? 0 : null));

  const needle = search.trim().toLowerCase();
  const sorted = useMemo(() => {
    const label = (r: Row) => (r.ownerName ?? r.code).toLowerCase();
    const val = (r: Row): number | string => (sort.key === "name" ? label(r) : sort.key === "tsd" ? tsdOf(r) ?? -1 : r[sort.key]);
    const list = needle ? rows.filter((r) => r.code.toLowerCase().includes(needle) || (r.ownerName ?? "").toLowerCase().includes(needle)) : rows;
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return (sort.dir === "asc" ? c : -c) || a.code.localeCompare(b.code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort, needle, tsdQ.data]);
  const shown = sorted.slice(0, limit);

  const onSort = (k: ColKey) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" }));
  const toggle = (k: string) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const h = (label: string, k: ColKey, align: "left" | "right" = "right") => <SortHeader label={label} k={k} sort={sort} onSort={onSort} align={align} />;
  const COLS = 9;

  return (
    <Panel
      title={`Invite codes (${needle ? `${sorted.length} of ${rows.length}` : rows.length})`}
      right={
        <div className="flex flex-wrap items-center gap-3">
          {tsdQ.data?.partial ? <span className="text-xs text-warn">TSD shown for the newest 200 referred members</span> : null}
          <label className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(50); }}
              placeholder="Search code or member" aria-label="Search invite codes"
              className="w-56 rounded-sm border border-border bg-background py-1.5 pr-7 pl-7 text-sm"
            />
            {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-1.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button> : null}
          </label>
        </div>
      }
    >
      <table className="w-full min-w-[62rem] text-sm">
        <thead className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          <tr className="border-b border-border">
            {h("Member / code", "name", "left")}
            {h(`Clicks ${days}d`, "clicksPeriod")}
            {h(`Sign-ups ${days}d`, "signupsPeriod")}
            {h("Sign-ups all", "signupsAll")}
            {h("Active", "activeMembers")}
            {h("Traded", "tradedValue")}
            {h("Swapped", "swapUsd")}
            {h("TSD held", "tsd")}
            {h("Ignite paid", "ignitePaid")}
          </tr>
        </thead>
        <tbody>
          {!needle ? (
            <>
              <tr onClick={() => toggle(EVERYONE)} className="cursor-pointer border-b border-border bg-muted/20 hover:bg-muted/40">
                <td className="px-3 py-2">
                  <RowToggle open={open.has(EVERYONE)} label="everyone who joined" onToggle={() => toggle(EVERYONE)} />
                  <span className="font-semibold text-foreground">Everyone who joined</span>
                  <div className="pl-6 text-xs text-muted-foreground">With or without a code</div>
                </td>
                <td colSpan={COLS - 1} className="px-3 py-2 text-muted-foreground"><span className="num font-semibold text-foreground">{num(newMembers)}</span> new members in the last {days} days</td>
              </tr>
              {open.has(EVERYONE) ? <tr className="border-b border-border"><td colSpan={COLS} className="bg-muted/10 p-0"><MembersList days={days} code={null} /></td></tr> : null}
            </>
          ) : null}
          {shown.length === 0 ? (
            <tr><td colSpan={COLS} className="px-3 py-8 text-center text-muted-foreground">{needle ? "No code or member matches that search." : "No invite links used yet."}</td></tr>
          ) : shown.map((r) => {
            const on = open.has(r.code);
            const t = tsdOf(r);
            return (
              <Fragment key={r.code}>
                <tr onClick={() => toggle(r.code)} className={`cursor-pointer border-b border-border hover:bg-muted/40 ${on ? "bg-primary/10" : ""}`}>
                  <td className="px-3 py-2">
                    <RowToggle open={on} label={r.code} onToggle={() => toggle(r.code)} />
                    <span className="font-semibold text-foreground">{r.ownerName ?? (r.ownerId ? "Seeds member" : "Not on Seeds yet")}</span>
                    <div className="pl-6 font-mono text-xs text-muted-foreground">{r.code}{r.linkSeenAt ? ` · link opened ${fmtAgo(r.linkSeenAt)}` : ""}</div>
                  </td>
                  <td className="num px-3 py-2 text-right">{num(r.clicksPeriod)}<div className="text-xs text-muted-foreground">{num(r.clicksAll)} all</div></td>
                  <td className="num px-3 py-2 text-right font-semibold">{num(r.signupsPeriod)}</td>
                  <td className="num px-3 py-2 text-right">{num(r.signupsAll)}</td>
                  <td className="num px-3 py-2 text-right">{num(r.activeMembers)}</td>
                  <td className="num px-3 py-2 text-right">{usd(r.tradedValue)}<div className="text-xs text-muted-foreground">{num(r.trades)} trades</div></td>
                  <td className="num px-3 py-2 text-right">{usd(r.swapUsd)}<div className="text-xs text-muted-foreground">{num(r.swaps)} swaps</div></td>
                  <td className="num px-3 py-2 text-right">{r.signupsAll === 0 ? "—" : tsdQ.isPending ? "…" : tsd(t)}</td>
                  <td className="num px-3 py-2 text-right">{num(r.ignitePaid)}{r.igniteStarted > r.ignitePaid ? <div className="text-xs text-muted-foreground">{num(r.igniteStarted - r.ignitePaid)} unpaid</div> : null}</td>
                </tr>
                {on ? (
                  <tr className="border-b border-border">
                    <td colSpan={COLS} className="bg-muted/10 p-0">
                      {r.signupsAll === 0 ? <p className="px-6 py-3 text-sm text-muted-foreground">Nobody has joined with this code yet.</p> : <MembersList days={days} code={r.code} />}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {sorted.length > limit ? (
        <div className="border-t border-border px-4 py-2.5"><button type="button" onClick={() => setLimit(limit + 50)} className="text-sm font-semibold text-primary">Show 50 more</button></div>
      ) : null}
    </Panel>
  );
}

function RowToggle({ open, label, onToggle }: { open: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} members for ${label}`}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="mr-2 inline-flex rounded-sm align-middle text-muted-foreground hover:text-foreground"
    >
      <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90 text-primary" : ""}`} />
    </button>
  );
}

/** Members inside an opened row: one code's members (all time), or everyone who joined in the period. */
function MembersList({ days, code }: { days: number; code: string | null }) {
  const [referredOnly, setReferredOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const load = useServerFn(getAdminNewMembers);
  const q = useQuery({
    queryKey: ["admin-new-members", days, referredOnly, code, offset],
    queryFn: () => load({ data: { days, referredOnly, code, offset } }), retry: false, placeholderData: keepPreviousData, refetchInterval: 60_000,
  });
  const ids = useMemo(() => (q.data?.rows ?? []).filter((r) => r.linked).map((r) => r.userId), [q.data]);
  const loadTsd = useServerFn(getAdminTsdBalances);
  const tsdQ = useQuery({ queryKey: ["admin-tsd", ids], queryFn: () => loadTsd({ data: { userIds: ids } }), enabled: ids.length > 0, staleTime: 60_000, retry: false });
  const total = q.data?.total ?? 0;
  const sub = "px-3 py-1.5";

  if (q.isPending) return <div className="px-6 py-3"><Loading /></div>;
  if (q.error) return <div className="px-6 py-3"><Note tone="error">{(q.error as Error).message}</Note></div>;
  return (
    <div className="py-2 pr-2 pl-8" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 pb-1.5 text-xs text-muted-foreground">
        <span>{code ? <>Members who joined with <span className="font-mono text-foreground">{code}</span> · all time</> : `Everyone who joined · last ${days} days`}</span>
        {code ? null : <label className="flex items-center gap-2"><input type="checkbox" checked={referredOnly} onChange={(e) => { setReferredOnly(e.target.checked); setOffset(0); }} /> Referred only</label>}
      </div>
      <table className="w-full text-sm">
        <thead className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          <tr className="border-b border-border">
            <th className={`${sub} text-left font-normal`}>Member</th>
            <th className={`${sub} text-left font-normal`}>Joined</th>
            <th className={`${sub} text-left font-normal`}>{code ? "How" : "Referred by"}</th>
            <th className={`${sub} text-right font-normal`}>Traded</th>
            <th className={`${sub} text-right font-normal`}>Swapped</th>
            <th className={`${sub} text-right font-normal`}>TSD held</th>
            <th className={`${sub} text-left font-normal`}>Last activity</th>
          </tr>
        </thead>
        <tbody>
          {q.data.rows.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Nobody here yet.</td></tr>
          ) : q.data.rows.map((r) => (
            <tr key={r.userId} className="border-b border-border last:border-0">
              <td className={`${sub} font-semibold text-foreground`}>{r.name ?? "—"}</td>
              <td className={`${sub} text-muted-foreground`}>{r.joinedAt ? fmtAgo(r.joinedAt) : "—"}</td>
              <td className={sub}>
                {r.code ? (code
                  ? <span className="text-muted-foreground">{SOURCE[r.source ?? ""] ?? r.source}</span>
                  : <><span className="text-foreground">{r.referrerName ?? <span className="font-mono">{r.code}</span>}</span><div className="text-xs text-muted-foreground">{SOURCE[r.source ?? ""] ?? r.source}</div></>)
                  : <span className="text-muted-foreground">—</span>}
              </td>
              <td className={`num ${sub} text-right`}>{r.trades ? <>{usd(r.tradedValue)}<div className="text-xs text-muted-foreground">{num(r.trades)} trades</div></> : "—"}</td>
              <td className={`num ${sub} text-right`}>{r.swaps ? <>{usd(r.swapUsd)}<div className="text-xs text-muted-foreground">{num(r.swaps)} swaps</div></> : "—"}</td>
              <td className={`num ${sub} text-right`}>{!r.linked ? <span className="text-muted-foreground">no pocket</span> : tsdQ.isPending ? "…" : tsd(tsdQ.data?.[r.userId])}</td>
              <td className={`${sub} text-muted-foreground`}>{r.lastActivity ? fmtAgo(r.lastActivity) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > 50 ? (
        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
          <span className="num">{`${offset + 1}–${Math.min(offset + 50, total)} of ${num(total)}`}</span>
          <span className="flex gap-1.5">
            <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} className="rounded-sm border border-border px-2.5 py-1 font-semibold disabled:opacity-40">Prev</button>
            <button type="button" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)} className="rounded-sm border border-border px-2.5 py-1 font-semibold disabled:opacity-40">Next</button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
