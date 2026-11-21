/**
 * Coin recruiting (pure, tested): pipeline stages, the lead score, which coins
 * count as a coin team worth inviting, duplicate detection, pasted-list parsing,
 * the 10-million-pairs goal math and the outreach safety check.
 *
 * Every number shown on Admin → Recruiting comes from here or from CoinMarketCap;
 * the AI only writes the message, never the facts or the score.
 */

/* ---------------------------------- goal ---------------------------------- */

/** Bobby's goal (Nov 21 2026): 10,000,000 trade pairs. */
export const PAIR_GOAL = 10_000_000;

/** Every coin Seeds trades can be swapped for every other (through TSD), so n coins make n·(n−1)/2 pairs. */
export function pairsFor(coins: number): number {
  const n = Math.max(0, Math.floor(coins));
  return (n * (n - 1)) / 2;
}

/** Fewest coins whose all-to-all pairs reach the target. */
export function coinsForPairs(target: number): number {
  if (target <= 0) return 0;
  let n = Math.ceil((1 + Math.sqrt(1 + 8 * target)) / 2);
  while (n > 2 && pairsFor(n - 1) >= target) n--;
  while (pairsFor(n) < target) n++;
  return n;
}

/* --------------------------------- stages --------------------------------- */

export const STAGES = ["found", "shortlisted", "contacted", "replied", "applied", "paid", "live", "passed", "declined", "dead"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_INFO: Record<Stage, { label: string; hint: string }> = {
  found: { label: "Found", hint: "Just added, nobody has looked yet" },
  shortlisted: { label: "Shortlisted", hint: "Worth contacting" },
  contacted: { label: "Contacted", hint: "We sent a message" },
  replied: { label: "Replied", hint: "They wrote back" },
  applied: { label: "Applied", hint: "They filled in /list" },
  paid: { label: "Paid", hint: "Listing package paid" },
  live: { label: "Live", hint: "Trading on Seeds" },
  passed: { label: "Passed", hint: "We decided not to invite them" },
  declined: { label: "Declined", hint: "They said no" },
  dead: { label: "Dead", hint: "Project abandoned or unreachable" },
};

/** The forward path; closed stages sit outside it. */
const PATH: Stage[] = ["found", "shortlisted", "contacted", "replied", "applied", "paid", "live"];
const CLOSED: Stage[] = ["passed", "declined", "dead"];

/**
 * Leads move forward one or more steps, or close. "Live" and "paid" never
 * move back (money was taken); a closed lead may only reopen to Found.
 */
export function canMoveStage(from: Stage, to: Stage): boolean {
  if (from === to) return false;
  if (CLOSED.includes(from)) return to === "found";
  if (from === "live") return false;
  if (from === "paid") return to === "live";
  if (CLOSED.includes(to)) return true;
  return PATH.indexOf(to) > PATH.indexOf(from);
}

/** Marking a message sent moves an early lead to Contacted, never backwards. */
export function stageAfterSend(stage: Stage): Stage {
  return stage === "found" || stage === "shortlisted" ? "contacted" : stage;
}

/* ------------------------------ coin filtering ------------------------------ */

/** CoinMarketCap tags for things that aren't a coin team we can invite. */
const NOT_A_TEAM_TAGS = ["tokenized-stock", "tokenized-assets", "tokenized-gold", "stablecoin", "fiat-stablecoin", "asset-backed-stablecoin", "wrapped-tokens", "bridged-tokens", "derivatives", "usd-stablecoin", "eur-stablecoin"];
const NOT_A_TEAM_NAME = /\((derivatives|xstock|robinhood|coinbase|wrapped|bridged)\)|tokenized|\bwrapped\b|\betf\b/i;

export function isCoinTeam(c: { name: string; tags?: readonly string[] }): boolean {
  if (NOT_A_TEAM_NAME.test(c.name)) return false;
  return !(c.tags ?? []).some((t) => NOT_A_TEAM_TAGS.includes(t.toLowerCase()));
}

/** CoinMarketCap network slugs → the names Seeds uses. */
export function chainFromCmc(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const s = slug.toLowerCase();
  if (s === "ethereum") return "ethereum";
  if (s === "base") return "base";
  if (s === "bnb" || s === "bnb-smart-chain-bep20" || s === "binance-smart-chain" || s === "bnb-smart-chain") return "bsc";
  if (s === "pulsechain") return "pulsechain";
  if (s === "solana") return "solana";
  if (s === "tron" || s === "tron20") return "tron";
  return s.slice(0, 60);
}

/** Networks where Seeds already holds coins and swaps tokens (Uniswap, PancakeSwap, PulseX). */
export const EASY_CHAINS = ["ethereum", "base", "bsc", "pulsechain"] as const;

const CHAIN_NAMES: Record<string, string> = { ethereum: "Ethereum", base: "Base", bsc: "BNB Chain", pulsechain: "PulseChain", solana: "Solana", tron: "TRON" };
export const chainName = (c: string) => CHAIN_NAMES[c] ?? c.replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());

/* --------------------------------- scoring --------------------------------- */

