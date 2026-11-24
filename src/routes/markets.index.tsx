import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown } from "lucide-react";
import { PAIRS } from "@/lib/chains";
import { getHomeCoinMarkets } from "@/lib/market.functions";
import type { MarketRow } from "@/lib/markets/thor-markets.server";
import { DEFAULT_SORT, nextSort, sortRows, type PrimaryRow, type SortKey, type SortState } from "@/lib/markets/primary-rows";
import { fmtTsdCompact } from "@/lib/markets/thor-markets";
import { Change, Price, Spark, thorMarketsQuery, marketsErrorText } from "@/components/markets/ThorMarketBits";
import { MarketsSponsoredRow } from "@/components/ads/AdSpots";
import { liveAdsQuery } from "@/components/ads/live-ads";
import { adsForSpot } from "@/lib/ads/ad-rules";
import { CoinSearch } from "@/components/markets/research/CoinSearch";

const title = "Crypto Markets in TSD — TXC, ISK, ZCU, BTC, ETH & more | Seeds";
const description =
  "Live prices, 24-hour change and volume for TEXITcoin, Iskandercoin and ZeroChill on Seeds' own order books, plus Bitcoin, Ether, Solana, XRP and every major coin on THORChain, priced in TSD (1 TSD = $1).";

const homeCoinMarketsQuery = queryOptions({
  queryKey: ["home-coin-markets"],
  queryFn: () => getHomeCoinMarkets(),
  refetchInterval: 30_000,
  staleTime: 15_000,
});

const fromThor = (m: MarketRow): PrimaryRow => ({
  key: `thor:${m.slug}`,
  base: m.base,
  name: m.name,
  source: "thor",
  slug: m.slug,
  price: m.price,
  priceIsMid: false,
  changePct: m.day.changePct,
  high: m.day.high,
  low: m.day.low,
  volume: m.day.volume,
  liquidity: m.liquidity,
  live: m.live,
  spark: m.spark,
});

export const Route = createFileRoute("/markets/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: "Crypto markets in TSD — Seeds" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // Render with prices on the server (handed to the browser as loader data);
  // if THORChain can't be reached the page still opens and retries.
  loader: async ({ context }) => ({
    markets: await context.queryClient.ensureQueryData(thorMarketsQuery).catch(() => null),
    ads: await context.queryClient.ensureQueryData(liveAdsQuery).catch(() => null),
    home: await context.queryClient.ensureQueryData(homeCoinMarketsQuery).catch(() => null),
  }),
  component: MarketsPage,
});

// Order-book pages are one route file per pair; their paths are built from the pair list.
const tradeHref = (slug: string): string => `/trade/${slug}`;

