import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMarketStats } from "@/lib/market.functions";
import { getCmcSummary } from "@/lib/cmc.functions";
import { fmtAmount, fmtPrice } from "@/lib/format";
import { fmtTsdCompact, THOR_MARKETS, thorMarketForBookBase } from "@/lib/markets/thor-markets";
import { Change, Price, thorMarketsQuery, marketsErrorText } from "@/components/markets/ThorMarketBits";
import { PAIRS } from "@/lib/chains";
import seedsCoin from "@/assets/seeds-cold-storage-coin.jpg.asset.json";
import { IgnitePromo } from "@/components/ignite/IgnitePromo";
import { GenesisHero, GENESIS_FIRST_FRAME, GENESIS_POSTER } from "@/components/home/GenesisHero";
import { HomeSpotlight } from "@/components/ads/AdSpots";
import { liveAdsQuery } from "@/components/ads/live-ads";
import { adsForSpot } from "@/lib/ads/ad-rules";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Seeds — The World's Only Non-Custodial Centralized Crypto Exchange" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "Trade crypto on a centralized exchange that never takes your keys. Seeds is the easiest way to get started with cryptocurrency — like LocalBitcoins and Binance had a baby.",
      },
      { property: "og:title", content: "Seeds — The World's Only Non-Custodial Centralized Crypto Exchange" },
      {
        property: "og:description",
        content:
          "Trade crypto on a centralized exchange that never takes your keys. Seeds is the easiest way to get started with cryptocurrency — like LocalBitcoins and Binance had a baby.",
      },
    ],
    links: [
      // First paint of the hero: the opening frame where the animation plays, the still tree on phones.
      { rel: "preload", as: "image", href: GENESIS_FIRST_FRAME, media: "(min-width: 640px)" },
      { rel: "preload", as: "image", href: GENESIS_POSTER, media: "(max-width: 639px)" },
    ],
  }),
  // Sponsored spots render on the server too, so the page never jumps when they arrive.
  loader: async ({ context }) => ({
    ads: await context.queryClient.ensureQueryData(liveAdsQuery).catch(() => null),
  }),
  component: Index,
});

