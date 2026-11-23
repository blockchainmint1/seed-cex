/*
 * Sponsored spots on Seeds (pure, tested). Decides which ads may run, where,
 * how many show at once, which links are allowed, and what fills a spot no
 * one has paid for. Nothing here touches money, prices, rankings or AI plans.
 *
 * Bobby (Nov 21 2026): advertisers are the Honest Money ecosystem and coin
 * teams listed on Seeds only — no outside companies.
 */

export const AD_SPOTS = ["home_spotlight", "markets_row", "coin_side", "coin_story", "coin_banner"] as const;
export type AdSpot = (typeof AD_SPOTS)[number];

export const ADVERTISER_KINDS = ["ecosystem", "listed_coin"] as const;
export type AdvertiserKind = (typeof ADVERTISER_KINDS)[number];

export const AD_ACCENTS = ["green", "amber", "ivory", "forest"] as const;
export type AdAccent = (typeof AD_ACCENTS)[number];

export type SpotInfo = {
  label: string;
  where: string;
  /** How many ads show in the spot at once. */
  max: number;
  /** Coin-page spots can target one coin page or every coin page. */
  coinTargeted: boolean;
  /** Unsold spots show Seeds' own news; the rest stay empty. */
  houseFill: boolean;
};

export const SPOT_INFO: Record<AdSpot, SpotInfo> = {
  home_spotlight: { label: "Homepage spotlight", where: "Three cards under the homepage stats strip", max: 3, coinTargeted: false, houseFill: true },
  markets_row: { label: "Markets sponsored row", where: "One labelled row above the Markets price table", max: 1, coinTargeted: false, houseFill: false },
  coin_side: { label: "Coin page side card", where: "One box in the right column of coin pages", max: 1, coinTargeted: true, houseFill: true },
  coin_story: { label: "Sponsored story", where: "One labelled story in a coin page's news list", max: 1, coinTargeted: true, houseFill: false },
  coin_banner: { label: "Slim coin banner", where: "One line under the coin name, above the chart", max: 1, coinTargeted: true, houseFill: true },
};

export const ADVERTISER_KIND_LABEL: Record<AdvertiserKind, string> = {
  ecosystem: "Honest Money ecosystem",
  listed_coin: "Coin listed on Seeds",
};

/** Where a sponsored story sits in the news list (after this many headlines). */
export const STORY_AFTER = 2;

export type Ad = {
  id: string;
  spot: AdSpot;
  advertiser: string;
  advertiser_kind: AdvertiserKind;
  title: string;
  body: string;
  cta_label: string;
  link: string;
  coin_slug: string | null;
  accent: AdAccent;
  starts_at: string;
  ends_at: string | null;
};

/** What a page renders: a paid ad (labelled "Sponsored") or Seeds' own note ("From Seeds"). */
export type ShownAd = Ad & { house: boolean };

/**
 * A link an ad may point to: a Seeds page ("/flight-school") or an https address.
 * Never http, javascript:, data:, protocol-relative ("//x") or backslash tricks.
 * Returns the cleaned link, or null when it isn't allowed.
 */
