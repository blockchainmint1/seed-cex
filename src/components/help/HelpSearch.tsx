import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { HELP_ARTICLES, HELP_FAQS, categoryOf } from "@/lib/help/content";
import { faqId, searchHelp } from "@/lib/help/search";

/** Instant search across every guide and FAQ answer (all in the page already; nothing is sent anywhere). */
export function HelpSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => searchHelp(q, HELP_ARTICLES, HELP_FAQS), [q]);
  const typed = q.trim().length >= 2;
  return (
    <div className="w-full max-w-2xl">
      <label className="relative block">
        <span className="sr-only">Search help</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search help — e.g. link wallet, withdraw, 2FA, P2P"
          className="w-full rounded-md border border-border bg-card py-3.5 pr-4 pl-11 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </label>
      {typed ? (
        <div className="mt-3 overflow-hidden rounded-md border border-border bg-card" role="region" aria-live="polite" aria-label="Search results">
          {hits.length ? (
            <ul className="divide-y divide-border">
              {hits.map((h) =>
                h.kind === "article" ? (
                  <li key={"a" + h.article.slug}>
                    <Link to="/help/$slug" params={{ slug: h.article.slug }} className="block px-4 py-3 hover:bg-accent">
                      <span className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase">
                        Guide · {categoryOf(h.article.category).title}
                      </span>
                      <span className="mt-0.5 block text-sm font-semibold text-foreground">{h.article.title}</span>
                      <span className="block text-xs text-muted-foreground">{h.article.summary}</span>
                    </Link>
                  </li>
                ) : (
                  <li key={"f" + h.faq.q}>
                    <Link to="/help/faq" hash={faqId(h.faq.q)} className="block px-4 py-3 hover:bg-accent">
                      <span className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase">Question</span>
                      <span className="mt-0.5 block text-sm font-semibold text-foreground">{h.faq.q}</span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">{h.faq.a.replace(/\*\*/g, "")}</span>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              Nothing matched “{q.trim()}”. Try fewer words, or browse the topics below.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
