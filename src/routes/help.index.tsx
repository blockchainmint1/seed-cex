import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Coins, KeyRound, LineChart, Repeat, Rocket, Sparkles, Users, Wallet } from "lucide-react";
import { HelpSearch } from "@/components/help/HelpSearch";
import { SmartLink } from "@/components/help/HelpBits";
import { HELP_ARTICLES, HELP_CATEGORIES, HELP_FAQS, HELP_SUPPORT, POPULAR } from "@/lib/help/content";
import { faqId } from "@/lib/help/search";
import type { HelpCategoryId } from "@/lib/help/types";

const title = "Help Center — Guides & FAQ | Seeds";
const description =
  "Step-by-step guides and answers for Seeds: signing in with Honest.Money, linking your HME Wallet trading pocket, two-factor, deposits, withdrawals, trading, P2P, swaps and Seeds AI.";

export const Route = createFileRoute("/help/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: "Seeds Help Center" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpHome,
});

const ICONS: Record<HelpCategoryId, typeof Rocket> = {
  start: Rocket,
  account: KeyRound,
  wallet: Wallet,
  money: Coins,
  trading: LineChart,
  p2p: Users,
  swaps: Repeat,
  ai: Sparkles,
  more: BookOpen,
};

function HelpHome() {
  const popular = POPULAR.map((s) => HELP_ARTICLES.find((a) => a.slug === s)!).filter(Boolean);
  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">Help center</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-5xl">How can we help?</h1>
      <p className="mt-3 max-w-2xl text-base text-muted-foreground">
        Plain-English guides for everything on Seeds, from your first sign-in to your first trade. Search, or pick a topic.
      </p>
      <div className="mt-6">
        <HelpSearch />
      </div>

      <h2 className="mt-12 font-display text-xl font-bold">Popular guides</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {popular.map((a) => (
          <Link
            key={a.slug}
            to="/help/$slug"
            params={{ slug: a.slug }}
            className="group rounded-sm border border-border bg-surface p-4 transition-colors hover:border-primary"
          >
            <span className="text-sm font-semibold text-foreground group-hover:text-primary">{a.title}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{a.summary}</span>
          </Link>
        ))}
      </div>

      <h2 className="mt-12 font-display text-xl font-bold">Browse by topic</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {HELP_CATEGORIES.map((c) => {
          const Icon = ICONS[c.id];
          const list = HELP_ARTICLES.filter((a) => a.category === c.id);
          return (
            <section key={c.id} id={c.id} className="scroll-mt-24 rounded-md border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                <h3 className="font-display text-base font-bold text-foreground">{c.title}</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.blurb}</p>
              <ul className="mt-4 space-y-2">
                {list.map((a) => (
                  <li key={a.slug}>
                    <Link
                      to="/help/$slug"
                      params={{ slug: a.slug }}
                      className="flex items-start gap-2 text-sm text-foreground hover:text-primary"
                    >
                      <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Common questions</h2>
        <Link to="/help/faq" className="text-sm font-semibold text-primary hover:underline">
          All {HELP_FAQS.length} questions →
        </Link>
      </div>
      <div className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
        {HELP_FAQS.slice(0, 6).map((f) => (
          <Link key={f.q} to="/help/faq" hash={faqId(f.q)} className="block px-5 py-3.5 text-sm font-semibold text-foreground hover:text-primary">
            {f.q}
          </Link>
        ))}
      </div>

      <section className="mt-12 rounded-md border border-primary/40 bg-primary/10 p-6">
        <h2 className="font-display text-xl font-bold text-foreground">Still stuck?</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{HELP_SUPPORT.blurb}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {HELP_SUPPORT.links.map((l) => (
            <SmartLink
              key={l.to}
              to={l.to}
              className="inline-flex items-center gap-1.5 rounded-sm bg-action px-3.5 py-2 text-sm font-semibold text-action-foreground hover:brightness-105"
            >
              {l.label}
            </SmartLink>
          ))}
        </div>
      </section>
    </div>
  );
}
