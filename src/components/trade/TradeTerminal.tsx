import { Link, useLocation } from "@tanstack/react-router";
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
import { MarketOrderConfirm } from "@/components/trade/MarketOrderConfirm";
import { ThorChartPanel } from "@/components/markets/ThorChartPanel";
import { thorMarketForBookBase } from "@/lib/markets/thor-markets";
import {
  DEFAULT_MARKET_SLIPPAGE_PCT,
  MARKET_SLIPPAGE_OPTIONS,
  estimateMarketFill,
  marketOrderNotes,
  withoutOwnOrders,
} from "@/lib/market-order";

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
  const here = useLocation({ select: (l) => l.href });
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
  const px = (v: number | string) => fmtPrice(v, pair.priceDigits ?? 5);
  // BTC, ETH and LTC also trade on THORChain: show its candlesticks (TSD = $1) above the book's own prints.
  const thor = pair.quote === "TSD" ? thorMarketForBookBase(pair.base) : null;
  const refQuote = ref.data?.quotes.find((q) => q.symbol === pair.base);
  // Outside reference price for the base coin, in dollars (TSD = $1).
  const refPrice = pair.base === "TXC" ? (ref.data?.txcUsd ?? null) : (refQuote?.price ?? null);
  // How far the local book's last print sits from the global reference.
  const basisPct =
    refPrice != null && refPrice > 0 && pair.quote === "TSD" && stats.data?.last != null
      ? ((stats.data.last - refPrice) / refPrice) * 100
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
  const [orderType, setOrderType] = useState<"limit" | "market">("limit");
  const [slippagePct, setSlippagePct] = useState<number>(DEFAULT_MARKET_SLIPPAGE_PCT);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      const a = Number(amount);
      if (!Number.isFinite(a) || a <= 0) throw new Error("Enter a valid amount");
      if (orderType === "market") {
        return submitOrder({ data: { type: "market", pair: PAIR, side, amount: a, slippagePct } });
      }
      const p = Number(price);
      if (!Number.isFinite(p) || p <= 0) throw new Error("Enter a valid price");
      return submitOrder({ data: { type: "limit", pair: PAIR, side, price: p, amount: a } });
    },
    onSuccess: (res) => {
      setFormError(null);
      const failed = res.settlements.filter((st) => st.legs.some((l) => !l.ok && !l.pending));
      const confirming = res.settlements.filter((st) => !failed.includes(st) && st.legs.some((l) => l.ok) && st.legs.some((l) => l.pending)).length;
      const waiting = res.settlements.filter((st) => !failed.includes(st) && !st.legs.some((l) => l.ok) && st.legs.some((l) => l.pending)).length;
      const unsettled = failed.length;
      const reason = failed[0]?.legs.find((l) => !l.ok)?.error?.replace(/^Trade cancelled, nothing was sent: /, "");
      const settleNote =
        (unsettled > 0
          ? ` ${unsettled} trade(s) couldn't settle and were cancelled; nothing was sent for those${reason ? ` (${reason})` : ""}.`
          : "") +
        (waiting > 0
          ? ` ${waiting} trade(s) are waiting for both sides to tap Approve in Telegram (15 minutes). Nothing moves until both do; if either side doesn't, the trade is cancelled.`
          : "") +
        (confirming > 0
          ? ` ${confirming} trade(s) are confirming: the first payment is sent, and the other side is sent once it's confirmed on its network (usually a few minutes).`
          : "");
      if (res.tradeIds.length > 0 && unsettled === res.tradeIds.length) {
        // Matched, but no trade could settle: say so plainly, nothing moved.
        setReceipt(null);
        setFormError(
          `Your order matched ${fmtAmount(res.filled, 4)} ${pair.base}, but the trade couldn't settle, so it was cancelled and nothing was sent${
            reason ? `: ${reason}` : "."
          }`,
        );
        setAmount("");
        refreshAll();
        return;
      }
      if (res.type === "market") {
        const did = side === "buy" ? "Bought" : "Sold";
        setReceipt(
          `${did} ${fmtAmount(res.filled, 4)} ${pair.base} at an average of ${
            res.avgPrice != null ? px(res.avgPrice) : "—"
          } ${pair.quote} across ${res.tradeIds.length} trade(s).${
            res.cancelled > 1e-8
              ? ` The other ${fmtAmount(res.cancelled, 4)} ${pair.base} couldn't fill within your ${slippagePct}% price protection and was cancelled.`
              : ""
          }${settleNote}`,
        );
      } else {
        setReceipt(
          res.filled > 0
            ? `Filled ${fmtAmount(res.filled, 4)} ${pair.base} across ${res.tradeIds.length} escrowed trade(s)${
                res.resting > 0 ? `, ${fmtAmount(res.resting, 4)} resting on the book` : ""
              }.${settleNote}`
            : "Order resting on the book — no crossing liquidity yet.",
        );
      }
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

  // Market estimate: walk the other side of the book, minus my own orders
  // (they never trade against me).
  const marketEstimate = useMemo(() => {
    const levels = (side === "buy" ? book.data?.asks : book.data?.bids) ?? [];
    const opposite = side === "buy" ? "sell" : "buy";
    const own = (myOrders.data ?? [])
      .filter((o) => o.pair === PAIR && o.side === opposite && (o.status === "open" || o.status === "partial"))
      .map((o) => ({ price: Number(o.price), remaining: Number(o.amount) - Number(o.filled) }));
    const a = Number(amount);
    return estimateMarketFill(side, withoutOwnOrders(levels, own), Number.isFinite(a) ? a : 0, slippagePct);
  }, [side, book.data, myOrders.data, amount, slippagePct, PAIR]);
  const marketCheck = useMemo(
    () =>
      marketOrderNotes(marketEstimate, {
        base: pair.base,
        quote: pair.quote,
        refPrice: pair.quote === "TSD" ? refPrice : null,
        fmt: (n) => fmtAmount(n, 4),
      }),
    [marketEstimate, pair.base, pair.quote, refPrice],
  );

  const onTicketSubmit = () => {
    setReceipt(null);
    if (orderType === "market") {
      const a = Number(amount);
      if (!Number.isFinite(a) || a <= 0) {
        setFormError("Enter a valid amount");
        return;
      }
      setFormError(null);
      setConfirmOpen(true);
      return;
    }
    submit.mutate();
  };

  const maxTotal = Math.max(
    ...(book.data?.bids.map((b) => b.total) ?? [1]),
    ...(book.data?.asks.map((a) => a.total) ?? [1]),
    1,
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      {/* ticker */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground uppercase">
            Pair
          </p>
          <h1 className="font-display text-2xl font-black tracking-tight text-foreground">
            {pair.label} market
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
          <p className="num text-2xl text-primary">
            {stats.data?.last != null ? px(stats.data.last) : "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            24h
          </p>
          <p
            className={`num text-lg ${ (stats.data?.changePct ?? 0) >= 0 ?"text-bid" : "text-ask"
            }`}
          >
            {stats.data?.changePct != null ? `${stats.data.changePct.toFixed(2)}%` : "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            24h volume
          </p>
          <p className="num text-lg text-foreground">
            {stats.data ? fmtAmount(stats.data.volume24h) : "—"} {pair.base}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Ref price
          </p>
          <p className="num text-lg text-foreground">
            {refPrice != null ? px(refPrice) : "—"}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {refQuote?.change24h != null
              ? `${refQuote.change24h >= 0 ? "+" : ""}${refQuote.change24h.toFixed(2)}% 24h`
              : refPrice != null ? "outside price" : "offline"}
            {basisPct != null ? ` · book ${basisPct >= 0 ? "+" : ""}${basisPct.toFixed(1)}%` : ""}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Chain
          </p>
          <p className="num text-lg text-foreground">
            {chain.data?.height != null ? `#${chain.data.height.toLocaleString()}` : "offline"}
          </p>
        </div>
        <span className="ml-auto rounded-sm border border-warn/50 bg-warn/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-warn uppercase">
          live settlement · {pair.base.toLowerCase()} + {pair.quote.toLowerCase()}
        </span>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Buy and sell {pair.base} with prices quoted in {pair.quote}. {pair.blurb} Matched trades settle on-chain,
        directly between the two traders' wallets. Seeds never takes custody of your coins.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px_300px]">
        {/* chart + my activity */}
        <div className="min-w-0 space-y-4">
          {thor ? (
            <Panel
              title={`${pair.base} price · THORChain`}
              right={<Link to="/markets/$slug" params={{ slug: thor.slug }} className="font-mono text-[10px] text-primary hover:underline">full chart →</Link>}
            >
              <ThorChartPanel slug={thor.slug} base={thor.base} initial="7d" height={320} />
            </Panel>
          ) : null}
          <Panel title={thor ? "Seeds order book prints" : "Price"} right={<span className="font-mono text-[10px] text-muted-foreground">last {series.data?.length ?? 0} prints</span>}>
            <div className="p-4">
              <Sparkline points={(series.data ?? []).map((s) => s.price)} />
              <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>low {stats.data?.low24h != null ? px(stats.data.low24h) : "—"}</span>
                <span>high {stats.data?.high24h != null ? px(stats.data.high24h) : "—"}</span>
              </div>
            </div>
          </Panel>

          <Panel title="Your escrows">
            {!user ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">
                <Link to="/auth"
                  search={{ redirect: here }} className="text-primary underline-offset-4 hover:underline">
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
                      <span className="tabular-nums">@ {px(t.price)}</span>
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

          <Panel title="Your orders">
            {!user ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">Sign in to place orders.</p>
            ) : (myOrders.data ?? []).filter((o) => o.pair === PAIR).length === 0 ? (
              <p className="p-4 font-mono text-xs text-muted-foreground">No orders yet.</p>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    <th className="px-4 py-2 text-left">Side</th>
                    <th className="px-4 py-2 text-left">Type</th>
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
                      <td className="px-4 py-2 text-muted-foreground">{o.order_type}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {o.order_type === "market" ? (
                          <span title={`Price protection ${px(o.price)}`}>market</span>
                        ) : (
                          px(o.price)
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtAmount(o.filled, 4)} / {fmtAmount(o.amount, 4)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {o.order_type === "market" && o.status === "cancelled" && Number(o.filled) > 0
                          ? "part filled"
                          : o.status}
                      </td>
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
              </div>
            )}
          </Panel>
        </div>

        {/* order book */}
        <Panel
          title="Order book"
          right={
            <span className="font-mono text-[10px] text-muted-foreground">
              spread {book.data?.spread != null ? px(book.data.spread) : "—"}
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
                <span className="relative text-ask tabular-nums">{px(l.price)}</span>
                <span className="relative text-foreground tabular-nums">{fmtAmount(l.amount, 3)}</span>
              </li>
            ))}
          </ul>
          <div className="border-y border-border px-3 py-2 text-center num text-sm text-primary">
            {book.data?.mid != null ? px(book.data.mid) : "—"}
          </div>
          <ul>
            {(book.data?.bids ?? []).map((l) => (
              <li key={`b-${l.price}`} className="relative flex justify-between px-3 py-1 font-mono text-xs">
                <span
                  className="absolute inset-y-0 right-0 bg-bid-muted"
                  style={{ width: `${(l.total / maxTotal) * 100}%` }}
                  aria-hidden
                />
                <span className="relative text-bid tabular-nums">{px(l.price)}</span>
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

              <div className="mb-1 grid grid-cols-2 rounded-sm border border-border p-0.5" role="tablist" aria-label="Order type">
                {(["limit", "market"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={orderType === t}
                    onClick={() => {
                      setOrderType(t);
                      setFormError(null);
                    }}
                    className={`rounded-[2px] px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] uppercase ${
                      orderType === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                {orderType === "limit"
                  ? "You set the price. It waits on the book until someone matches it."
                  : `${side === "buy" ? "Buy" : "Sell"} right now at the best price available. Whatever can't fill is cancelled.`}
              </p>

              {orderType === "limit" ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor="ticket-price"
                      className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase"
                    >
                      Price ({pair.quote})
                    </label>
                    {(side === "buy" ? book.data?.asks[0] : book.data?.bids[0]) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const best = side === "buy" ? book.data?.asks[0]?.price : book.data?.bids[0]?.price;
                          if (best != null) setPrice(String(best));
                        }}
                        className="font-mono text-[10px] text-primary hover:underline"
                      >
                        use best {side === "buy" ? "ask" : "bid"}
                      </button>
                    ) : null}
                  </div>
                  <input
                    id="ticket-price"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    maxLength={20}
                    className="mt-1 mb-3 w-full rounded-sm border border-input bg-background px-3 py-2 num text-sm outline-none focus:border-primary"
                  />
                </>
              ) : (
                <>
                  <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    Price ({pair.quote})
                  </p>
                  <p className="mt-1 mb-3 rounded-sm border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    Best available
                    {marketEstimate.bestPrice != null ? (
                      <span className="num text-foreground"> · now {px(marketEstimate.bestPrice)}</span>
                    ) : (
                      <span> · nobody {side === "buy" ? "selling" : "buying"} yet</span>
                    )}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                    Price protection
                  </p>
                  <div className="mt-1 mb-1 flex gap-1.5">
                    {MARKET_SLIPPAGE_OPTIONS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={slippagePct === o}
                        onClick={() => setSlippagePct(o)}
                        className={`flex-1 rounded-sm border px-2 py-1 font-mono text-[11px] ${
                          slippagePct === o
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {o}%
                      </button>
                    ))}
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                    The most the price may move from the best {side === "buy" ? "ask" : "bid"} before Seeds stops filling.
                  </p>
                </>
              )}

              <label
                htmlFor="ticket-amount"
                className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase"
              >
                Amount ({pair.base})
              </label>
              <input
                id="ticket-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                maxLength={20}
                className="mt-1 mb-3 w-full rounded-sm border border-input bg-background px-3 py-2 num text-sm outline-none focus:border-primary"
              />

              {orderType === "limit" ? (
                <p className="mb-4 flex justify-between font-mono text-[11px] text-muted-foreground">
                  <span>Notional</span>
                  <span className="tabular-nums">{fmtAmount(notional)} {pair.quote}</span>
                </p>
              ) : (
                <dl className="mb-4 space-y-1 font-mono text-[11px] text-muted-foreground">
                  <div className="flex justify-between">
                    <dt>Est. average price</dt>
                    <dd className="tabular-nums text-foreground">
                      {marketEstimate.avgPrice != null ? px(marketEstimate.avgPrice) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{side === "buy" ? "Est. cost" : "Est. you get"}</dt>
                    <dd className="tabular-nums text-foreground">
                      {fmtAmount(marketEstimate.total)} {pair.quote}
                    </dd>
                  </div>
                  {marketEstimate.unfilled > 1e-8 && marketEstimate.filled > 1e-8 ? (
                    <div className="flex justify-between text-warn">
                      <dt>Would cancel</dt>
                      <dd className="tabular-nums">
                        {fmtAmount(marketEstimate.unfilled, 4)} {pair.base}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              )}

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
                  onClick={onTicketSubmit}
                  disabled={submit.isPending}
                  className={`w-full rounded-sm px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] uppercase disabled:opacity-50 ${
                    side === "buy" ? "bg-bid text-background" : "bg-ask text-background"
                  }`}
                >
                  {submit.isPending
                    ? "Matching…"
                    : orderType === "market"
                      ? `${side} ${pair.base} at market`
                      : `${side} ${pair.base}`}
                </button>
              ) : (
                <Link
                  to="/auth"
                  search={{ redirect: here }}
                  className="block w-full rounded-md bg-action px-4 py-3 text-center text-sm font-semibold text-action-foreground"
                >
                  Sign in to trade
                </Link>
              )}
            </div>
            <MarketOrderConfirm
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              estimate={marketEstimate}
              notes={marketCheck.notes}
              canPlace={marketCheck.canPlace}
              base={pair.base}
              quote={pair.quote}
              slippagePct={slippagePct}
              px={(n) => px(n)}
              onConfirm={() => submit.mutate()}
              onUseLimit={() => {
                setOrderType("limit");
                setConfirmOpen(false);
              }}
            />
          </Panel>

          <Panel title="Trade tape">
            <ul className="max-h-96 overflow-y-auto">
              {(tape.data ?? []).length === 0 ? (
                <li className="p-4 font-mono text-xs text-muted-foreground">No prints yet.</li>
              ) : (
                (tape.data ?? []).map((t) => (
                  <li
                    key={t.id}
                    className="flex justify-between px-4 py-1 num text-[11px]"
                  >
                    <span className={t.side === "buy" ? "text-bid" : "text-ask"}>
                      {px(t.price)}
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
