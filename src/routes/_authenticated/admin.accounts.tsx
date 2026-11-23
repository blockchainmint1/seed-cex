import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { clearOrderPause, liftTradingFreeze } from "@/lib/admin.functions";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAdminAccounts, getAdminMemberAddresses, getAdminTsdBalances } from "@/lib/admin-members.functions";
import { TabTitle, inputCls } from "@/components/account/ui";
import { Loading, Pager, SortHeader, short } from "@/components/admin/ui";
import { DEFAULT_SORT, PAGE_SIZES, defaultDir, pageInfo, type AccountSortKey } from "@/lib/admin-accounts";
import { fmtAgo, fmtAmount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Accounts — Seeds admin" },
      { name: "description", content: "Every Seeds account with its orders, trades, trading value and last activity — searchable and sortable." },
      { property: "og:title", content: "Accounts — Seeds admin" },
      { property: "og:description", content: "Every Seeds account at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: AccountSortKey; dir: "asc" | "desc" }>(DEFAULT_SORT);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);
  const [open, setOpen] = useState<{ userId: string; name: string } | null>(null);
  // Wait for a pause in typing before asking the server.
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);

  // Only the rows on screen come back; search, sort and paging run in the database.
  const fetchPage = useServerFn(getAdminAccounts);
  const pq = useQuery({
    queryKey: ["admin-accounts", q, sort.key, sort.dir, page, size],
    queryFn: () => fetchPage({ data: { q, sort: sort.key, dir: sort.dir, page, size } }),
    placeholderData: keepPreviousData, refetchInterval: 60_000, retry: false,
  });
  const d = pq.data;
  const rows = d?.rows ?? [];
  const info = pageInfo(d?.total ?? 0, d?.offset ?? 0, size, rows.length);

  // TSD balances for the members on screen only, refreshed every minute through the shared balance cache.
  const fetchTsd = useServerFn(getAdminTsdBalances);
  const linkedIds = rows.filter((r) => r.linked).map((r) => r.userId);
  const tsdQ = useQuery({
    queryKey: ["admin-tsd-balances", linkedIds.join(",")],
    queryFn: () => fetchTsd({ data: { userIds: linkedIds } }),
    enabled: linkedIds.length > 0, refetchInterval: 60_000, retry: false,
  });
  const tsd = tsdQ.data;

  const onSort = (k: AccountSortKey) => {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: defaultDir(k) }));
    setPage(0);
  };
  const H = (label: string, k: AccountSortKey, align: "left" | "right" = "right") => (
    <SortHeader label={label} k={k} sort={sort} onSort={onSort} align={align} />
  );

  return (
    <div className="space-y-5">
      <TabTitle title="Accounts" desc="Every signed-in member. Click a column header to sort; click again to flip. Click a name to see all of that member's addresses." />
      {pq.isPending ? <Loading /> : !d ? <p role="alert" className="text-sm text-destructive">Couldn't load accounts. Refresh to retry.</p> : (
        <section className="min-w-0 rounded-md border border-border bg-surface">
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-bold">{q ? `${d.total} matching accounts` : `${d.total} accounts`}{pq.isFetching ? <span className="ml-2 font-mono text-[10px] font-normal text-muted-foreground">updating…</span> : null}</h3>
            <label className="relative w-full sm:ml-auto sm:w-80">
              <span className="sr-only">Search accounts</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input className={`${inputCls} py-1.5 pr-8 pl-8`} placeholder="Name, any pocket address, user id" value={search}
                onChange={(e) => setSearch(e.target.value)} />
              {search ? (
                <button type="button" aria-label="Clear search" onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              ) : null}
            </label>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap font-mono text-[11px]">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  {H("User", "displayName", "left")}
                  {H("Joined", "createdAt", "left")}
                  {H("Vault", "hasVault", "left")}
                  <th scope="col" className="px-3 py-2 text-left font-normal">TXC</th>
                  <th scope="col" className="px-3 py-2 text-left font-normal">EVM</th>
                  <th scope="col" className="px-3 py-2 text-right font-normal" title="Read live for the members on this page">TSD</th>
                  {H("Auths", "activeAuthorizations")}
                  {H("Cap", "authorizedCap")}
                  {H("Open", "openOrders")}
                  {H("Trades", "trades")}
                  {H("Value", "tradedQuoteValue")}
                  {H("Last activity", "lastActivity")}
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const bal = tsd?.[a.userId];
                  return (
                  <tr key={a.userId} className="border-b border-border/50">
                    <td className="px-3 py-2 text-foreground">
                      <button type="button" onClick={() => setOpen({ userId: a.userId, name: a.displayName })}
                        className="rounded-sm text-left text-primary underline-offset-2 hover:underline" title="Show all addresses">
                        {a.displayName}
                      </button>
                      {a.tradingFrozenAt ? <FrozenBadge userId={a.userId} reason={a.tradingFrozenReason} /> : null}
                      {a.orderPausedUntil ? <OrderPauseBadge userId={a.userId} until={a.orderPausedUntil} /> : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-3 py-2">{a.hasVault ? "yes" : "—"}</td>
                    <td className="px-3 py-2" title={a.txcAddress ?? undefined}>{short(a.txcAddress)}</td>
                    <td className="px-3 py-2" title={a.evmAddress ?? undefined}>{short(a.evmAddress)}</td>
                    <td className="px-3 py-2 text-right" title={a.linked ? undefined : "No trading pocket linked"}>
                      {!a.linked ? "—" : !tsd ? "…" : bal == null ? "?" : fmtAmount(bal)}
                    </td>
                    <td className="px-3 py-2 text-right">{a.activeAuthorizations}</td>
                    <td className="px-3 py-2 text-right">{fmtAmount(a.authorizedCap)}</td>
                    <td className="px-3 py-2 text-right">{a.openOrders}</td>
                    <td className="px-3 py-2 text-right">{a.trades}</td>
                    <td className="px-3 py-2 text-right">{fmtAmount(a.tradedQuoteValue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{a.lastActivity ? fmtAgo(a.lastActivity) : "—"}</td>
                  </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr><td className="px-4 py-6 text-muted-foreground" colSpan={12}>{q ? "No accounts match that search." : "No accounts yet."}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pager page={info.page} pages={info.pages} from={info.from} to={info.to} total={d.total} size={size} sizes={PAGE_SIZES}
            onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} />
        </section>
      )}
      <AddressesDialog member={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Every receive address of one member's trading pocket, each with a copy button. */
function AddressesDialog({ member, onClose }: { member: { userId: string; name: string } | null; onClose: () => void }) {
  const fetchAddrs = useServerFn(getAdminMemberAddresses);
  const q = useQuery({
    queryKey: ["admin-member-addresses", member?.userId],
    queryFn: () => fetchAddrs({ data: { userId: member!.userId } }),
    enabled: Boolean(member),
    retry: false,
  });
  const d = q.data;
  return (
    <Dialog open={Boolean(member)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member?.name ?? ""} — addresses</DialogTitle>
          <DialogDescription>
            Receive addresses of this member's Seeds trading pocket. TXC, TSD and the other TEXITcoin-network coins all go to the TXC address.
          </DialogDescription>
        </DialogHeader>
        {q.isPending ? <Loading /> : q.isError || !d ? (
          <p role="alert" className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Couldn't load addresses."}</p>
        ) : (
          <div className="space-y-4">
            {d.link ? (
              <>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Linked {new Date(d.link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" · "}{d.link.mode === "access" ? "Seeds can send (instant access)" : "approve in HME Wallet"}
                  {d.link.vaultName ? ` · ${d.link.vaultName}` : ""}
                </p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {d.link.addresses.map((a) => (
                    <AddressRow key={a.pocket} label={a.pocket} sub={a.covers.join(", ")} address={a.address} />
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No trading pocket linked, so Seeds has no live receive address for this member.</p>
            )}
            {d.legacy.length ? (
              <div className="space-y-2">
                <p className="font-mono text-[11px] text-muted-foreground">Old wallet record (before HME linking) — only use if the member confirms it:</p>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {d.legacy.map((a) => <AddressRow key={a.coin} label={a.coin} sub="old wallet" address={a.address} />)}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddressRow({ label, sub, address }: { label: string; sub: string; address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="w-28 shrink-0">
        <div className="font-display text-sm font-bold">{label}</div>
        <div className="truncate font-mono text-[10px] text-muted-foreground" title={sub}>{sub}</div>
      </div>
      <code className="min-w-0 flex-1 font-mono text-[11px] break-all">{address}</code>
      <button type="button" aria-label={`Copy ${label} address`}
        onClick={async () => { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="shrink-0 rounded-sm p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

/** A member whose trade payment vanished can't trade until an admin lifts this. */
function OrderPauseBadge({ userId, until }: { userId: string; until: string }) {
  const clear = useServerFn(clearOrderPause);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = new Date(until).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <span className="ml-2 inline-flex items-center gap-1.5">
      <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-destructive" title={`3 failed matches on their side in 24 hours. Paused until ${when}.`}>Orders paused</span>
      <button
        type="button"
        disabled={busy}
        className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
        onClick={async () => {
          if (!window.confirm(`Let this member place orders again?\n\nThree of their matched orders failed on their side in the last 24 hours (paused until ${when}).`)) return;
          setBusy(true);
          setErr(null);
          try {
            await clear({ data: { userId } });
            await qc.invalidateQueries({ queryKey: ["admin-accounts"] });
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't clear it");
          } finally {
            setBusy(false);
          }
        }}
      >
        Clear
      </button>
      {err ? <span role="alert" className="text-destructive">{err}</span> : null}
    </span>
  );
}

function FrozenBadge({ userId, reason }: { userId: string; reason: string | null }) {
  const lift = useServerFn(liftTradingFreeze);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="ml-2 inline-flex items-center gap-1.5">
      <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-destructive" title={reason ?? undefined}>Trading frozen</span>
      <button
        type="button"
        disabled={busy}
        className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
        onClick={async () => {
          if (!window.confirm(`Lift the trading freeze?\n\n${reason ?? ""}\n\nOnly do this after reviewing the trade.`)) return;
          setBusy(true);
          setErr(null);
          try {
            await lift({ data: { userId } });
            await qc.invalidateQueries({ queryKey: ["admin-accounts"] });
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Couldn't lift it");
          } finally {
            setBusy(false);
          }
        }}
      >
        Lift
      </button>
      {err ? <span role="alert" className="text-destructive">{err}</span> : null}
    </span>
  );
}
