import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CoinSearch } from "@/components/markets/research/CoinSearch";

const POPULAR: [string, string][] = [["32196", "Hyperliquid"], ["1", "Bitcoin"], ["1027", "Ethereum"], ["5426", "Solana"], ["52", "XRP"], ["74", "Dogecoin"]];

export const Route = createFileRoute("/research/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Coin research — look up any crypto | Seeds" },
      { name: "description", content: "Look up price, market cap, supply, links and background for almost any coin, and jump to its Seeds market when it trades here." },
      { property: "og:title", content: "Coin research | Seeds" },
      { property: "og:description", content: "Look up almost any coin and jump to its Seeds market when it trades here." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResearchPage,
});

function ResearchPage() {
  const [q, setQ] = useState("");
  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Research</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Look up any coin</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Type a name or ticker to see its price, market size, supply and links. If it trades on Seeds, you'll get a button straight to its market.
      </p>
      <div className="mt-6"><CoinSearch value={q} onChange={setQ} /></div>
      <p className="mt-8 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">People are looking at</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {POPULAR.map(([id, name]) => (
          <Link key={id} to="/research/$id" params={{ id }} className="rounded-sm border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary hover:text-primary">{name}</Link>
        ))}
      </div>
      <p className="mt-10 max-w-3xl text-xs text-muted-foreground">
        Coin facts come from CoinMarketCap. Research is for information only — it isn't advice, and a coin showing here doesn't mean Seeds lists it.
      </p>
    </div>
  );
}