export type LeadFacts = {
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  numMarketPairs: number | null;
  /** ISO time CoinMarketCap first listed it. */
  dateAdded: string | null;
  chain: string | null;
  /** Native coin (its own blockchain, no token contract). */
  native: boolean;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  email: string | null;
  sourceDetail: string | null;
};

export type ScoreReason = { points: number; text: string };

const usd = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`);

/**
 * 0–100. Alive (25) + right size (20) + reachable (25) + room to grow (15, or −15 when already on 100+ markets)
 * + network fit (10) + new (5); +5 for teams stranded by BitMart's shutdown.
 */
export function scoreLead(f: LeadFacts, nowMs: number): { score: number; reasons: ScoreReason[] } {
  const r: ScoreReason[] = [];
  const v = f.volume24hUsd;
  if (v == null) r.push({ points: 5, text: "Daily trading unknown" });
  else if (v >= 1e6) r.push({ points: 25, text: `Busy: ${usd(v)} traded in 24h` });
  else if (v >= 1e5) r.push({ points: 20, text: `Active: ${usd(v)} traded in 24h` });
  else if (v >= 1e4) r.push({ points: 12, text: `Some trading: ${usd(v)} in 24h` });
  else if (v >= 1e3) r.push({ points: 5, text: `Thin trading: ${usd(v)} in 24h` });
  else r.push({ points: 0, text: "Hardly trades (under $1k a day)" });

  const m = f.marketCapUsd;
  if (m == null || m <= 0) r.push({ points: 5, text: "Market size unknown" });
  else if (m < 1e6) r.push({ points: 5, text: `Very small (${usd(m)})` });
  else if (m <= 250e6) r.push({ points: 20, text: `Right size (${usd(m)}): too small for big-exchange fees` });
  else if (m <= 2e9) r.push({ points: 10, text: `Mid-size (${usd(m)})` });
  else r.push({ points: 3, text: `Very large (${usd(m)}): rarely pays small exchanges` });

  if (f.website) r.push({ points: 10, text: "Has a website" });
  if (f.twitter) r.push({ points: 8, text: "Has an X account" });
  if (f.telegram) r.push({ points: 7, text: "Has a Telegram" });
  if (f.email && !f.telegram) r.push({ points: 4, text: "Has a contact email" });
  if (!f.website && !f.twitter && !f.telegram && !f.email) r.push({ points: 0, text: "No way to contact them yet" });

  const p = f.numMarketPairs;
  // Few markets only matters for a coin people actually trade.
  if (v != null && v < 1e3) r.push({ points: 0, text: "Few markets, but nobody trades it" });
  else if (p == null || p <= 0) r.push({ points: 3, text: "Markets elsewhere unknown" });
  else if (p <= 10) r.push({ points: 15, text: `Only ${p} market${p === 1 ? "" : "s"} elsewhere: needs more places to trade` });
  else if (p <= 40) r.push({ points: 10, text: `${p} markets elsewhere` });
  else if (p <= 100) r.push({ points: 0, text: `${p} markets elsewhere: already widely traded` });
  else r.push({ points: -15, text: `Already on ${p} markets: unlikely to need Seeds` });

  if (f.chain && (EASY_CHAINS as readonly string[]).includes(f.chain)) r.push({ points: 10, text: `On ${chainName(f.chain)}: Seeds already handles this network` });
  else if (f.native || f.chain) r.push({ points: 5, text: f.native ? "Its own blockchain: needs Seeds-side support" : `On ${chainName(f.chain!)}: needs Seeds-side support` });

  if (f.dateAdded) {
    const days = (nowMs - Date.parse(f.dateAdded)) / 86_400_000;
    if (Number.isFinite(days) && days >= 0 && days <= 180) r.push({ points: 5, text: `New: listed on CoinMarketCap ${Math.max(1, Math.round(days))} days ago` });
  }
  if (f.sourceDetail?.toLowerCase() === "bitmart") r.push({ points: 5, text: "Stranded by BitMart's shutdown" });

  const score = Math.max(0, Math.min(100, r.reduce((s, x) => s + x.points, 0)));
  return { score, reasons: r };
}

export function gradeOf(score: number): "A" | "B" | "C" | "D" {
  return score >= 75 ? "A" : score >= 55 ? "B" : score >= 35 ? "C" : "D";
}

/* -------------------------------- duplicates -------------------------------- */

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** One lead per coin: CoinMarketCap id first, then contract, then ticker + website. */
export function dedupeKey(l: { cmcId?: number | null; chain?: string | null; contract?: string | null; symbol: string; website?: string | null; name: string }): string {
  if (l.cmcId) return `cmc:${l.cmcId}`;
  if (l.contract) return `ct:${(l.chain ?? "any").toLowerCase()}:${l.contract.trim().toLowerCase()}`;
  return `sym:${l.symbol.trim().toUpperCase()}:${domainOf(l.website) ?? l.name.trim().toLowerCase().replace(/\s+/g, "-")}`;
}

/* ------------------------------- pasted lists ------------------------------- */

export type PastedLead = {
  name: string; symbol: string;
  website: string | null; twitter: string | null; telegram: string | null; discord: string | null;
  email: string | null; contract: string | null;
};

export const PASTE_MAX_LINES = 500;

const toUrl = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s}`);

