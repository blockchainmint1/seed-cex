/** Help center content model (pure data, client-safe). */

export type HelpCategoryId =
  | "start"
  | "account"
  | "wallet"
  | "money"
  | "trading"
  | "p2p"
  | "swaps"
  | "ai"
  | "more";

export type HelpCategory = { id: HelpCategoryId; title: string; blurb: string };

/** A link to a Seeds page (same-site path) or an outside site (https URL). */
export type HelpLink = { label: string; to: string };

/**
 * One piece of an article. Text supports **bold** only; links go in `links`
 * so every destination stays checkable by the tests.
 */
export type HelpBlock =
  | { h: string }
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { note: string; tone?: "info" | "warn" };

export type HelpArticle = {
  slug: string;
  title: string;
  /** One or two sentences: shown on cards, in search results and as the page description. */
  summary: string;
  category: HelpCategoryId;
  blocks: HelpBlock[];
  /** Buttons at the end of the article ("Go to Account → Security"). */
  links?: HelpLink[];
  /** Slugs of other articles. */
  related?: string[];
  /** Extra words people might search for. */
  keywords?: string[];
};

export type HelpFaq = { q: string; a: string; category: HelpCategoryId; links?: HelpLink[]; article?: string };
