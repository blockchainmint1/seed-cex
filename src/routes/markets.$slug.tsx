import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, BookOpen } from "lucide-react";
import { fmtTsdCompact, thorMarket, THOR_MARKETS } from "@/lib/markets/thor-markets";
import { swapCoin } from "@/lib/xchain/assets";
import { routeCoinProblem } from "@/lib/xchain/tsd-route";
import { Change, Price, thorMarketsQuery } from "@/components/markets/ThorMarketBits";
import { ThorChartPanel } from "@/components/markets/ThorChartPanel";
import { Button } from "@/components/ui/button";
import { MarketActivity } from "@/components/markets/research/MarketActivity";
import {
  AboutPanel, coinResearchQuery, ExchangesPanel, LinksCard, MarketDataCard, NewsPanel, VideosPanel,
} from "@/components/markets/research/CoinResearch";

export const Route = createFileRoute("/markets/$slug")({
  staticData: { sitemap: true },
  beforeLoad: ({ params }) => {
    if (!thorMarket(params.slug) || thorMarket(params.slug)!.slug !== params.slug) throw notFound();
  },
  // Render with prices on the server (handed to the browser as loader data);
  // if THORChain can't be reached the page still opens and retries.
  loader: async ({ context }) => ({
    markets: await context.queryClient.ensureQueryData(thorMarketsQuery).catch(() => null),
  }),
  head: ({ params }) => {
    const m = thorMarket(params.slug);
    if (!m) return { meta: [{ title: "Market not found — Seeds" }, { name: "robots", content: "noindex" }] };
    const title = `${m.base}/TSD price & chart — ${m.name} in TSD | Seeds`;
    const description = `Live ${m.name} (${m.base}) price in TSD: candlestick chart, recent trades, cost by trade size, market cap, supply, all-time high, other exchanges, news and videos. 1 TSD = $1.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: `${m.base}/TSD — Seeds` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: MarketPage,
});

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-mono text-sm text-foreground">{children}</p>
    </div>
  );
}

function MarketPage() {
  const { slug } = Route.useParams();
  const m = thorMarket(slug)!;
  const { markets } = Route.useLoaderData();
  const list = useQuery({ ...thorMarketsQuery, initialData: markets ?? undefined });
  const row = list.data?.find((r) => r.slug === slug);
  const coin = swapCoin(m.swapId);
  const buyProblem = coin ? routeCoinProblem("buy", coin) : "Not on the Swap page.";
  const sellProblem = coin ? routeCoinProblem("sell", coin) : "Not on the Swap page.";
  const research = useQuery(coinResearchQuery(slug));
  const profile = research.data?.profile ?? null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8">
      <Link to="/markets" className="font-mono text-xs text-muted-foreground hover:text-primary">← All markets</Link>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-border pb-5">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">
            {m.base}<span className="text-muted-foreground">/TSD</span>
          </h1>
          <p className="text-sm text-muted-foreground">{m.name}{row && !row.live ? " · THORChain has this pool paused" : ""}</p>
        </div>
        <div>
          <p className="num text-3xl text-foreground"><Price v={row?.price ?? null} /></p>
          <p className="font-mono text-xs"><Change pct={row?.day.changePct ?? null} /> <span className="text-muted-foreground">24h</span></p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <Stat label="24h high"><Price v={row?.day.high ?? null} /></Stat>
          <Stat label="24h low"><Price v={row?.day.low ?? null} /></Stat>
          <Stat label="24h volume">{fmtTsdCompact(row?.day.volume)} TSD</Stat>
          <Stat label="Liquidity">{fmtTsdCompact(row?.liquidity)} TSD</Stat>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className="min-w-0 rounded-sm border border-border bg-surface">
            <ThorChartPanel slug={m.slug} base={m.base} initial="7d" height={480} />
          </section>
          <MarketActivity market={m} />
          <NewsPanel news={research.data?.news ?? []} name={m.name} loading={research.isPending} />
          <VideosPanel slug={m.slug} name={m.name} />
          <ExchangesPanel pairs={research.data?.pairs ?? []} name={m.name} loading={research.isPending} />
          <AboutPanel profile={profile} name={m.name} />
        </div>

        <aside className="space-y-4">
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-display text-sm font-bold">Trade {m.base}</h2>
            <div className="mt-3 grid gap-2">
              {buyProblem ? null : (
                <Button asChild><Link to="/swap" search={{ from: "TSD", to: m.swapId }}><ArrowDownLeft /> Buy {m.base} with TSD</Link></Button>
              )}
              {sellProblem ? null : (
                <Button asChild variant="outline"><Link to="/swap" search={{ from: m.swapId, to: "TSD" }}><ArrowUpRight /> Sell {m.base} for TSD</Link></Button>
              )}
              {m.book ? (
                <Button asChild variant="outline"><Link to={m.book}><BookOpen /> {m.base}/TSD order book</Link></Button>
              ) : null}
            </div>
            {buyProblem && sellProblem ? (
              <p className="mt-2 text-xs text-muted-foreground">Price only for now. {buyProblem}</p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Swaps run through THORChain from your own trading pocket. You see the exact price and fees before anything is sent.
              </p>
            )}
          </section>
          <MarketDataCard profile={profile} base={m.base} loading={research.isPending} />
          <LinksCard profile={profile} name={m.name} />
          <section className="rounded-sm border border-border bg-surface p-4 text-xs text-muted-foreground">
            <h2 className="font-display text-sm font-bold text-foreground">Where these prices come from</h2>
            <p className="mt-2">
              THORChain's {m.base} pool. One TSD is one dollar, so the TSD price is THORChain's dollar price. Volume is the
              pool's swap volume; liquidity is everything in the pool.
            </p>
          </section>
          <section className="rounded-sm border border-border bg-surface p-4">
            <h2 className="font-display text-sm font-bold">Other markets</h2>
            <ul className="mt-2 grid grid-cols-3 gap-1">
              {THOR_MARKETS.filter((x) => x.slug !== m.slug).map((x) => (
                <li key={x.slug}>
                  <Link to="/markets/$slug" params={{ slug: x.slug }} className="block rounded-sm px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    {x.base}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
