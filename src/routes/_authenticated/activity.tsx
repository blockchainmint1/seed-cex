import { Fragment, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw } from "lucide-react";
import { cancelAllOrders, cancelOrder, getMyOrders, getMyTrades } from "@/lib/trading.functions";
import { getMyActivity, refreshMyDeposits } from "@/lib/activity/activity.functions";
import {
  KIND_LABEL, ORDER_LABEL, TRADE_LABEL, activityCsv, coinsIn, filterRows, isOpenOrder, mySide, tradeTone,
  type ActivityKind, type ActivityRow, type Tone,
} from "@/lib/activity/activity-rules";
import { NETWORK_LABEL } from "@/lib/activity/deposit-rules";
import { getPair, type PairId } from "@/lib/chains";
import { LegPanel } from "@/components/trade/LegPanel";
import { ActivityTable, TONE_CLASS, when } from "@/components/activity/ActivityTable";
import { fmtAmount, fmtPrice } from "@/lib/format";

const TABS = ["all", "open", "orders", "trades", "swaps", "p2p", "deposits", "withdrawals", "ai"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  all: "All activity", open: "Open orders", orders: "Order history", trades: "Trade history", swaps: "Swaps",
  p2p: "P2P", deposits: "Deposits", withdrawals: "Withdrawals", ai: "Seeds AI",
};