/**
 * One coin per line: name, ticker, then any links in any order (website, X,
 * Telegram, Discord, email, 0x contract), split by commas, tabs or "|".
 * Lines without a name and a ticker are skipped and reported.
 */
export function parsePastedLeads(text: string): { leads: PastedLead[]; skipped: number[] } {
  const leads: PastedLead[] = [];
  const skipped: number[] = [];
  const lines = text.split(/\r?\n/).slice(0, PASTE_MAX_LINES);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(/\t|\||,/).map((p) => p.trim()).filter(Boolean);
    const name = parts[0] ?? "";
    const symbol = (parts[1] ?? "").replace(/^\$/, "").toUpperCase();
    if (!name || name.length > 120 || !/^[A-Z0-9.\-_]{1,20}$/.test(symbol)) { skipped.push(i + 1); return; }
    const l: PastedLead = { name, symbol, website: null, twitter: null, telegram: null, discord: null, email: null, contract: null };
    for (const p of parts.slice(2)) {
      const low = p.toLowerCase();
      if (/^0x[0-9a-f]{40}$/i.test(p)) l.contract = p;
      else if (/^[^\s@/]+@[^\s@/]+\.[a-z]{2,}$/i.test(p)) l.email = p.slice(0, 200);
      else if (/(^|\/\/|\.)t\.me\//.test(low) || low.startsWith("t.me/")) l.telegram = toUrl(p).slice(0, 300);
      else if (/(^|\/\/|\.)(x|twitter)\.com\//.test(low)) l.twitter = toUrl(p).slice(0, 300);
      else if (/discord\.(gg|com)\//.test(low)) l.discord = toUrl(p).slice(0, 300);
      else if (/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(p) && !l.website) l.website = toUrl(p).slice(0, 300);
    }
    leads.push(l);
  });
  return { leads, skipped };
}

/* --------------------------------- sources --------------------------------- */

export const SOURCES = ["cmc_new", "cmc_midsize", "exchange", "paste", "manual"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  cmc_new: "New on CoinMarketCap", cmc_midsize: "Mid-size coins", exchange: "Listed on an exchange", paste: "Pasted list", manual: "Added by hand",
};

/** Exchanges whose small-coin listings make good leads (CoinMarketCap exchange slugs). BitMart stopped reporting in Sept 2026: paste its list instead. */
export const LEAD_EXCHANGES = [
  { slug: "mexc", label: "MEXC" }, { slug: "lbank", label: "LBank" }, { slug: "xt", label: "XT.com" },
  { slug: "gate", label: "Gate" }, { slug: "bingx", label: "BingX" },
] as const;

/* ------------------------------- outreach check ------------------------------ */

export const CHANNELS = ["email", "telegram", "x", "other"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", telegram: "Telegram", x: "X message", other: "Other" };
/** Longest body per channel (X direct messages are kept short on purpose). */
export const CHANNEL_MAX: Record<Channel, number> = { email: 2500, telegram: 1200, x: 600, other: 2500 };

/** AI drafts per rolling 24 hours, across all admins (cost cap). */
export const AI_DRAFTS_PER_DAY = 300;

/**
 * Words Seeds must never send: "no listing fee" (listings are paid), "bankrupt"/
 * "stole" about BitMart (say "shut down"/"funds stuck"), and promises of returns,
 * guaranteed listing or volume.
 */
const BANNED: { re: RegExp; why: string }[] = [
  { re: /\bno\s+listing\s+fees?\b|\bfree\s+listing\b|\blist\s+(for\s+)?free\b/i, why: "Listings are paid: never say \"no listing fee\" or \"free listing\"." },
  { re: /\bbankrupt(cy)?\b/i, why: "Say BitMart \"shut down\", never \"bankrupt\"." },
  { re: /\bstole\b|\bstolen\b|\bscam(med|mers?)?\b|\bthieves\b/i, why: "Don't accuse other exchanges; say \"shut down\" or \"funds stuck\"." },
  { re: /\bguarantee(d|s)?\b/i, why: "Never guarantee anything (listing, volume or price)." },
  { re: /\b(price|moon|pump)\s+(will|to)\b|\b\d+x\s+(gains?|returns?)\b/i, why: "No price or return promises." },
  { re: /\bno\s+fees\s+(of\s+any\s+kind|at\s+all|whatsoever)\b|\bcompletely\s+free\b/i, why: "Only trades are fee-free; listings cost money." },
];

/** Problems that block marking a message sent (empty = fine). */
export function outreachProblems(text: string, channel: Channel): string[] {
  const out: string[] = [];
  const t = text.trim();
  if (!t) out.push("The message is empty.");
  if (t.length > CHANNEL_MAX[channel]) out.push(`Too long for ${CHANNEL_LABEL[channel]} (${t.length} of ${CHANNEL_MAX[channel]} characters).`);
  if (/\[(your|name|link|insert)[^\]]*\]|\{\{.*\}\}/i.test(t)) out.push("Fill in the placeholder in brackets before sending.");
  for (const b of BANNED) if (b.re.test(t)) out.push(b.why);
  return out;
}
