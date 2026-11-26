import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Check, ShieldCheck, Users, Trophy, GraduationCap, Sprout, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfluencerInvite } from "@/components/site/InfluencerInvite";
import poster from "@/assets/genesis/seeds_genesis_final_poster_supplied.jpg.asset.json";

const description = "Bring your community to Seeds: non-custodial trading, AI baskets and your personal affiliate link. Honest trade-offs and individually agreed partner rewards.";
export const Route = createFileRoute("/influencers")({
  staticData: { sitemap: true },
  head: () => ({ meta: [
    { title: "Influencers, traders & affiliates — Seeds" }, { name: "description", content: description },
    { property: "og:title", content: "Build your trading community with Seeds" }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: InfluencersPage,
});

const good = [
  ["Your wallet, not an exchange balance", "Coins stay in your own trading pocket. Seeds receives limited signing access for supported actions, not your savings wallet. Outside withdrawals need email, authenticator and Telegram approval."],
  ["No Seeds trading fee", "No Seeds deposit or withdrawal fee either. Blockchain fees and third-party route costs still apply, with no Seeds markup."],
  ["A team you can hold accountable", "Part of the Honest Money Ecosystem, home to TXC, ISK and ZCU. Read our code, our manifesto and our risk disclosures instead of taking a slogan on trust."],
  ["Something worth teaching", "Build AI baskets, test strategies against price history and track a basket's Seeds buys and sells. Bring a community that wants to learn, not just chase the next ticker."],
];
const tradeoffs = [
  ["Slower than the big exchanges", "On-chain settlement and multi-step routes take time. Seeds is not built for high-frequency trading or instant cross-chain fills."],
  ["Spot trading, not leverage", "No perpetuals, options or margin. If your strategy depends on borrowed exposure, Seeds is not the place for it."],
  ["Smaller books, fewer tools", "Liquidity and coin coverage vary. Large orders may not fill as expected; some routes need several steps and fees can outweigh a small trade."],
  ["More responsibility, not zero risk", "You must protect your recovery backup and approvals. Limited signing access, software, networks and outside swap services still carry risk. Non-custodial does not mean risk-free."],
];

function InfluencersPage() {
  return <main className="mx-auto max-w-7xl px-5 pb-16">
    <section className="relative isolate -mx-5 overflow-hidden border-b border-border">
      <img src={poster.url} alt="Seeds Genesis artwork" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-background/90" />
      <div className="px-5 py-14 sm:py-20 lg:py-24">
        <p className="font-mono text-xs uppercase text-primary">Influencers · Traders · Affiliates</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">Seeds for your community.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">Tired of asking your followers to trust another exchange? Bring them somewhere built around their own wallets, honest trade-offs and real people.</p>
        <div className="mt-8 flex flex-wrap items-center gap-4"><Button asChild size="lg"><a href="#your-link">Get your affiliate link <ArrowUpRight /></a></Button><Button asChild variant="outline" size="lg"><Link to="/ai">Explore AI baskets <Sprout /></Link></Button></div>
        <p className="mt-6 text-xs text-muted-foreground">No return promises. No trading-volume quota. Partnership rewards agreed individually.</p>
      </div>
    </section>

    <InfluencerInvite />

    <section className="py-14">
      <div className="flex items-center gap-3 text-primary"><ShieldCheck className="size-5" /><p className="font-mono text-xs uppercase">The honest comparison</p></div>
      <h2 className="mt-3 text-3xl font-bold">The good. The bad. No fine-print surprise.</h2>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div><h3 className="border-b border-border pb-4 text-xl font-semibold">Why Seeds is different</h3>{good.map(([title, text]) => <article key={title} className="flex gap-3 border-b border-border py-5"><Check className="mt-1 size-4 shrink-0 text-primary" /><div><h4 className="font-semibold">{title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div></article>)}</div>
        <div><h3 className="border-b border-border pb-4 text-xl font-semibold">What you might not like</h3>{tradeoffs.map(([title, text]) => <article key={title} className="flex gap-3 border-b border-border py-5"><Minus className="mt-1 size-4 shrink-0 text-warning" /><div><h4 className="font-semibold">{title}</h4><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></div></article>)}</div>
      </div>
      <p className="mt-7 max-w-3xl text-sm leading-relaxed text-muted-foreground">We are real people building an alternative to the exchange trust trap. We won't ask you to call it impossible to lose money or impossible to fail. Your community deserves proof, not a “we can't rug you” guarantee.</p>
      <div className="mt-4 flex flex-wrap gap-5 text-sm text-primary"><Link to="/how-it-works" className="hover:underline">How trading works ↗</Link><Link to="/proof/code" className="hover:underline">Inspect our code ↗</Link><Link to="/risk" className="hover:underline">Read the risks ↗</Link></div>
    </section>

    <section className="border-y border-border py-14">
      <p className="font-mono text-xs uppercase text-primary">Build more than a following</p><h2 className="mt-3 text-3xl font-bold">Bring your people. Help them grow.</h2>
      <div className="mt-8 grid gap-8 md:grid-cols-3">
        <article><Users className="size-6 text-primary" /><p className="mt-4 text-xs font-mono text-primary uppercase">Available now</p><h3 className="mt-2 text-xl font-semibold">Bring your community</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Share your link and see clicks, new members, wallet setup and how many people began trading. Individual balances and trade amounts stay private.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">We agree rewards with each partner individually. Rates, eligibility and payment terms must be settled before a campaign starts; referral counts are not a payout balance.</p></article>
        <article><Trophy className="size-6 text-warning" /><p className="mt-4 text-xs font-mono text-warning uppercase">Planned · not enrolling yet</p><h3 className="mt-2 text-xl font-semibold">Lead a basket challenge</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Influencer versus influencer. Community versus community. Build AI baskets, explain your decisions and help your members improve alongside you.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">The basket builder and position tracker exist today. Competition entry, rankings and prizes are not live. Fair scoring, risk rules and permitted routes come first.</p><Link to="/ai" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">Try the basket builder <ArrowUpRight className="size-4" /></Link></article>
        <article><GraduationCap className="size-6 text-primary" /><p className="mt-4 text-xs font-mono text-warning uppercase">Planned integration</p><h3 className="mt-2 text-xl font-semibold">Teach with cryptoU.ai</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Turn a strategy into a lesson: wallet safety, first trades, basket building and what went right or wrong. Teaching through cryptoU.ai is planned, not connected yet.</p><p className="mt-3 text-sm leading-relaxed text-muted-foreground">For current ecosystem classes, explore To the Moon. Instructor opportunities and course terms are agreed separately.</p><Link to="/to-the-moon" className="mt-4 inline-flex items-center gap-2 text-sm text-primary hover:underline">Current classes <ArrowUpRight className="size-4" /></Link></article>
      </div>
    </section>

    <section className="py-14"><p className="font-mono text-xs uppercase text-primary">Let's shape this together</p><h2 className="mt-3 text-3xl font-bold">A partnership worth putting your name on.</h2><p className="mt-4 max-w-2xl text-muted-foreground">Ideas we'd like to explore with community leaders — not benefits we're promising today.</p><div className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2">{[
      ["A first-trade welcome session", "Bring new members into a live, small-group session on wallet safety, fees and their first basket."],
      ["A strategy people can learn from", "Share a basket's reasoning and review its results, including losses. Teach decisions, not guaranteed winners."],
      ["Community office hours", "Regular conversations with the Seeds team, plus a direct channel for useful feedback and feature priorities."],
      ["An honest creator kit", "Co-branded explainers, clear risk disclosures and campaign materials that make affiliate relationships obvious."],
    ].map(([title, text]) => <article key={title} className="border-l-2 border-border pl-5"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></article>)}</div><div className="mt-8 flex flex-wrap gap-3"><Button asChild variant="outline"><Link to="/help">Connect with the team <ArrowUpRight /></Link></Button><Button asChild variant="ghost"><Link to="/manifesto">Read our manifesto <ArrowUpRight /></Link></Button></div><p className="mt-5 text-xs leading-relaxed text-muted-foreground">Disclose affiliate relationships. Never promise returns or encourage needless trades to earn rewards. AI real buying is currently a tester feature; other members can research and build plans. Competition rules require separate review and will not use routes whose providers prohibit contests.</p></section>
  </main>;
}