export function safeAdLink(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s || s.length > 500 || /[\s\\<>"'`]/.test(s)) return null;
  if (s === "/") return s;
  if (s.startsWith("/")) return /^\/[A-Za-z0-9_-]/.test(s) ? s : null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return null;
  if (!/^[A-Za-z0-9.-]+$/.test(u.hostname) || !u.hostname.includes(".")) return null;
  return u.toString();
}

export const isExternalLink = (link: string): boolean => link.startsWith("https://");

/** Running right now: not paused, started, not ended. */
export function isRunning(ad: { starts_at: string; ends_at: string | null; paused?: boolean }, nowMs: number): boolean {
  if (ad.paused) return false;
  const start = Date.parse(ad.starts_at);
  if (!Number.isFinite(start) || start > nowMs) return false;
  if (ad.ends_at == null) return true;
  const end = Date.parse(ad.ends_at);
  return Number.isFinite(end) && end > nowMs;
}

/** Same rotation for everyone on a given UTC day, so paid ads share a busy spot fairly. */
export const rotationSeed = (nowMs: number): number => Math.floor(nowMs / 86_400_000);

/**
 * Paid ads for one spot on one page. Coin spots prefer ads aimed at this coin
 * over "every coin page" ads. Ads from anyone other than the ecosystem or a
 * listed coin are dropped even if they reach the database.
 */
export function pickAds(ads: readonly Ad[], spot: AdSpot, opts: { coinSlug?: string | null; nowMs: number }): Ad[] {
  const info = SPOT_INFO[spot];
  const ok = ads.filter((a) =>
    a.spot === spot &&
    (ADVERTISER_KINDS as readonly string[]).includes(a.advertiser_kind) &&
    safeAdLink(a.link) !== null &&
    isRunning(a, opts.nowMs) &&
    (!info.coinTargeted ? true : a.coin_slug == null || a.coin_slug === (opts.coinSlug ?? null)),
  );
  const byId = (x: Ad, y: Ad) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const aimed = info.coinTargeted ? ok.filter((a) => a.coin_slug != null).sort(byId) : [];
  const general = (info.coinTargeted ? ok.filter((a) => a.coin_slug == null) : ok).sort(byId);
  const rotate = (list: Ad[]) => {
    if (list.length <= 1) return list;
    const k = rotationSeed(opts.nowMs) % list.length;
    return [...list.slice(k), ...list.slice(0, k)];
  };
  return [...rotate(aimed), ...rotate(general)].slice(0, info.max);
}

const HOUSE_START = "2026-11-01T00:00:00Z";
/** Flight School's first class (Spark) ends Dec 4 2026, 6:30 PM CST. */
const IGNITE_UNTIL = "2026-12-05T00:30:00Z";

function house(id: string, spot: AdSpot, x: Omit<Ad, "id" | "spot" | "advertiser" | "advertiser_kind" | "coin_slug" | "starts_at" | "ends_at"> & { ends_at?: string | null }): ShownAd {
  return {
    id: `house-${spot}-${id}`, spot, advertiser: "Seeds", advertiser_kind: "ecosystem", coin_slug: null,
    starts_at: HOUSE_START, ends_at: x.ends_at ?? null, house: true,
    title: x.title, body: x.body, cta_label: x.cta_label, link: x.link, accent: x.accent,
  };
}

/** Seeds' own notes for unsold spots, in order of preference. Internal links only. */
export function houseAds(spot: AdSpot, nowMs: number): ShownAd[] {
  const all: ShownAd[] =
    spot === "home_spotlight" ? [
      house("ignite", spot, { title: "Spark · Flight School trading class", body: "Five evenings, Nov 30 – Dec 4. Learn to trade without handing over your keys.", cta_label: "See the class", link: "/flight-school/spark", accent: "green", ends_at: IGNITE_UNTIL }),
      house("ai", spot, { title: "Seeds AI baskets", body: "Build a coin basket with plain rules, see the daily prices behind every move, and approve each trade.", cta_label: "Try a basket", link: "/ai", accent: "ivory" }),
      house("list", spot, { title: "List your coin on Seeds", body: "No trading-volume or market-maker requirements. Listing fees are paid by coin teams, never by traders.", cta_label: "Apply to list", link: "/list", accent: "amber" }),
      house("how", spot, { title: "How Seeds works", body: "Trades settle wallet to wallet from your own trading pocket. Seeds never holds your coins.", cta_label: "Read how it works", link: "/how-it-works", accent: "forest" }),
    ]
    : spot === "coin_side" ? [
      house("list", spot, { title: "List your coin on Seeds", body: "Coin teams can apply for a Seeds market. Traders never pay a listing fee.", cta_label: "Apply to list", link: "/list", accent: "amber" }),
    ]
    : spot === "coin_banner" ? [
      house("ignite", spot, { title: "Spark · Flight School trading class · Nov 30 – Dec 4 · 5:00–6:30 PM CST", body: "Learn to trade without giving up your keys.", cta_label: "See the class", link: "/flight-school/spark", accent: "green", ends_at: IGNITE_UNTIL }),
    ]
    : [];
  return all.filter((a) => isRunning(a, nowMs));
}

/** What a spot shows: paid ads first, then Seeds' own notes where the spot allows, up to its size. */
export function adsForSpot(ads: readonly Ad[], spot: AdSpot, opts: { coinSlug?: string | null; nowMs: number }): ShownAd[] {
  const paid: ShownAd[] = pickAds(ads, spot, opts).map((a) => ({ ...a, house: false }));
  const info = SPOT_INFO[spot];
  if (!info.houseFill || paid.length >= info.max) return paid;
  return [...paid, ...houseAds(spot, opts.nowMs)].slice(0, info.max);
}

/** The label every placement carries. */
export const adLabel = (ad: Pick<ShownAd, "house">): string => (ad.house ? "From Seeds" : "Sponsored");

/** First letter or digit of the advertiser, for the tile. */
export function adInitial(advertiser: string): string {
  const m = advertiser.trim().match(/[A-Za-z0-9]/);
  return m ? m[0]!.toUpperCase() : "•";
}

/** Click-through rate as a percentage, or null with no views. */
export function clickRate(views: number, clicks: number): number | null {
  if (!(views > 0)) return null;
  return Math.round((clicks / views) * 1000) / 10;
}