export const Route = createFileRoute("/_authenticated/activity")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } => ({
    tab: typeof s.tab === "string" && (TABS as readonly string[]).includes(s.tab) ? (s.tab as Tab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Activity — Orders, Trades, Swaps & Deposits | Seeds" },
      { name: "description", content: "Everything you've done on Seeds in one place: open orders, trade history, swaps, P2P trades, deposits, withdrawals and Seeds AI moves." },
      { property: "og:title", content: "My activity — Seeds" },
      { property: "og:description", content: "Open orders, trade history, swaps, P2P, deposits and withdrawals — every move from your trading pocket." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[11px] font-bold tracking-[0.18em] text-foreground uppercase">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

const pairOf = (id: string) => {
  try { return getPair(id as PairId); } catch { return null; }
};

function downloadCsv(rows: ActivityRow[], name: string) {
  const blob = new Blob([activityCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ActivityPage() {
  const tab: Tab = Route.useSearch().tab ?? "all";
  const qc = useQueryClient();
  const fetchActivity = useServerFn(getMyActivity);
  const activity = useQuery({ queryKey: ["my-activity"], queryFn: () => fetchActivity(), refetchInterval: 30_000 });
  const fetchOrders = useServerFn(getMyOrders);
  const orders = useQuery({ queryKey: ["my-orders", "all"], queryFn: () => fetchOrders(), refetchInterval: 15_000 });
  const refreshDeposits = useServerFn(refreshMyDeposits);
  const deposits = useMutation({
    mutationFn: () => refreshDeposits(),
    onSettled: () => qc.invalidateQueries({ queryKey: ["my-activity"] }),
  });
  // Look for new deposits once per visit (the server reads each chain at most every 2 minutes).
  useEffect(() => { deposits.mutate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = activity.data?.rows ?? [];
  const by = (k: ActivityKind) => rows.filter((r) => r.kind === k);
  const open = (orders.data ?? []).filter(isOpenOrder);
  const action = rows.filter((r) => r.tone === "action");
  const moving = rows.filter((r) => r.tone === "pending" && r.kind !== "order");

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <header className="mb-6 border-b border-border pb-6">
        <p className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">Portfolio</p>
        <h1 className="font-display text-3xl font-black tracking-tight text-foreground">Activity</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every order, trade, swap, P2P trade, deposit and withdrawal from your trading pocket. Your coins never leave your own pocket
          except when you approve a send in Telegram.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Needs your action" value={action.length} tone={action.length ? "action" : "done"} hint={action[0]?.title ?? "Nothing waiting on you"} />
        <Stat label="In progress" value={moving.length} tone="pending" hint={moving[0]?.title ?? "Nothing moving right now"} />
        <Stat label="Open orders" value={open.length} tone="pending" hint={open.length ? "Resting on the order book" : "No orders on the book"} to="open" />
        <Stat label="Deposits recorded" value={by("deposit").length} tone="done" hint={deposits.isPending ? "Checking your pocket…" : "Checked on every visit"} to="deposits" />
      </div>

      {action.length ? (
        <div className="mb-6 space-y-2 rounded-sm border border-warning/50 bg-warning/10 p-4 text-sm">
          <p className="font-semibold">Waiting on you</p>
          <ul className="space-y-1">
            {action.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2">
                <span>{r.href ? <Link to={r.href as string} className="underline-offset-4 hover:underline">{r.title}</Link> : r.title}</span>
                <span className="font-mono text-xs">{r.status}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <nav aria-label="Activity sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t}
            to="/activity"
            search={{ tab: t === "all" ? undefined : t }}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${t === tab ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {TAB_LABEL[t]}
            {t === "open" && open.length ? <span className="ml-1.5 rounded-sm bg-primary/15 px-1.5 font-mono text-[10px]">{open.length}</span> : null}
          </Link>
        ))}
      </nav>

      {activity.error ? <p role="alert" className="mb-4 font-mono text-xs text-destructive">{(activity.error as Error).message}</p> : null}

      {tab === "all" ? <AllActivity rows={rows} loading={activity.isLoading} /> : null}
      {tab === "open" ? <OpenOrders orders={open} /> : null}
      {tab === "orders" ? (
        <Panel title="Order history" right={<CsvButton rows={by("order")} name="seeds-orders.csv" />}>
          <ActivityTable rows={by("order")} showKind={false} empty="No orders yet. Pick a market to place one." />
        </Panel>
      ) : null}
      {tab === "trades" ? <TradeHistory /> : null}
      {tab === "swaps" ? (
        <Panel title="Swaps" right={<span className="flex items-center gap-3"><Link to="/swap" className="font-mono text-[11px] text-primary hover:underline">New swap</Link><CsvButton rows={by("swap")} name="seeds-swaps.csv" /></span>}>
          <ActivityTable rows={by("swap")} showKind={false} empty="No swaps yet." />
        </Panel>
      ) : null}
      {tab === "p2p" ? (
        <Panel title="P2P trades" right={<span className="flex items-center gap-3"><Link to="/p2p" className="font-mono text-[11px] text-primary hover:underline">Marketplace</Link><CsvButton rows={by("p2p")} name="seeds-p2p.csv" /></span>}>
          <ActivityTable rows={by("p2p")} showKind={false} empty="No P2P trades yet." />
        </Panel>
      ) : null}
      {tab === "deposits" ? <Deposits rows={by("deposit")} checking={deposits.isPending} onCheck={() => deposits.mutate()} result={deposits.data ?? null} /> : null}
      {tab === "withdrawals" ? (
        <Panel title="Withdrawals" right={<span className="flex items-center gap-3"><Link to="/account/balances/withdraw" className="font-mono text-[11px] text-primary hover:underline">Withdraw</Link><CsvButton rows={by("withdrawal")} name="seeds-withdrawals.csv" /></span>}>
          <ActivityTable rows={by("withdrawal")} showKind={false} empty="No withdrawals yet." />
        </Panel>
      ) : null}
      {tab === "ai" ? (
        <Panel title="Seeds AI moves" right={<span className="flex items-center gap-3"><Link to="/account/ai" className="font-mono text-[11px] text-primary hover:underline">My plans</Link><CsvButton rows={by("ai")} name="seeds-ai.csv" /></span>}>
          <ActivityTable rows={by("ai")} showKind={false} empty="Seeds AI hasn't bought or sold anything for you yet." />
        </Panel>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, hint, to }: { label: string; value: number; tone: Tone; hint: string; to?: Tab }) {
  const body = (
    <>
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
      <p className={`font-display text-2xl font-black tabular-nums ${value ? TONE_CLASS[tone] : "text-foreground"}`}>{value}</p>
      <p className="truncate text-xs text-muted-foreground">{hint}</p>
    </>
  );
  const cls = "block rounded-sm border border-border bg-surface p-4";
  return to ? <Link to="/activity" search={{ tab: to }} className={`${cls} hover:border-primary`}>{body}</Link> : <div className={cls}>{body}</div>;
}

function CsvButton({ rows, name }: { rows: ActivityRow[]; name: string }) {
  return (
    <button type="button" disabled={!rows.length} onClick={() => downloadCsv(rows, name)} className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40">
      <Download className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

const KIND_FILTERS: ActivityKind[] = ["trade", "order", "swap", "p2p", "deposit", "withdrawal", "ai", "approval", "wallet"];
const TONE_FILTERS: Array<{ v: Tone | "any"; l: string }> = [
  { v: "any", l: "Any status" }, { v: "action", l: "Needs action" }, { v: "pending", l: "In progress" }, { v: "done", l: "Done" }, { v: "stopped", l: "Stopped" },
];

function AllActivity({ rows, loading }: { rows: ActivityRow[]; loading: boolean }) {
  const [kinds, setKinds] = useState<ActivityKind[]>([]);
  const [coin, setCoin] = useState("");
  const [tone, setTone] = useState<Tone | "any">("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const coins = useMemo(() => coinsIn(rows), [rows]);
  const shown = useMemo(
    () => filterRows(rows, { kinds, coin: coin || undefined, tones: tone === "any" ? undefined : [tone], from: from || undefined, to: to || undefined }),
    [rows, kinds, coin, tone, from, to],
  );
  const field = "h-8 rounded-sm border border-input bg-background px-2 font-mono text-xs";
  return (
    <Panel title="All activity" right={<CsvButton rows={shown} name="seeds-activity.csv" />}>
      <div className="space-y-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((k) => {
            const on = kinds.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setKinds(on ? kinds.filter((x) => x !== k) : [...kinds, k])}
                className={`rounded-sm border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
              >
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Coin" value={coin} onChange={(e) => setCoin(e.target.value)} className={field}>
            <option value="">All coins</option>
            {coins.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Status" value={tone} onChange={(e) => setTone(e.target.value as Tone | "any")} className={field}>
            {TONE_FILTERS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
          <label className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
          {kinds.length || coin || tone !== "any" || from || to ? (
            <button type="button" onClick={() => { setKinds([]); setCoin(""); setTone("any"); setFrom(""); setTo(""); }} className="font-mono text-[11px] text-primary hover:underline">Clear</button>
          ) : null}
        </div>
      </div>
      {loading ? <p className="p-4 font-mono text-xs text-muted-foreground">Loading your activity…</p> : (
        <ActivityTable rows={shown} empty={rows.length ? "Nothing matches these filters." : "Nothing yet. Trades, swaps, deposits and withdrawals will show here."} />
      )}
    </Panel>
  );
}

function OpenOrders({ orders }: { orders: Array<{ id: string; pair: string; side: string; price: number | string; amount: number | string; filled: number | string; status: string; order_type?: string | null; created_at: string }> }) {
  const qc = useQueryClient();
  const kill = useServerFn(cancelOrder);
  const killAll = useServerFn(cancelAllOrders);
  const done = () => { void qc.invalidateQueries({ queryKey: ["my-orders"] }); void qc.invalidateQueries({ queryKey: ["my-activity"] }); };
  const cancel = useMutation({ mutationFn: (id: string) => kill({ data: { id } }), onSuccess: done });
  const cancelAll = useMutation({ mutationFn: () => killAll({ data: {} }), onSuccess: done });
  return (
    <Panel
      title="Open orders"
      right={orders.length ? (
        <button
          type="button"
          disabled={cancelAll.isPending}
          onClick={() => { if (window.confirm(`Cancel all ${orders.length} open orders?`)) cancelAll.mutate(); }}
          className="font-mono text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          {cancelAll.isPending ? "Cancelling…" : "Cancel all"}
        </button>
      ) : null}
    >
      {orders.length === 0 ? (
        <p className="p-4 font-mono text-xs text-muted-foreground">
          Nothing resting on the book. <Link to="/markets" className="text-primary underline-offset-4 hover:underline">Pick a market</Link> to place one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                <th className="px-4 py-2 text-left">Placed</th>
                <th className="px-4 py-2 text-left">Market</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Side</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Size</th>
                <th className="px-4 py-2 text-right">Filled</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const p = pairOf(o.pair);
                const filled = Number(o.filled), size = Number(o.amount);
                return (
                  <tr key={o.id} className="border-b border-border/50">
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{when(o.created_at)}</td>
                    <td className="px-4 py-2">{p ? <Link to={`/trade/${p.slug}` as string} className="text-primary hover:underline">{p.label}</Link> : o.pair}</td>
                    <td className="px-4 py-2">{o.order_type === "market" ? "Market" : "Limit"}</td>
                    <td className={`px-4 py-2 ${o.side === "buy" ? "text-bid" : "text-ask"}`}>{o.side.toUpperCase()}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtPrice(o.price)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtAmount(size, 4)} {p?.base}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{size ? `${Math.round((filled / size) * 100)}%` : "—"} <span className="text-muted-foreground">({ORDER_LABEL[o.status] ?? o.status})</span></td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtAmount(size * Number(o.price), 2)} {p?.quote}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(o.id)} className="text-muted-foreground hover:text-destructive">Cancel</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cancel.error || cancelAll.error ? <p role="alert" className="px-4 pb-3 font-mono text-xs text-destructive">{((cancel.error ?? cancelAll.error) as Error).message}</p> : null}
    </Panel>
  );
}

function TradeHistory() {
  const fetchTrades = useServerFn(getMyTrades);
  const trades = useQuery({ queryKey: ["my-trades", "all"], queryFn: () => fetchTrades(), refetchInterval: 15_000 });
  const [openId, setOpenId] = useState<string | null>(null);
  const list = trades.data ?? [];
  return (
    <Panel title="Trade history" right={<span className="font-mono text-[10px] text-muted-foreground">{list.length} fill{list.length === 1 ? "" : "s"}</span>}>
      {list.length === 0 ? (
        <p className="p-4 font-mono text-xs text-muted-foreground">{trades.isLoading ? "Loading…" : "No fills yet."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Market</th>
                <th className="px-4 py-2 text-left">Side</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-right">Settlement</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const p = pairOf(t.pair);
                const side = mySide(t.side, t.role);
                const isOpen = openId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr className="border-b border-border/50">
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{when(t.createdAt)}</td>
                      <td className="px-4 py-2">{p ? <Link to={`/trade/${p.slug}` as string} className="text-primary hover:underline">{p.label}</Link> : t.pair}</td>
                      <td className={`px-4 py-2 ${side === "buy" ? "text-bid" : "text-ask"}`}>{side.toUpperCase()}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtPrice(t.price)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtAmount(t.amount, 4)} {p?.base}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtAmount(t.amount * t.price, 2)} {p?.quote}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.role === "maker" ? "Maker" : "Taker"}</td>
                      <td className={`px-4 py-2 text-right ${TONE_CLASS[tradeTone(t.status)]}`}>{TRADE_LABEL[t.status] ?? t.status}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : t.id)} className="text-primary hover:underline">
                          {isOpen ? "Hide sends" : "Sends"}
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/50 bg-background">
                        <td colSpan={9} className="px-4 py-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            {t.escrows.map((e) => <LegPanel key={e.leg} tradeId={t.id} leg={e} />)}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Deposits({ rows, checking, onCheck, result }: { rows: ActivityRow[]; checking: boolean; onCheck: () => void; result: { added: number; skipped?: boolean } | null }) {
  const [withSeeds, setWithSeeds] = useState(false);
  const shown = withSeeds ? rows : rows.filter((r) => !/· from /.test(r.detail ?? ""));
  const hidden = rows.length - shown.length;
  return (
    <Panel
      title="Deposits"
      right={
        <span className="flex items-center gap-3">
          <button type="button" disabled={checking} onClick={onCheck} className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> {checking ? "Checking…" : "Check now"}
          </button>
          <Link to="/account/balances/deposit" className="font-mono text-[11px] text-primary hover:underline">Deposit</Link>
          <CsvButton rows={shown} name="seeds-deposits.csv" />
        </span>
      }
    >
      <div className="space-y-2 border-b border-border px-4 py-3 text-xs text-muted-foreground">
        <p>
          Coins that arrived in your trading pocket. Past deposits are read straight from {["txc", "isk", "ethereum", "base", "bsc"].map((n) => NETWORK_LABEL[n]).join(", ")} (TSD included);
          other coins are recorded from today, when Seeds sees your balance go up.
          {result && !result.skipped ? ` Last check found ${result.added} new.` : ""}
        </p>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={withSeeds} onChange={(e) => setWithSeeds(e.target.checked)} className="accent-primary" />
          Include coins delivered by Seeds swaps and trades{hidden ? ` (${hidden})` : ""}
        </label>
      </div>
      <ActivityTable rows={shown} showKind={false} empty={checking ? "Checking your pocket…" : "No deposits found yet."} />
    </Panel>
  );
}
