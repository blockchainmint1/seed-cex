import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { HELP_ARTICLES, HELP_CATEGORIES, HELP_FAQS, HELP_SUPPORT, POPULAR, helpArticle } from "./content";
import { searchHelp } from "./search";
import { DEFAULT_TIERS } from "../withdraw-limits";
import { LISTING_PACKAGES } from "../listing";
import { FEE_PREP } from "../fee-prep";
import { DEPOSIT_USD, SEAT_CAPACITY } from "../ignite-registration";
import { LAUNCH_DATE_LABEL } from "../launch";
import { MARKET_SLIPPAGE_OPTIONS, DEFAULT_MARKET_SLIPPAGE_PCT } from "../market-order";

const routeTree = readFileSync(new URL("../../routeTree.gen.ts", import.meta.url), "utf8");
const block = routeTree.slice(routeTree.indexOf("interface FileRoutesByFullPath"));
const PAGES = new Set([...block.slice(0, block.indexOf("}")).matchAll(/'([^']+)':/g)].map((m) => m[1].replace(/\/$/, "") || "/"));

const allText = (a: (typeof HELP_ARTICLES)[number]) =>
  [a.title, a.summary, ...a.blocks.map((b) => Object.values(b).flat().join(" "))].join(" ");
const allLinks = [
  ...HELP_ARTICLES.flatMap((a) => a.links ?? []),
  ...HELP_FAQS.flatMap((f) => f.links ?? []),
  ...HELP_SUPPORT.links,
];

describe("help content structure", () => {
  test("article slugs are unique and URL-safe", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slugs).not.toContain("faq"); // /help/faq is its own page
  });

  test("every topic has guides and every guide has a known topic", () => {
    for (const c of HELP_CATEGORIES) expect(HELP_ARTICLES.some((a) => a.category === c.id)).toBe(true);
    for (const a of HELP_ARTICLES) expect(HELP_CATEGORIES.some((c) => c.id === a.category)).toBe(true);
  });

  test("related guides, FAQ guide links and popular guides all exist", () => {
    for (const a of HELP_ARTICLES) for (const r of a.related ?? []) expect(helpArticle(r)?.slug).toBe(r);
    for (const f of HELP_FAQS) if (f.article) expect(helpArticle(f.article)?.slug).toBe(f.article);
    for (const p of POPULAR) expect(helpArticle(p)?.slug).toBe(p);
  });

  test("every Seeds link points at a real page", () => {
    for (const l of allLinks.filter((l) => l.to.startsWith("/"))) {
      const path = l.to.split("#")[0];
      const ok = PAGES.has(path) || PAGES.has(path.replace(/\/[^/]+$/, "/$slug"));
      if (!ok) throw new Error(`Help link to a missing page: ${l.to}`);
    }
  });

  test("outside links only go to known ecosystem sites", () => {
    for (const l of allLinks.filter((l) => !l.to.startsWith("/"))) {
      expect(l.to).toMatch(/^https:\/\/((help|mobile)\.)?honest\.money$|^https:\/\/t\.me\/seeds_notify_bot$/);
    }
  });

  test("stuck members are sent to help.honest.money", () => {
    expect(HELP_SUPPORT.links.map((l) => l.to)).toContain("https://help.honest.money");
  });
});

describe("help facts match Seeds' own rules", () => {
  const text = (slug: string) => allText(helpArticle(slug)!);
  const money = (n: number) => `$${n.toLocaleString("en-US")}`;

  test("withdrawal levels match the starting levels", () => {
    const t = text("withdrawal-levels");
    for (const tier of DEFAULT_TIERS) {
      expect(t).toContain(`**${tier.name}:** ${money(tier.perWithdrawalUsd)} per withdrawal, ${money(tier.dailyUsd)} a day, ${tier.holdHours}-hour hold`);
    }
  });

  test("listing package prices match /list", () => {
    const t = text("list-coin");
    for (const p of LISTING_PACKAGES) expect(t).toContain(`**${p.name} — ${money(p.priceUsd)}:**`);
  });

  test("network fee suggestions match the setup guide", () => {
    const t = text("network-fees");
    expect(t).toContain(`$${FEE_PREP.ethereum.suggestUsd} in ETH`);
    expect(t).toContain(`$${FEE_PREP.base.suggestUsd} in ETH`);
  });

  test("Ignite deposit and seats match the class page", () => {
    const t = text("ignite");
    expect(t).toContain(`$${DEPOSIT_USD} reservation deposit`);
    expect(t).toContain(`**Seats:** ${SEAT_CAPACITY}.`);
  });

  test("launch date matches the demo banner page", () => {
    expect(text("demo-mode")).toContain(LAUNCH_DATE_LABEL);
  });

  test("market-order protection choices match the order ticket", () => {
    const t = text("limit-market-orders");
    for (const o of MARKET_SLIPPAGE_OPTIONS) expect(t).toContain(`**${o}%**`);
    expect(t).toContain(`**${DEFAULT_MARKET_SLIPPAGE_PCT}%** (default)`);
  });
});

describe("help search", () => {
  const top = (q: string) => searchHelp(q, HELP_ARTICLES, HELP_FAQS)[0];

  test("finds guides by plain words, prefixes and short forms", () => {
    const t1 = top("withdraw");
    expect(t1.kind === "article" ? t1.article.slug : t1.faq.q).toBe("withdraw");
    const t2 = top("2fa");
    expect(t2.kind === "article" && t2.article.slug).toBe("two-factor");
    const t3 = top("link wallet");
    expect(t3.kind === "article" && t3.article.slug).toBe("link-wallet");
  });

  test("blank or unmatched searches return nothing", () => {
    expect(searchHelp("  ", HELP_ARTICLES, HELP_FAQS)).toEqual([]);
    expect(searchHelp("zzqxv", HELP_ARTICLES, HELP_FAQS)).toEqual([]);
  });
});
