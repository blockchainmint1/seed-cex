import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import { ArrowRight } from "lucide-react";
import { PAIRS } from "@/lib/chains";
import { fmtTsdCompact } from "@/lib/markets/thor-markets";
import { Change, Price, Spark, thorMarketsQuery, marketsErrorText } from "@/components/markets/ThorMarketBits";

const title = "Crypto Markets in TSD — BTC, ETH, SOL, XRP & more | Seeds";
const description =
  "Live prices, 24-hour change, volume and candlestick charts for Bitcoin, Ether, Solana, XRP, Dogecoin and every major coin on THORChain, priced in TSD (1 TSD = $1).";

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
  }),
  component: MarketsPage,
});

// Order-book pages are one route file per pair; their paths are built from the pair list.
const tradeHref = (slug: string): string => `/trade/${slug}`;

function MarketsPage() {
  const { markets } = Route.useLoaderData();
  const q = useQuery({ ...thorMarketsQuery, initialData: markets ?? undefined });
  const rows = q.data ?? [];

  // Lets an agent browser read the table the member is looking at.
  useWebMCP({
    name: "list_shown_markets",
    description: "List the markets shown in the Primary markets table: price in TSD (1 TSD = $1), 24-hour change and volume.",
    annotations: { readOnlyHint: true },
    execute: () =>
      runWebMCPTool("list_shown_markets", () => {
        if (!rows.length) return q.error ? "Prices couldn't load; try again shortly." : "Prices are still loading.";
        return rows
          .map((m) => `${m.base}/TSD: ${m.price ?? "n/a"} TSD, ${m.day.changePct == null ? "n/a" : m.day.changePct.toFixed(2) + "%"} 24h, volume ${fmtTsdCompact(m.day.volume)}${m.live ? "" : " (paused)"}`)
          .join("\n");
      }),
  });
  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Markets</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Primary markets</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        The major coins on THORChain, priced in TSD. One TSD is one dollar, so every price here is THORChain's live
        dollar price. Tap a market for candlestick charts.
      </p>

      <div className="mt-6 overflow-x-auto rounded-sm border border-border">
        <table className="w-full text-left">
          <thead className="bg-surface font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Market</th>
              <th className="px-4 py-3 text-right">Price (TSD)</th>
              <th className="px-4 py-3 text-right">24h</th>
              <th className="hidden px-4 py-3 text-right md:table-cell">24h high / low</th>
              <th className="hidden px-4 py-3 text-right sm:table-cell">24h volume</th>
              <th className="hidden px-4 py-3 text-right lg:table-cell">Liquidity</th>
              <th className="hidden px-4 py-3 lg:table-cell">Last 24h</th>
              <th className="hidden px-4 py-3 sm:table-cell"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {q.error ? marketsErrorText(q.error) : "Loading THORChain prices…"}
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.slug} className="group hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link to="/markets/$slug" params={{ slug: m.slug }} className="block">
                      <span className="font-mono text-sm font-semibold text-foreground group-hover:text-primary">{m.base}<span className="text-muted-foreground">/TSD</span></span>
                      <span className="block text-xs text-muted-foreground">{m.name}{!m.live ? " · paused" : ""}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-foreground"><Price v={m.price} /></td>
                  <td className="px-4 py-3 text-right font-mono text-sm"><Change pct={m.day.changePct} /></td>
                  <td className="hidden px-4 py-3 text-right font-mono text-xs text-muted-foreground md:table-cell">
                    <Price v={m.day.high} /> / <Price v={m.day.low} />
                  </td>
                  <td className="hidden px-4 py-3 text-right font-mono text-sm text-muted-foreground sm:table-cell">{fmtTsdCompact(m.day.volume)}</td>
                  <td className="hidden px-4 py-3 text-right font-mono text-sm text-muted-foreground lg:table-cell">{fmtTsdCompact(m.liquidity)}</td>
                  <td className="hidden px-4 py-3 lg:table-cell"><Spark points={m.spark} up={(m.day.changePct ?? 0) >= 0} /></td>
                  <td className="hidden px-4 py-3 text-right sm:table-cell">
                    <Link
                      to="/markets/$slug"
                      params={{ slug: m.slug }}
                      className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-wider text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
                    >
                      Chart <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
        Prices, volume and liquidity from THORChain's pools. Volume is THORChain's 24-hour swap volume for that coin.
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
