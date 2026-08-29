import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getMarketStats, getOrderBook, getPriceSeries, getTape } from "@/lib/market.functions";
import { LegPanel } from "@/components/trade/LegPanel";
import {
  cancelOrder,
  getMyOrders,
  getMyTrades,
  placeOrder,
} from "@/lib/trading.functions";
import { getChainSnapshot } from "@/lib/txc.functions";
import { getReferencePrices } from "@/lib/cmc.functions";
import { useSession } from "@/hooks/use-session";
import { getPair, PAIRS, type PairId } from "@/lib/chains";
import { fmtAgo, fmtAmount, fmtPrice, fmtTime } from "@/lib/format";

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-24 items-center justify-center font-mono text-[11px] text-muted-foreground">
        Not enough trades yet
      </div>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((p - min) / span) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-24 w-full" role="img" aria-label="Recent price trend">
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Panel({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="font-display text-[11px] font-bold tracking-[0.18em] text-foreground uppercase">
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

/**
 * One terminal, driven by the pair definition. TSD/TXC settles entirely on the
 * TEXITcoin chain (Omni #39); USDC/TXC crosses to an EVM chain.
 */
export function TradeTerminal({ pairId }: { pairId: PairId }) {
  const pair = getPair(pairId);
  const PAIR = pair.id;
  const { user } = useSession();
  const queryClient = useQueryClient();

  const book = useQuery({
    queryKey: ["book", PAIR],
    queryFn: () => getOrderBook({ data: { pair: PAIR } }),
    refetchInterval: 8_000,
  });
  const tape = useQuery({
    queryKey: ["tape", PAIR],
    queryFn: () => getTape({ data: { pair: PAIR } }),
    refetchInterval: 8_000,
  });
  const stats = useQuery({
    queryKey: ["market-stats", PAIR],
    queryFn: () => getMarketStats({ data: { pair: PAIR } }),
    refetchInterval: 15_000,
  });
  const series = useQuery({
    queryKey: ["series", PAIR],
    queryFn: () => getPriceSeries({ data: { pair: PAIR } }),
    refetchInterval: 30_000,
  });
  const chain = useQuery({
    queryKey: ["chain-snapshot"],
    queryFn: () => getChainSnapshot(),
    refetchInterval: 60_000,
  });
  const ref = useQuery({
    queryKey: ["cmc-reference"],
    queryFn: () => getReferencePrices(),
    refetchInterval: 60_000,
  });
  const refQuote = ref.data?.quotes.find((q) => q.symbol === pair.base);
  // How far the local book's last print sits from the global reference.
  const basisPct =
    ref.data?.txcUsd != null && ref.data.txcUsd > 0 && stats.data?.last != null
      ? ((stats.data.last - ref.data.txcUsd) / ref.data.txcUsd) * 100
      : null;

  const fetchMyOrders = useServerFn(getMyOrders);
  const fetchMyTrades = useServerFn(getMyTrades);
  const submitOrder = useServerFn(placeOrder);
  const killOrder = useServerFn(cancelOrder);

  const myOrders = useQuery({
    queryKey: ["my-orders", PAIR],
    queryFn: () => fetchMyOrders(),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });
  const myTrades = useQuery({
    queryKey: ["my-trades", PAIR],
    queryFn: () => fetchMyTrades(),
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["book", PAIR] });
    queryClient.invalidateQueries({ queryKey: ["tape", PAIR] });
    queryClient.invalidateQueries({ queryKey: ["market-stats", PAIR] });
    queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    queryClient.invalidateQueries({ queryKey: ["my-trades"] });
    queryClient.invalidateQueries({ queryKey: ["series", PAIR] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const p = Number(price);
      const a = Number(amount);
      if (!Number.isFinite(p) || p <= 0) throw new Error("Enter a valid price");
      if (!Number.isFinite(a) || a <= 0) throw new Error("Enter a valid amount");
      return submitOrder({ data: { pair: PAIR, side, price: p, amount: a } });
    },
    onSuccess: (res) => {
      setFormError(null);
      setReceipt(
        res.filled > 0
          ? `Filled ${fmtAmount(res.filled, 4)} ${pair.base} across ${res.tradeIds.length} escrowed trade(s)${
              res.resting > 0 ? `, ${fmtAmount(res.resting, 4)} resting on the book` : ""
            }.`
          : "Order resting on the book — no crossing liquidity yet.",
      );
      setAmount("");
      refreshAll();
    },
    onError: (e) => {
      setReceipt(null);
      setFormError(e instanceof Error ? e.message : "Order rejected");
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => killOrder({ data: { id } }),
    onSuccess: refreshAll,
  });

  const notional = useMemo(() => {
    const p = Number(price);
    const a = Number(amount);
    return Number.isFinite(p) && Number.isFinite(a) ? p * a : 0;
  }, [price, amount]);

  const maxTotal = Math.max(
    ...(book.data?.bids.map((b) => b.total) ?? [1]),
    ...(book.data?.asks.map((a) => a.total) ?? [1]),
    1,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* ticker */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
            Pair
          </p>
          <h1 className="font-display text-2xl font-black tracking-tight text-foreground">
            {pair.label}
          </h1>
          <nav className="mt-2 flex flex-wrap gap-2">
            {PAIRS.map((p) => (
              <Link
                key={p.id}
                to={`/trade/${p.slug}` as string}
                className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase ${
                  p.id === PAIR
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Last
          </p>
          <p className="font-mono text-2xl text-primary tabular-nums">
            {stats.data?.last != null ? fmtPrice(stats.data.last) : "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            24h
          </p>
          <p
            className={`font-mono text-lg tabular-nums ${
              (stats.data?.changePct ?? 0) >= 0 ? "text-bid" : "text-ask"
            }`}
          >
            {stats.data?.changePct != null ? `${stats.data.changePct.toFixed(2)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            24h volume
          </p>
          <p className="font-mono text-lg text-foreground tabular-nums">
            {stats.data ? fmtAmount(stats.data.volume24h) : "—"} {pair.base}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            CMC ref
          </p>
          <p className="font-mono text-lg text-foreground tabular-nums">
            {ref.data?.txcUsd != null ? fmtPrice(ref.data.txcUsd) : "—"}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {refQuote?.change24h != null
              ? `${refQuote.change24h >= 0 ? "+" : ""}${refQuote.change24h.toFixed(2)}% 24h`
              : "offline"}
            {basisPct != null ? ` · book ${basisPct >= 0 ? "+" : ""}${basisPct.toFixed(1)}%` : ""}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Chain
          </p>
          <p className="font-mono text-lg text-foreground tabular-nums">
            {chain.data?.height != null ? `#${chain.data.height.toLocaleString()}` : "offline"}
          </p>
        </div>
        <span className="ml-auto rounded-sm border border-warn/50 bg-warn/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-warn uppercase">
          live settlement · {pair.base.toLowerCase()} + {pair.quote.toLowerCase()}
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px_300px]">
        {/* chart + my activity */}
        <div className="space-y-4">
          <Panel title="Price" right={<span className="font-mono text-[10px] text-muted-foreground">last {series.data?.length ?? 0} prints</span>}>
            <div className="p-4">
              <Sparkline points={(series.data ?? []).map((s) => s.price)} />
              <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>low {stats.data?.low24h != null ? fmtPrice(stats.data.low24h) : "—"}</span>
                <span>high {stats.data?.high24h != null ? fmtPrice(stats.data.high24h) : "—"}</span>
              </div>
            </div>
          </Panel>

          <Panel title="Your escrows">
            {!user ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">
                <Link to="/auth" className="text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>{" "}
                to see your escrowed trades.
              </p>
            ) : (myTrades.data ?? []).filter((t) => t.pair === PAIR).length === 0 ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">No trades yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(myTrades.data ?? []).filter((t) => t.pair === PAIR).map((t) => (
                  <li key={t.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                      <span className={t.side === "buy" ? "text-bid" : "text-ask"}>
                        {t.side.toUpperCase()}
                      </span>
                      <span className="tabular-nums">{fmtAmount(t.amount, 4)} {pair.base}</span>
                      <span className="tabular-nums">@ {fmtPrice(t.price)}</span>
                      <span className="text-muted-foreground">{t.role}</span>
                      <span className="rounded-sm border border-border px-2 py-0.5 tracking-wider uppercase">
                        {t.status.replace(/_/g, " ")}
                      </span>
                      <span className="ml-auto text-muted-foreground">{fmtAgo(t.createdAt)}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {t.escrows.map((e) => (
                        <LegPanel key={e.leg} tradeId={t.id} leg={e} />
                      ))}
                    </div>

                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Your open orders">
            {!user ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">Sign in to place orders.</p>
            ) : (myOrders.data ?? []).filter((o) => o.pair === PAIR).length === 0 ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">No orders yet.</p>
            ) : (
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    <th className="px-4 py-2 text-left">Side</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Filled / Size</th>
                    <th className="px-4 py-2 text-right">Status</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(myOrders.data ?? []).filter((o) => o.pair === PAIR).map((o) => (
                    <tr key={o.id} className="border-b border-border/50">
                      <td className={`px-4 py-2 ${o.side === "buy" ? "text-bid" : "text-ask"}`}>
                        {o.side.toUpperCase()}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtPrice(o.price)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtAmount(o.filled, 4)} / {fmtAmount(o.amount, 4)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{o.status}</td>
                      <td className="px-4 py-2 text-right">
                        {o.status === "open" || o.status === "partial" ? (
                          <button
                            onClick={() => cancel.mutate(o.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            cancel
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        {/* order book */}
        <Panel
          title="Order book"
          right={
            <span className="font-mono text-[10px] text-muted-foreground">
              spread {book.data?.spread != null ? fmtPrice(book.data.spread) : "—"}
            </span>
          }
        >
          <div className="px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            <div className="flex justify-between">
              <span>Price</span>
              <span>Size {pair.base}</span>
            </div>
          </div>
          <ul>
            {[...(book.data?.asks ?? [])].reverse().map((l) => (
              <li key={`a-${l.price}`} className="relative flex justify-between px-3 py-1 font-mono text-xs">
                <span
                  className="absolute inset-y-0 right-0 bg-ask-muted"
                  style={{ width: `${(l.total / maxTotal) * 100}%` }}
                  aria-hidden
                />
                <span className="relative text-ask tabular-nums">{fmtPrice(l.price)}</span>
                <span className="relative text-foreground tabular-nums">{fmtAmount(l.amount, 3)}</span>
              </li>
            ))}
          </ul>
          <div className="border-y border-border px-3 py-2 text-center font-mono text-sm text-primary tabular-nums">
            {book.data?.mid != null ? fmtPrice(book.data.mid) : "—"}
          </div>
          <ul>
            {(book.data?.bids ?? []).map((l) => (
              <li key={`b-${l.price}`} className="relative flex justify-between px-3 py-1 font-mono text-xs">
                <span
                  className="absolute inset-y-0 right-0 bg-bid-muted"
                  style={{ width: `${(l.total / maxTotal) * 100}%` }}
                  aria-hidden
                />
                <span className="relative text-bid tabular-nums">{fmtPrice(l.price)}</span>
                <span className="relative text-foreground tabular-nums">{fmtAmount(l.amount, 3)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ticket + tape */}
        <div className="space-y-4">
          <Panel title="Place order">
            <div className="p-4">
              <div className="mb-4 grid grid-cols-2 gap-2">
                {(["buy", "sell"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`rounded-sm border px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase ${
                      side === s
                        ? s === "buy"
                          ? "border-bid bg-bid-muted text-bid"
                          : "border-ask bg-ask-muted text-ask"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {s === "buy" ? `Buy ${pair.base}` : `Sell ${pair.base}`}
                  </button>
                ))}
              </div>

              <label className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Price ({pair.quote})
              </label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                maxLength={20}
                className="mt-1 mb-3 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-primary"
              />

              <label className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Amount ({pair.base})
              </label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                maxLength={20}
                className="mt-1 mb-3 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm tabular-nums outline-none focus:border-primary"
              />

              <p className="mb-4 flex justify-between font-mono text-[11px] text-muted-foreground">
                <span>Notional</span>
                <span className="tabular-nums">{fmtAmount(notional)} {pair.quote}</span>
              </p>

              {formError ? (
                <p className="mb-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
                  {formError}
                </p>
              ) : null}
              {receipt ? (
                <p className="mb-3 rounded-sm border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[11px] text-primary">
                  {receipt}
                </p>
              ) : null}

              {user ? (
                <button
                  onClick={() => submit.mutate()}
                  disabled={submit.isPending}
                  className={`w-full rounded-sm px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] uppercase disabled:opacity-50 ${
                    side === "buy" ? "bg-bid text-background" : "bg-ask text-background"
                  }`}
                >
                  {submit.isPending ? "Matching…" : `${side} ${pair.base}`}
                </button>
              ) : (
                <Link
                  to="/auth"
                  className="block w-full rounded-sm bg-primary px-4 py-3 text-center font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase"
                >
                  Sign in to trade
                </Link>
              )}
            </div>
          </Panel>

          <Panel title="Trade tape">
            <ul className="max-h-96 overflow-y-auto">
              {(tape.data ?? []).length === 0 ? (
                <li className="p-4 font-mono text-xs text-muted-foreground">No prints yet.</li>
              ) : (
                (tape.data ?? []).map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between px-4 py-1 font-mono text-[11px] tabular-nums"
                  >
                    <span className={t.side === "buy" ? "text-bid" : "text-ask"}>
                      {fmtPrice(t.price)}
                    </span>
                    <span className="text-foreground">{fmtAmount(t.amount, 3)}</span>
                    <span className="text-muted-foreground">{fmtTime(t.createdAt)}</span>
                  </li>
                ))
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
