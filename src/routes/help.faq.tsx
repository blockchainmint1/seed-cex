import { createFileRoute, Link } from "@tanstack/react-router";
import { Crumbs, LinkButtons, Rich } from "@/components/help/HelpBits";
import { HelpSearch } from "@/components/help/HelpSearch";
import { HELP_CATEGORIES, HELP_FAQS, helpArticle } from "@/lib/help/content";
import { faqId } from "@/lib/help/search";

const title = "Seeds FAQ — Frequently Asked Questions";
const description =
  "Quick answers about Seeds: no KYC, no Seeds trading fees, signing in with Honest.Money, the HME Wallet trading pocket, withdrawals, P2P, swaps, Seeds AI and Ignite.";

export const Route = createFileRoute("/help/faq")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HELP_FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\*\*/g, "") },
          })),
        }),
      },
    ],
  }),
  component: Faq,
});

function Faq() {
  const groups = HELP_CATEGORIES.map((c) => ({ c, list: HELP_FAQS.filter((f) => f.category === c.id) })).filter((g) => g.list.length);
  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <Crumbs items={[{ label: "Help", to: "/help" }, { label: "FAQ" }]} />
      <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Frequently asked questions</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Short answers. Each one links to the full guide when there's more to it.</p>
      <div className="mt-6">
        <HelpSearch />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {groups.map(({ c }) => (
          <a key={c.id} href={`#faq-${c.id}`} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">
            {c.title}
          </a>
        ))}
      </div>
      <div className="mt-8 max-w-3xl space-y-10">
        {groups.map(({ c, list }) => (
          <section key={c.id} id={`faq-${c.id}`} className="scroll-mt-24">
            <h2 className="font-display text-xl font-bold">{c.title}</h2>
            <div className="mt-3 divide-y divide-border rounded-md border border-border bg-card">
              {list.map((f) => {
                const art = f.article ? helpArticle(f.article) : null;
                return (
                  <details key={f.q} id={faqId(f.q)} className="group scroll-mt-24 px-5 py-1 target:bg-primary/5" open={false}>
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-3 text-sm font-semibold text-foreground">
                      {f.q}
                      <span aria-hidden className="font-mono text-primary group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <div className="space-y-3 pb-4 text-sm leading-relaxed text-muted-foreground">
                      <p><Rich text={f.a} /></p>
                      {f.links?.length ? <LinkButtons links={f.links} /> : null}
                      {art ? (
                        <Link to="/help/$slug" params={{ slug: art.slug }} className="inline-block text-xs font-semibold text-primary hover:underline">
                          Full guide: {art.title} →
                        </Link>
                      ) : null}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