// Primary THORChain markets plus the order-book pairs THORChain doesn't trade.
const ACTIVE_MARKETS = THOR_MARKETS.length + PAIRS.filter((p) => !(p.quote === "TSD" && thorMarketForBookBase(p.base))).length;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-l border-border pl-4">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 num text-xl text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Index() {
  const { ads } = Route.useLoaderData();
  const live = useQuery({ ...liveAdsQuery, initialData: ads ?? undefined });
  const spotlight = adsForSpot(live.data?.ads ?? [], "home_spotlight", { nowMs: live.data?.nowMs ?? ads?.nowMs ?? 0 });
  const summary = useQuery({
    queryKey: ["cmc-summary"],
    queryFn: () => getCmcSummary(),
    refetchInterval: 30_000,
  });

  const stats = useQuery({
    queryKey: ["market-stats", "TSD_TXC"],
    queryFn: () => getMarketStats({ data: { pair: "TSD_TXC" } }),
    refetchInterval: 30_000,
  });

  const thor = useQuery(thorMarketsQuery);
  const markets = (thor.data ?? []).slice(0, 6);
  // Seeds' own order-book volume (not THORChain's).
  const totalVolume = (summary.data ?? []).reduce((sum, m) => sum + (m.base_volume ?? 0), 0);

  return (
    <>
      <IgnitePromo />
      <GenesisHero />

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-5 py-8 md:grid-cols-4">
          <Stat label="Active markets" value={String(ACTIVE_MARKETS)} hint="THORChain + Seeds order books" />
          <Stat
            label="24h volume"
            value={totalVolume > 0 ? fmtAmount(totalVolume) : "—"}
            hint="across all markets"
          />
          <Stat
            label="USDC/TXC last"
            value={stats.data?.last != null ? fmtPrice(stats.data.last) : "—"}
            hint="live order book"
          />
          <Stat label="Settlement" value="On-chain" hint="direct from your wallet" />
        </div>
      </section>

      <HomeSpotlight ads={spotlight} />

      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Create an account in seconds",
              body: "Sign in with your Honest.Money membership. No KYC. No deposit forms. No waiting for approvals.",
            },
            {
              n: "02",
              title: "Your wallet, your keys, your coins",
              body: "Link the separate trading pocket in your HME Wallet with a QR code. Your recovery phrase and savings never leave your phone.",
            },
            {
              n: "03",
              title: "Trade like a CEX, settle like a wallet",
              body: "Place limit or market orders on a live order book. Trades settle on-chain from your own trading pocket after you approve in Telegram — no omnibus account.",
            },
          ].map((c) => (
            <div key={c.n} className="bg-surface p-8">
              <p className="font-mono text-xs tracking-[0.2em] text-primary">{c.n}</p>
              <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-foreground">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
                Live markets
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Trade the pairs that matter
              </h2>
            </div>
            <Link
              to="/markets"
              className="font-mono text-xs tracking-wider text-primary uppercase hover:underline"
            >
              View all markets →
            </Link>
          </div>

          <div className="mt-8 overflow-x-auto rounded-sm border border-border">
            <table className="w-full text-left">
              <thead className="bg-surface font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Market</th>
                  <th className="px-4 py-3 text-right">Price (TSD)</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">24h volume</th>
                  <th className="px-4 py-3 text-right">24h change</th>
                  <th className="hidden px-4 py-3 sm:table-cell"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {markets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {thor.error ? marketsErrorText(thor.error) : "Markets loading…"}
                    </td>
                  </tr>
                ) : (
                  markets.map((m) => (
                    <tr key={m.slug} className="hover:bg-surface/50">
                      <td className="px-4 py-4 font-mono text-sm text-foreground">
                        <Link to="/markets/$slug" params={{ slug: m.slug }} className="hover:text-primary">
                          {m.base} / TSD
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-foreground"><Price v={m.price} /></td>
                      <td className="hidden px-4 py-4 text-right num text-sm text-muted-foreground sm:table-cell">{fmtTsdCompact(m.day.volume)}</td>
                      <td className="px-4 py-4 text-right num text-sm"><Change pct={m.day.changePct} /></td>
                      <td className="hidden px-4 py-4 text-right sm:table-cell">
                        <Link
                          to="/markets/$slug"
                          params={{ slug: m.slug }}
                          className="inline-flex rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-wider text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
                        >
                          Chart
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[10px] text-muted-foreground">Live THORChain prices · 1 TSD = $1</p>
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
                Physical cold storage
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                The SEEDS coin.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
                A physical, tamper-evident cold-storage coin that holds your encrypted seed. Tap it
                to your phone, scan the QR, and you're in. No app stores. No seed sheets. No
                complexity. The easiest on-ramp to self-custody ever made.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  Encrypted BIP-39 seed sealed in metal
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  Tap-to-unlock NFC + QR backup
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  $20 — ships worldwide
                </li>
              </ul>
              <div className="mt-8">
                <button
                  disabled
                  className="rounded-md bg-action px-6 py-3 text-sm font-semibold text-action-foreground opacity-60 cursor-not-allowed"
                >
                  Pre-order coming soon
                </button>
              </div>
            </div>
            <div className="flex justify-center md:justify-end">
              <figure className="w-full max-w-sm rounded-md border border-border bg-background p-3 shadow-lg">
                <img
                  src={seedsCoin.url}
                  alt="SEEDS cold-storage coin — copper coin embossed with the Seeds leaf mark and the word seeds"
                  className="aspect-square w-full rounded-sm object-cover ring-1 ring-border"
                  width={1254}
                  height={1254}
                  loading="lazy"
                />
              </figure>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="rounded-sm border border-warn/40 bg-warn/5 p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-warn uppercase">
            Read this before you deposit anything
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Seeds is non-custodial.</strong> You control the
            keys in HME Wallet and link one separate trading pocket for settlement. Trades are
            irreversible once broadcast. Start small, keep only what you are actively trading in the
            pocket, and never share your recovery phrase with anyone.
          </p>
        </div>
      </section>
    </>
  );
}

