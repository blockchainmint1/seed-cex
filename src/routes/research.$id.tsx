import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { getAnyCoin } from "@/lib/markets/coin-search.functions";
import { AboutPanel, LinksCard, MarketDataCard } from "@/components/markets/research/CoinResearch";
import { CoinSearch } from "@/components/markets/research/CoinSearch";

const coinQuery = (id: number) => ({ queryKey: ["any-coin", id], queryFn: () => getAnyCoin({ data: { id } }), staleTime: 5 * 60_000 });

export const Route = createFileRoute("/research/$id")({
  staticData: { sitemap: false },
  loader: async ({ params }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound();
    return getAnyCoin({ data: { id } }).catch(() => null);
  },
  head: ({ loaderData }) => {
    const p = loaderData?.profile;
    const t = p ? `${p.name} (${p.symbol}) research — Seeds` : "Coin research — Seeds";
    const d = p ? `${p.name} price, market cap, supply and links${loaderData?.onSeeds ? ", plus its Seeds market" : ""}.` : "Look up any coin on Seeds.";
    return {
      meta: [
        { title: t }, { name: "description", content: d },
        { property: "og:title", content: t }, { property: "og:description", content: d },
        { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: CoinResearchPage,
});

function CoinResearchPage() {
  const { id } = Route.useParams();
  const initial = Route.useLoaderData();
  const r = useQuery({ ...coinQuery(Number(id)), initialData: initial ?? undefined });
  const [q, setQ] = useState("");
  const p = r.data?.profile ?? null;
  const on = r.data?.onSeeds ?? null;
  const btn = "inline-flex items-center gap-1.5 rounded-sm bg-action px-4 py-2 text-sm font-semibold text-action-foreground hover:opacity-90";
  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/research" className="text-sm text-muted-foreground hover:text-primary">← Research</Link>
        <CoinSearch value={q} onChange={setQ} />
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="flex items-center gap-3 font-display text-3xl font-extrabold tracking-tight">
          {p?.logo ? <img src={p.logo} alt="" className="h-9 w-9 rounded-full" /> : null}
          {p?.name ?? (r.isLoading ? "Loading…" : "Coin not found")}
          {p ? <span className="font-mono text-base text-muted-foreground">{p.symbol}</span> : null}
          {p?.price != null ? (
            <span className="ml-2 font-mono text-2xl text-foreground">
              ${p.price >= 1 ? p.price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : p.price.toPrecision(4)}
              {p.change.d1 != null ? <span className={`ml-2 text-sm ${p.change.d1 >= 0 ? "text-primary" : "text-destructive"}`}>{p.change.d1 >= 0 ? "+" : ""}{p.change.d1.toFixed(2)}%</span> : null}
            </span>
          ) : null}
        </h1>
        {on ? (
          on.kind === "book"
            ? <a href={on.to} className={btn}>{on.label} <ArrowRight className="h-4 w-4" /></a>
            : <Link to="/markets/$slug" params={{ slug: on.slug }} className={btn}>Open {on.label} <ArrowRight className="h-4 w-4" /></Link>
        ) : p ? (
          <p className="max-w-sm text-right text-xs text-muted-foreground">
            {p.name} doesn't trade on Seeds yet. Projects can apply on the <Link to="/list" className="text-primary hover:underline">listing page</Link>.
          </p>
        ) : null}
      </div>
      {!p && !r.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">We couldn't load this coin right now. Try searching again in a moment.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-6">
            <MarketDataCard profile={p} base={p?.symbol ?? ""} loading={r.isLoading} priceSource="cmc" />
            <AboutPanel profile={p} name={p?.name ?? ""} />
          </div>
          <LinksCard profile={p} name={p?.name ?? ""} />
        </div>
      )}
      <p className="mt-10 text-xs text-muted-foreground">Coin facts come from CoinMarketCap. For information only — not advice.</p>
    </div>
  );
}
