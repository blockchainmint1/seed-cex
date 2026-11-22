import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { clearOrderPause, liftTradingFreeze } from "@/lib/admin.functions";
import { createFileRoute } from "@tanstack/react-router";
import { Search, X } from "lucide-react";
import { TabTitle, inputCls } from "@/components/account/ui";
import { Loading, Pager, SortHeader, short, useAdminOverview } from "@/components/admin/ui";
import { PAGE_SIZES, defaultDir, filterAccounts, pageOf, sortAccounts, type AccountSortKey } from "@/lib/admin-accounts";
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
  const q = useAdminOverview();
  const d = q.data;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: AccountSortKey; dir: "asc" | "desc" }>({ key: "tradedQuoteValue", dir: "desc" });
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<number>(PAGE_SIZES[0]);

  const matched = useMemo(() => (d ? sortAccounts(filterAccounts(d.accounts, search), sort.key, sort.dir) : []), [d, search, sort]);
  const view = pageOf(matched, page, size);

  const onSort = (k: AccountSortKey) => {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: defaultDir(k) }));
    setPage(0);
  };
  const H = (label: string, k: AccountSortKey, align: "left" | "right" = "right") => (
    <SortHeader label={label} k={k} sort={sort} onSort={onSort} align={align} />
  );

  return (
    <div className="space-y-5">
      <TabTitle title="Accounts" desc="Every signed-in member. Click a column header to sort; click again to flip." />
      {q.isPending ? <Loading /> : !d ? <p role="alert" className="text-sm text-destructive">Couldn't load accounts. Refresh to retry.</p> : (
        <section className="min-w-0 rounded-md border border-border bg-surface">
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <h3 className="font-display text-sm font-bold">{search.trim() ? `${matched.length} of ${d.accounts.length} accounts` : `${d.accounts.length} accounts`}</h3>
            <label className="relative w-full sm:ml-auto sm:w-80">
              <span className="sr-only">Search accounts</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input className={`${inputCls} py-1.5 pr-8 pl-8`} placeholder="Name, TXC or EVM address, user id" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
              {search ? (
                <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); setPage(0); }}
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
                  {H("Auths", "activeAuthorizations")}
                  {H("Cap", "authorizedCap")}
                  {H("Open", "openOrders")}
                  {H("Trades", "trades")}
                  {H("Value", "tradedQuoteValue")}
                  {H("Last activity", "lastActivity")}
                </tr>
              </thead>
              <tbody>
                {view.rows.map((a) => (
                  <tr key={a.userId} className="border-b border-border/50">
                    <td className="px-3 py-2 text-foreground">
                      {a.displayName}
                      {a.tradingFrozenAt ? <FrozenBadge userId={a.userId} reason={a.tradingFrozenReason} /> : null}
                      {a.orderPausedUntil ? <OrderPauseBadge userId={a.userId} until={a.orderPausedUntil} /> : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="px-3 py-2">{a.hasVault ? "yes" : "—"}</td>
                    <td className="px-3 py-2" title={a.txcAddress ?? undefined}>{short(a.txcAddress)}</td>
                    <td className="px-3 py-2" title={a.evmAddress ?? undefined}>{short(a.evmAddress)}</td>
                    <td className="px-3 py-2 text-right">{a.activeAuthorizations}</td>
                    <td className="px-3 py-2 text-right">{fmtAmount(a.authorizedCap)}</td>
                    <td className="px-3 py-2 text-right">{a.openOrders}</td>
                    <td className="px-3 py-2 text-right">{a.trades}</td>
                    <td className="px-3 py-2 text-right">{fmtAmount(a.tradedQuoteValue)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{a.lastActivity ? fmtAgo(a.lastActivity) : "—"}</td>
                  </tr>
                ))}
                {view.rows.length === 0 ? (
                  <tr><td className="px-4 py-6 text-muted-foreground" colSpan={11}>{d.accounts.length ? "No accounts match that search." : "No accounts yet."}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pager page={view.page} pages={view.pages} from={view.from} to={view.to} total={matched.length} size={size} sizes={PAGE_SIZES}
            onPage={setPage} onSize={(n) => { setSize(n); setPage(0); }} />
        </section>
      )}
    </div>
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
            await qc.invalidateQueries({ queryKey: ["admin-overview"] });
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
            await qc.invalidateQueries({ queryKey: ["admin-overview"] });
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
