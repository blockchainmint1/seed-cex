import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminAffiliateTsd, getAdminAffiliates, getAdminNewMembers } from "@/lib/affiliates.functions";
import { getAdminTsdBalances } from "@/lib/admin-members.functions";
import { AFFILIATE_PERIODS, DEFAULT_PERIOD, type AffiliatePeriod, type AffiliateSort } from "@/lib/affiliates";
import { Note, TabTitle } from "@/components/account/ui";
import { Loading, Panel, Stat } from "@/components/admin/ui";
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
  const [sort, setSort] = useState<AffiliateSort>("signupsPeriod");
  const [code, setCode] = useState<string | null>(null);
  const load = useServerFn(getAdminAffiliates);
  const q = useQuery({ queryKey: ["admin-affiliates", days, sort], queryFn: () => load({ data: { days, sort } }), retry: false, placeholderData: keepPreviousData, refetchInterval: 60_000 });

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
          <AffiliateTable rows={q.data.affiliates} days={days} sort={sort} onSort={setSort} onPick={setCode} picked={code} />
        </>
      )}
      <NewMembers days={days} code={code} onClearCode={() => setCode(null)} />
      <p className="text-xs text-muted-foreground">
        A sign-up counts as referred when the member joins Seeds with someone’s code within 7 days (first code wins). Clicks count people opening seeds.honest.money/invite/… links — link previews and repeat clicks within 10 minutes don’t count. Traded = exchange trades (called-off matches left out); swapped = finished swaps. TSD is read live from each member’s trading pocket.
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