function MarketsPage() {
  const { markets, ads, home } = Route.useLoaderData();
  const q = useQuery({ ...thorMarketsQuery, initialData: markets ?? undefined });
  const h = useQuery({ ...homeCoinMarketsQuery, initialData: home ?? undefined });
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const thorRows = q.data ?? [];
  // Home coins (Seeds' own order books) come first in the unsorted order; the table opens sorted by 24h volume.
  const allRows = useMemo(() => [...(h.data ?? []), ...thorRows.map(fromThor)], [h.data, thorRows]);
  const [find, setFind] = useState("");
  const rows = useMemo(() => {
    const f = find.trim().toLowerCase();
    const sorted = sortRows(allRows, sort);
    return f ? sorted.filter((m) => m.base.toLowerCase().includes(f) || m.name.toLowerCase().includes(f)) : sorted;
  }, [allRows, sort, find]);
  const live = useQuery({ ...liveAdsQuery, initialData: ads ?? undefined });
  const sponsored = adsForSpot(live.data?.ads ?? [], "markets_row", { nowMs: live.data?.nowMs ?? 0 })[0];

  // Lets an agent browser read the table the member is looking at.
  useWebMCP({
    name: "list_shown_markets",
    description: "List the markets shown in the Primary markets table: price in TSD (1 TSD = $1), 24-hour change and volume.",
    annotations: { readOnlyHint: true },
    execute: () =>
      runWebMCPTool("list_shown_markets", () => {
        if (!rows.length) return q.error ? "Prices couldn't load; try again shortly." : "Prices are still loading.";
        return rows
          .map((m) => `${m.base}/TSD: ${m.price ?? "n/a"} TSD${m.priceIsMid ? " (order-book mid, no trades yet)" : ""}, ${m.changePct == null ? "n/a" : m.changePct.toFixed(2) + "%"} 24h, volume ${fmtTsdCompact(m.volume)}${m.live ? "" : " (paused)"} — ${m.source === "seeds" ? "Seeds order book" : "THORChain"}`)
          .join("\n");
      }),
  });
  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Markets</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Primary markets</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Our home coins — TEXITcoin, Iskandercoin and ZeroChill — on Seeds' own order books, plus the major coins on
        THORChain, all priced in TSD. One TSD is one dollar. Tap a column heading to sort, or a market to open it.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CoinSearch value={find} onChange={setFind} />
        <Link to="/research" className="font-mono text-[11px] tracking-wider text-primary uppercase hover:underline">Research any coin →</Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-left">
          <thead className="bg-surface font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <tr>
              <SortTh label="Market" k="market" sort={sort} onSort={setSort} align="left" />
              <SortTh label="Price (TSD)" k="price" sort={sort} onSort={setSort} />
              <SortTh label="24h" k="change" sort={sort} onSort={setSort} />
              <SortTh label="24h high / low" k="high" sort={sort} onSort={setSort} className="hidden md:table-cell" />
              <SortTh label="24h volume" k="volume" sort={sort} onSort={setSort} className="hidden sm:table-cell" />
              <SortTh label="Liquidity" k="liquidity" sort={sort} onSort={setSort} className="hidden lg:table-cell" />
              <th className="hidden px-4 py-3 lg:table-cell">Last 24h</th>
              <th className="hidden px-4 py-3 sm:table-cell"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sponsored ? <MarketsSponsoredRow ad={sponsored} colSpan={8} /> : null}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {find.trim() && allRows.length ? `No Seeds market for "${find.trim()}" — pick it from the search list to research it.` : q.error ? marketsErrorText(q.error) : "Loading prices…"}
                </td>
              </tr>
            ) : (
              rows.map((m) => <MarketRowView key={m.key} m={m} />)
            )}
            {rows.length && !thorRows.length && !find.trim() ? (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-center text-xs text-muted-foreground">
                  {q.error ? marketsErrorText(q.error) : "Loading THORChain prices…"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
        TXC, ISK and ZCU figures come from Seeds' own order books: price is the last trade (or the middle of the best
        buy and sell order before the first trade), and liquidity is the TSD value of open orders. Every other row comes
        from THORChain's pools, where volume is THORChain's 24-hour swap volume for that coin.
      </p>

      <h2 className="mt-12 font-display text-xl font-bold">Seeds order books</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Place limit and market orders against other Seeds members. Trades settle between the two traders' own wallets.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PAIRS.map((p) => (
          <Link
            key={p.id}
            to={tradeHref(p.slug)}
            className="rounded-sm border border-border bg-surface p-4 transition-colors hover:border-primary"
          >
            <span className="font-mono text-sm font-semibold text-foreground">{p.label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{p.blurb}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SortTh({
  label,
  k,
  sort,
  onSort,
  align = "right",
  className = "",
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (s: SortState) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === k ? sort.dir : null;
  const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      className={`px-4 py-3 ${align === "right" ? "text-right" : ""} ${className}`}
      aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, k))}
        className={`inline-flex items-center gap-1 uppercase tracking-[0.18em] transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden />
      </button>
    </th>
  );
}

function MarketRowView({ m }: { m: PrimaryRow }) {
  const seeds = m.source === "seeds";
  const name = (
    <>
      <span className="font-mono text-sm font-semibold text-foreground group-hover:text-primary">{m.base}<span className="text-muted-foreground">/TSD</span></span>
      <span className="block text-xs text-muted-foreground">
        {m.name}
        {seeds ? " · Seeds order book" : !m.live ? " · paused" : ""}
      </span>
    </>
  );
  const btn = "inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-wider text-foreground uppercase transition-colors hover:border-primary hover:text-primary";
  return (
    <tr className="group hover:bg-surface/60">
      <td className="px-4 py-3">
        {seeds ? (
          <Link to={tradeHref(m.slug)} className="block">{name}</Link>
        ) : (
          <Link to="/markets/$slug" params={{ slug: m.slug }} className="block">{name}</Link>
        )}
      </td>
      <td className="px-4 py-3 text-right text-sm text-foreground">
        <Price v={m.price} />
        {m.priceIsMid ? <span className="block font-mono text-[10px] text-muted-foreground">mid · no trades yet</span> : null}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm"><Change pct={m.changePct} /></td>
      <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted-foreground md:table-cell">
        <Price v={m.high} /> / <Price v={m.low} />
      </td>
      <td className="hidden px-4 py-3 text-right font-mono text-sm text-muted-foreground sm:table-cell">{fmtTsdCompact(m.volume)}</td>
      <td className="hidden px-4 py-3 text-right font-mono text-sm text-muted-foreground lg:table-cell">{fmtTsdCompact(m.liquidity)}</td>
      <td className="hidden px-4 py-3 lg:table-cell"><Spark points={m.spark} up={(m.changePct ?? 0) >= 0} /></td>
      <td className="hidden px-4 py-3 text-right sm:table-cell">
        {seeds ? (
          <Link to={tradeHref(m.slug)} className={btn}>Trade <ArrowRight className="h-3 w-3" /></Link>
        ) : (
          <Link to="/markets/$slug" params={{ slug: m.slug }} className={btn}>Chart <ArrowRight className="h-3 w-3" /></Link>
        )}
      </td>
    </tr>
  );
}
