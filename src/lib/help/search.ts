import type { HelpArticle, HelpFaq } from "./types";

/** Lowercase words of 2+ letters (keeps numbers and coin tickers like "2fa", "tsd"). */
export function words(s: string): string[] {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
}

export type HelpHit =
  | { kind: "article"; score: number; article: HelpArticle }
  | { kind: "faq"; score: number; faq: HelpFaq };

function blockText(a: HelpArticle): string {
  return a.blocks
    .map((b) => ("h" in b ? b.h : "p" in b ? b.p : "note" in b ? b.note : "steps" in b ? b.steps.join(" ") : b.list.join(" ")))
    .join(" ");
}

/**
 * Every query word must appear somewhere (prefix match, so "withdraw" finds
 * "withdrawals"). Title hits weigh most, then keywords/summary, then body.
 */
export function searchHelp(query: string, articles: HelpArticle[], faqs: HelpFaq[], limit = 12): HelpHit[] {
  const q = words(query);
  if (!q.length) return [];
  const score = (fields: [string, number][]) => {
    const toks = fields.map(([t, w]) => [words(t), w] as const);
    let total = 0;
    for (const qw of q) {
      let best = 0;
      for (const [ws, w] of toks) if (ws.some((x) => x.startsWith(qw))) best = Math.max(best, w);
      if (!best) return 0;
      total += best;
    }
    return total;
  };
  const hits: HelpHit[] = [];
  for (const a of articles) {
    const s = score([[a.title, 10], [(a.keywords ?? []).join(" "), 6], [a.summary, 5], [blockText(a), 1]]);
    if (s) hits.push({ kind: "article", score: s + 0.5, article: a });
  }
  for (const f of faqs) {
    const s = score([[f.q, 8], [f.a, 2]]);
    if (s) hits.push({ kind: "faq", score: s, faq: f });
  }
  return hits.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Split "**bold** text" into pieces; exported for the renderer and tests. */
export function boldParts(s: string): { text: string; bold: boolean }[] {
  return s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) =>
    t.startsWith("**") && t.endsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t, bold: false },
  );
}

/** Slug for a FAQ question, used as its #anchor on /help/faq. */
export function faqId(q: string): string {
  return words(q).slice(0, 8).join("-");
}