function AffiliateTable({ rows, days, sort, onSort, onPick, picked }: { rows: Row[]; days: number; sort: AffiliateSort; onSort: (s: AffiliateSort) => void; onPick: (c: string | null) => void; picked: string | null }) {
  const [limit, setLimit] = useState(50);
  const shown = rows.slice(0, limit);
  const codes = useMemo(() => shown.filter((r) => r.signupsAll > 0).map((r) => r.code), [shown]);
  const loadTsd = useServerFn(getAdminAffiliateTsd);
  const tsdQ = useQuery({ queryKey: ["admin-affiliate-tsd", codes], queryFn: () => loadTsd({ data: { codes } }), enabled: codes.length > 0, staleTime: 60_000, retry: false });
  const th = (label: string, k?: AffiliateSort) => (
    <th className="px-3 py-2 text-right font-normal">
      {k ? <button type="button" onClick={() => onSort(k)} className={`hover:text-foreground ${sort === k ? "font-semibold text-foreground" : ""}`}>{label}{sort === k ? " ↓" : ""}</button> : label}
    </th>
  );
  return (
    <Panel title={`Invite codes (${rows.length})`} right={tsdQ.data?.partial ? <span className="text-xs text-warn">TSD shown for the newest 200 referred members</span> : null}>
      <table className="w-full min-w-[60rem] text-sm">
        <thead className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-normal">Member / code</th>
            {th(`Clicks ${days}d`, "clicksPeriod")}
            {th(`Sign-ups ${days}d`, "signupsPeriod")}
            {th("Sign-ups all", "signupsAll")}
            {th("Active", "activeMembers")}
            {th("Traded", "tradedValue")}
            {th("Swapped", "swapUsd")}
            {th("TSD held")}
            {th("Ignite paid", "ignitePaid")}
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">No invite links used yet.</td></tr>
          ) : shown.map((r) => {
            const on = picked?.toLowerCase() === r.code.toLowerCase();
            return (
              <tr key={r.code} onClick={() => onPick(on ? null : r.code)} className={`cursor-pointer border-b border-border hover:bg-muted/40 ${on ? "bg-primary/10" : ""}`}>
                <td className="px-3 py-2">
                  <div className="font-semibold text-foreground">{r.ownerName ?? (r.ownerId ? "Seeds member" : "Not on Seeds yet")}</div>
                  <div className="font-mono text-xs text-muted-foreground">{r.code}{r.linkSeenAt ? ` · link opened ${fmtAgo(r.linkSeenAt)}` : ""}</div>
                </td>
                <td className="num px-3 py-2 text-right">{num(r.clicksPeriod)}<div className="text-xs text-muted-foreground">{num(r.clicksAll)} all</div></td>
                <td className="num px-3 py-2 text-right font-semibold">{num(r.signupsPeriod)}</td>
                <td className="num px-3 py-2 text-right">{num(r.signupsAll)}</td>
                <td className="num px-3 py-2 text-right">{num(r.activeMembers)}</td>
                <td className="num px-3 py-2 text-right">{usd(r.tradedValue)}<div className="text-xs text-muted-foreground">{num(r.trades)} trades</div></td>
                <td className="num px-3 py-2 text-right">{usd(r.swapUsd)}<div className="text-xs text-muted-foreground">{num(r.swaps)} swaps</div></td>
                <td className="num px-3 py-2 text-right">{r.signupsAll === 0 ? "—" : tsdQ.isPending ? "…" : tsd(tsdQ.data?.byCode[r.code.toLowerCase()] ?? 0)}</td>
                <td className="num px-3 py-2 text-right">{num(r.ignitePaid)}{r.igniteStarted > r.ignitePaid ? <div className="text-xs text-muted-foreground">{num(r.igniteStarted - r.ignitePaid)} unpaid</div> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > limit ? (
        <div className="border-t border-border px-4 py-2.5"><button type="button" onClick={() => setLimit(limit + 50)} className="text-sm font-semibold text-primary">Show 50 more</button></div>
      ) : null}
    </Panel>
  );
}

function NewMembers({ days, code, onClearCode }: { days: number; code: string | null; onClearCode: () => void }) {
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

  return (
    <Panel
      title={code ? <>Members brought in by <span className="font-mono">{code}</span></> : `New members · last ${days} days`}
      right={
        <div className="flex items-center gap-3 text-sm">
          {code ? <button type="button" onClick={() => { onClearCode(); setOffset(0); }} className="font-semibold text-primary">Show everyone</button> : (
            <label className="flex items-center gap-2"><input type="checkbox" checked={referredOnly} onChange={(e) => { setReferredOnly(e.target.checked); setOffset(0); }} /> Referred only</label>
          )}
        </div>
      }
    >
      {q.isPending ? <div className="p-4"><Loading /></div> : q.error ? <div className="p-4"><Note tone="error">{(q.error as Error).message}</Note></div> : (
        <>
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left font-normal">Member</th>
                <th className="px-3 py-2 text-left font-normal">Joined</th>
                <th className="px-3 py-2 text-left font-normal">Referred by</th>
                <th className="px-3 py-2 text-right font-normal">Traded</th>
                <th className="px-3 py-2 text-right font-normal">Swapped</th>
                <th className="px-3 py-2 text-right font-normal">TSD held</th>
                <th className="px-3 py-2 text-left font-normal">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {q.data.rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Nobody here yet.</td></tr>
              ) : q.data.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border">
                  <td className="px-3 py-2 font-semibold text-foreground">{r.name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.joinedAt ? fmtAgo(r.joinedAt) : "—"}</td>
                  <td className="px-3 py-2">
                    {r.code ? <><span className="text-foreground">{r.referrerName ?? <span className="font-mono">{r.code}</span>}</span><div className="text-xs text-muted-foreground">{SOURCE[r.source ?? ""] ?? r.source}</div></> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="num px-3 py-2 text-right">{r.trades ? <>{usd(r.tradedValue)}<div className="text-xs text-muted-foreground">{num(r.trades)} trades</div></> : "—"}</td>
                  <td className="num px-3 py-2 text-right">{r.swaps ? <>{usd(r.swapUsd)}<div className="text-xs text-muted-foreground">{num(r.swaps)} swaps</div></> : "—"}</td>
                  <td className="num px-3 py-2 text-right">{!r.linked ? <span className="text-muted-foreground">no pocket</span> : tsdQ.isPending ? "…" : tsd(tsdQ.data?.[r.userId])}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.lastActivity ? fmtAgo(r.lastActivity) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="num">{total ? `${offset + 1}–${Math.min(offset + 50, total)} of ${num(total)}` : "0"}</span>
            <span className="flex gap-1.5">
              <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))} className="rounded-sm border border-border px-2.5 py-1 font-semibold disabled:opacity-40">Prev</button>
              <button type="button" disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)} className="rounded-sm border border-border px-2.5 py-1 font-semibold disabled:opacity-40">Next</button>
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}
