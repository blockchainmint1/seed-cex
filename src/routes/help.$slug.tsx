import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Blocks, Crumbs, LinkButtons } from "@/components/help/HelpBits";
import { HELP_ARTICLES, HELP_REVIEWED, HELP_SUPPORT, categoryOf, helpArticle } from "@/lib/help/content";

export const Route = createFileRoute("/help/$slug")({
  // Listed in /sitemap.xml from the article list (dynamic path).
  staticData: { sitemap: false },
  loader: ({ params }) => {
    const a = helpArticle(params.slug);
    if (!a) throw notFound();
    return { slug: a.slug };
  },
  head: ({ loaderData }) => {
    const a = loaderData ? helpArticle(loaderData.slug) : null;
    if (!a) return { meta: [{ title: "Help article not found — Seeds" }, { name: "robots", content: "noindex" }] };
    const t = `${a.title} — Seeds Help`;
    return {
      meta: [
        { title: t },
        { name: "description", content: a.summary },
        { property: "og:title", content: t },
        { property: "og:description", content: a.summary },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `https://seeds.honest.money/help/${a.slug}` }],
    };
  },
  component: Article,
  notFoundComponent: () => (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <h1 className="font-display text-2xl font-bold">That help page doesn't exist</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have moved. Search the help center instead.</p>
      <Link to="/help" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">← Help center</Link>
    </div>
  ),
});

function Article() {
  const { slug } = Route.useLoaderData();
  const a = helpArticle(slug)!;
  const cat = categoryOf(a.category);
  const related = (a.related ?? []).map((s) => helpArticle(s)).filter((x) => x != null);
  const more = HELP_ARTICLES.filter((x) => x.category === a.category && x.slug !== a.slug && !a.related?.includes(x.slug));
  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <article className="max-w-3xl">
          <Crumbs items={[{ label: "Help", to: "/help" }, { label: cat.title, to: `/help#${cat.id}` }]} />
          <h1 className="mt-4 font-display text-3xl leading-tight font-extrabold tracking-tight text-foreground md:text-4xl">{a.title}</h1>
          <p className="mt-3 text-lg leading-relaxed text-foreground/90">{a.summary}</p>
          <div className="mt-8">
            <Blocks blocks={a.blocks} />
          </div>
          {a.links?.length ? (
            <div className="mt-8">
              <LinkButtons links={a.links} />
            </div>
          ) : null}
          <p className="mt-10 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground">
            Checked against Seeds on {HELP_REVIEWED}. Seeds is in demo mode until trading launches, so some steps may change.
          </p>
        </article>
        <aside className="mt-12 space-y-6 lg:mt-0">
          {related.length ? <SideList title="Related guides" items={related} /> : null}
          {more.length ? <SideList title={`More in ${cat.title}`} items={more.slice(0, 6)} /> : null}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Need a hand?</p>
            <p className="mt-1 text-xs text-muted-foreground">{HELP_SUPPORT.short}</p>
            <Link to="/help/faq" className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Read the FAQ →</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SideList({ title, items }: { title: string; items: { slug: string; title: string }[] }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((r) => (
          <li key={r.slug}>
            <Link to="/help/$slug" params={{ slug: r.slug }} className="text-sm text-foreground hover:text-primary">
              {r.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
