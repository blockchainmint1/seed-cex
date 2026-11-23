import { createFileRoute } from "@tanstack/react-router";
import { getRouterInstance } from "@tanstack/react-start";
import { sitemapStaticPaths, sitemapXML, type SitemapEntry } from "@/lib/sitemap";
import { HELP_ARTICLES } from "@/lib/help/content";

const BASE_URL = "https://seeds.honest.money";

export const Route = createFileRoute("/sitemap.xml")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async () => {
        if (!BASE_URL) {
          return new Response("Sitemap domain not configured", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
        const router = await getRouterInstance();
        const entries: SitemapEntry[] = sitemapStaticPaths(router).map((path) => ({ path }));
        // Help guides live on one dynamic route; list each article.
        for (const a of HELP_ARTICLES) entries.push({ path: `/help/${a.slug}` });
        // Published Ignite classes each have a page (/flight-school/<slug>); drafts never appear.
        try {
          const { publicClasses } = await import("@/lib/ignite-classes.server");
          for (const c of await publicClasses()) entries.push({ path: `/flight-school/${c.slug}` });
        } catch (e) { console.error("[sitemap] ignite classes", e instanceof Error ? e.message : e); }
        if (entries.length === 0) {
          return new Response(
            'No pages are included in this sitemap. Check route decisions and ancestor exclusions. Setting "exclude-subtree" on the root excludes the entire site.',
            { status: 404, headers: { "Cache-Control": "no-store" } },
          );
        }
        return new Response(sitemapXML(BASE_URL, entries), {
          headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
