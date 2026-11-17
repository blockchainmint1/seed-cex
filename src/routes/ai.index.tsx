import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { aiCoinsQuery } from "@/lib/ai/market";
import { defaultPlan, type PlanSettings } from "@/lib/ai/plan";
import { useSession } from "@/hooks/use-session";
import { PlanBuilder } from "@/components/ai/PlanBuilder";
import { CoinsTable } from "@/components/ai/CoinsTable";
import { MyPlans } from "@/components/ai/MyPlans";
import { Chip } from "@/components/ai/ui";

export const Route = createFileRoute("/ai/")({
  staticData: { sitemap: true },
  validateSearch: (s: Record<string, unknown>): { plan?: string } => ({
    plan: typeof s.plan === "string" && /^[0-9a-f-]{36}$/i.test(s.plan) ? s.plan : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Seeds AI — test a crypto plan on real history, then lock it in" },
      { name: "description", content: "Try crypto plans against years of real daily prices: a BTC/ETH/LTC basket, momentum rules, stop-losses and fees. Lock in the one you like and get a daily plan check on Telegram." },
      { property: "og:title", content: "Seeds AI — test a plan, then lock it in" },
      { property: "og:description", content: "Back-test a crypto basket on real daily prices, then get a daily \"based on your plan, we should…\" check." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPage,
});

function AiPage() {
  const { plan } = Route.useSearch();
  const { user } = useSession();
  const coinsQ = useQuery(aiCoinsQuery);
  const [tab, setTab] = useState<"plan" | "coins">("plan");
  const [settings, setSettings] = useState<PlanSettings>(defaultPlan);
  useEffect(() => {
    if (plan) setTimeout(() => document.getElementById("my-plans")?.scrollIntoView({ behavior: "smooth" }), 600);
  }, [plan]);
  const coins = coinsQ.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-5 py-14">
      <header className="space-y-3">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.28em] text-primary uppercase">
          <Sparkles className="h-3.5 w-3.5" /> Seeds AI
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">Test your theory. Then lock it in.</h1>
        <p className="max-w-2xl text-muted-foreground">
          Play with years of real daily prices for every coin Seeds can buy. Try a basket like Bitcoin, Ether and Litecoin, or a
          rule like "hold whatever's strongest", with real fees counted. When you find one you like, lock it in and Seeds checks it
          for you every day.
        </p>
      </header>

      <div className="flex gap-1" role="tablist">
        <Chip on={tab === "plan"} onClick={() => setTab("plan")}>Test a plan</Chip>
        <Chip on={tab === "coins"} onClick={() => setTab("coins")}>Coins & theories</Chip>
      </div>

      {coinsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading coins…</p>
      ) : coinsQ.error ? (
        <p className="text-sm text-destructive">Couldn't load coins. Refresh to try again.</p>
      ) : tab === "plan" ? (
        <PlanBuilder coins={coins} settings={settings} onChange={setSettings} signedIn={Boolean(user)} />
      ) : (
        <div className="space-y-3">
          <p className="max-w-3xl text-sm text-muted-foreground">
            Open a coin to see its chart and how 10 popular chart theories actually played out in its history.
          </p>
          <CoinsTable coins={coins} />
          <p className="text-xs text-muted-foreground">Prices: Binance daily closes in USDT where listed, otherwise CoinGecko. Saved once a day.</p>
        </div>
      )}

      {user ? (
        <MyPlans coins={coins} highlight={plan} onLoad={(s) => { setSettings({ ...defaultPlan, ...s, start: defaultPlan.start, amount: settings.amount }); setTab("plan"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link to="/auth" search={{ redirect: "/ai" }} className="font-semibold text-primary underline">Sign in</Link> to see your locked plans.
        </p>
      )}
    </div>
  );
}
