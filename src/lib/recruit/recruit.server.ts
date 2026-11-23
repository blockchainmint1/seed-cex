/**
 * Coin recruiting: CoinMarketCap lookups that find coin teams, and the AI
 * message writer. Read-only toward the outside world: nothing here sends a
 * message or moves coins. Server-only (CMC_API key, AI gateway).
 */
import { safeUrl } from "@/lib/markets/coin-research";
import { PAIRS } from "@/lib/chains";
import { SWAP_COINS } from "@/lib/xchain/assets";
import { pricedPackages, type ListingPrices } from "@/lib/listing";
import { LAUNCH_DATE_LABEL } from "@/lib/launch";
import { CHANNEL_MAX, LEAD_EXCHANGES, chainFromCmc, chainName, isCoinTeam, type Channel } from "./recruit-rules";

const CMC = "https://pro-api.coinmarketcap.com";

async function cmc<T>(path: string): Promise<T> {
  const key = process.env.CMC_API;
  if (!key) throw new Error("CoinMarketCap isn't set up.");
  const r = await fetch(CMC + path, { headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) {
    console.error("[recruit] CoinMarketCap", path.split("?")[0], r.status);
    throw new Error("CoinMarketCap didn't answer. Try again in a minute.");
  }
  return (await r.json()) as T;
}

/** A coin found on CoinMarketCap, before links are looked up. */
export type Candidate = {
  cmcId: number; cmcSlug: string | null; name: string; symbol: string;
  chain: string | null; contract: string | null; native: boolean;
  marketCapUsd: number | null; volume24hUsd: number | null; numMarketPairs: number | null;
  dateAdded: string | null; tags: string[];
};

export type Links = { website: string | null; twitter: string | null; telegram: string | null; discord: string | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function toCandidate(raw: unknown): Candidate | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, any>;
  const id = num(c.id);
  const name = str(c.name);
  const symbol = str(c.symbol);
  if (!id || !name || !symbol) return null;
  const tags = Array.isArray(c.tags) ? c.tags.map((t: unknown) => (typeof t === "string" ? t : str((t as any)?.slug))).filter(Boolean) as string[] : [];
  const usd = c.quote?.USD ?? {};
  const mcap = num(usd.market_cap) || num(usd.fully_diluted_market_cap) || num(c.self_reported_market_cap);
  return {
    cmcId: id, cmcSlug: str(c.slug), name: name.slice(0, 120), symbol: symbol.slice(0, 20),
    chain: c.platform ? chainFromCmc(str(c.platform.slug)) : null,
    contract: c.platform ? str(c.platform.token_address)?.slice(0, 120) ?? null : null,
    native: !c.platform,
    marketCapUsd: mcap && mcap > 0 ? mcap : null,
    volume24hUsd: num(usd.volume_24h),
    numMarketPairs: num(c.num_market_pairs),
    dateAdded: str(c.date_added),
    tags: tags.slice(0, 30),
  };
}

/** Tickers Seeds already trades (order book, swaps): never offered as leads. */
export function seedsSymbols(): Set<string> {
  const s = new Set<string>();
  for (const p of PAIRS) { s.add(p.base.toUpperCase()); s.add(p.quote.toUpperCase()); }
  for (const c of SWAP_COINS) s.add(c.symbol.toUpperCase());
  return s;
}

type ListingQuery = { kind: "new" | "midsize"; minVolume: number };

/** One page of CoinMarketCap's coin list (200 per page). */
export async function listingPage(q: ListingQuery, start: number): Promise<Candidate[]> {
  const base = `/v1/cryptocurrency/listings/latest?start=${start}&limit=200&volume_24h_min=${Math.max(0, Math.floor(q.minVolume))}&aux=num_market_pairs,date_added,tags,platform`;
  const path = q.kind === "new"
    ? `${base}&sort=date_added&sort_dir=desc`
    : `${base}&market_cap_min=1000000&market_cap_max=250000000&sort=volume_24h&sort_dir=desc`;
  const raw = await cmc<{ data?: unknown[] }>(path);
  return (raw.data ?? []).map(toCandidate).filter((c): c is Candidate => !!c);
}

/** Coins traded on one exchange (CoinMarketCap ids, most-traded first). */
export async function exchangeCoinIds(slug: string): Promise<number[]> {
  const raw = await cmc<{ data?: { market_pairs?: any[] } }>(`/v1/exchange/market-pairs/latest?slug=${encodeURIComponent(slug)}&limit=5000&category=spot`);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const p of raw.data?.market_pairs ?? []) {
    const id = num(p?.market_pair_base?.currency_id);
    if (id && p?.market_pair_base?.currency_type === "cryptocurrency" && !seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Market facts for specific coins. */
export async function quotesFor(ids: number[]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const part of chunks(ids, 100)) {
    const raw = await cmc<{ data?: Record<string, unknown> }>(`/v2/cryptocurrency/quotes/latest?id=${part.join(",")}&aux=num_market_pairs,date_added,tags,platform`);
    for (const v of Object.values(raw.data ?? {})) { const c = toCandidate(v); if (c) out.push(c); }
  }
  return out;
}

/** Website, X, Telegram and Discord for each coin, as CoinMarketCap lists them. */
export async function linksFor(ids: number[]): Promise<Map<number, Links>> {
  const out = new Map<number, Links>();
  for (const part of chunks(ids, 100)) {
    const raw = await cmc<{ data?: Record<string, any> }>(`/v2/cryptocurrency/info?id=${part.join(",")}&aux=urls`);
    for (const [k, v] of Object.entries(raw.data ?? {})) {
      const urls = v?.urls ?? {};
      const list = (a: unknown) => (Array.isArray(a) ? a.map(safeUrl).filter((x): x is string => !!x) : []);
      const chat = [...list(urls.chat), ...list(urls.message_board)];
      out.set(Number(k), {
        website: list(urls.website)[0]?.slice(0, 300) ?? null,
        twitter: list(urls.twitter)[0]?.slice(0, 300) ?? null,
        telegram: chat.find((u) => /\/\/(www\.)?t(elegram)?\.me\//i.test(u))?.slice(0, 300) ?? null,
        discord: chat.find((u) => /discord\.(gg|com)\//i.test(u))?.slice(0, 300) ?? null,
      });
    }
  }
  return out;
}

export function keepTeam(c: Candidate, onSeeds: Set<string>): "keep" | "on_seeds" | "not_team" {
  if (onSeeds.has(c.symbol.toUpperCase())) return "on_seeds";
  return isCoinTeam(c) ? "keep" : "not_team";
}

/* ------------------------------- AI messages ------------------------------- */

/** The facts the AI may use, with the live package prices (admins can change them). */
const pitch = (prices: ListingPrices) => `About Seeds (use only these facts):
- Seeds (seeds.honest.money) is a crypto exchange in the Honest.Money ecosystem (honest.money). Trading opens ${LAUNCH_DATE_LABEL}.
- Members keep their own keys. Seeds never holds their coins.
- Holders pay no Seeds fees on trades, ever. They only pay network fees and outside services' fees, and Seeds never marks those up.
- No trading-volume requirement, no market-maker or liquidity deposit.
- A listed coin trades against TSD (Seeds' dollar coin), which members can swap for the other coins Seeds supports. Listed coins are open to the Seeds AI basket builder.
- Coin teams pay a one-off listing package: ${pricedPackages(prices).map((p) => `${p.name} $${p.priceUsd.toLocaleString("en-US")} (${p.tag.toLowerCase()})`).join(", ")}. They pay in crypto when they apply; if Seeds declines the coin, the payment is refunded in full.
- Apply at https://seeds.honest.money/list`;

const RULES = `You write first-contact outreach from the Seeds team to a crypto coin team, inviting them to list on Seeds.
Write like a real person: warm, short, specific, plain English. No hype, no emojis, no hashtags, no ALL CAPS.
Mention one or two real facts about their coin from the data given (never invent any). Make one clear ask: apply at the /list link, or reply to chat.
Never say "no listing fee", "free listing" or "no fees of any kind": listings are paid, only trades are fee-free.
Never promise a listing, trading volume, price or returns. Never use the word "guarantee".
If the coin was on BitMart, you may say BitMart shut down and teams' markets and funds got stuck there. Never say "bankrupt", "stole" or "scam".
Never write placeholders in brackets. Sign off with the sender name given.`;

const FORMAT: Record<Channel, string> = {
  email: `Format: first line "Subject: ..." (under 70 characters), then a blank line, then the email body, at most 160 words.`,
  telegram: `Format: a Telegram message to the team's admins, at most 110 words. No subject line.`,
  x: `Format: an X direct message, at most 450 characters in total. No subject line.`,
  other: `Format: a short message, at most 140 words. No subject line.`,
};

export type DraftFacts = {
  name: string; symbol: string; chain: string | null; volume24hUsd: number | null; marketCapUsd: number | null;
  numMarketPairs: number | null; dateAdded: string | null; sourceDetail: string | null; source: string;
  website: string | null; contactName: string | null; notes: string | null;
};

/** What the AI may say about where we found them. */
function howFound(detail: string | null): string {
  if (!detail) return "";
  const d = detail.toLowerCase();
  if (d === "bitmart") return "They were listed on BitMart, which shut down in 2026; teams' markets and funds there got stuck. Mention this gently as the reason for writing.";
  const ex = LEAD_EXCHANGES.find((e) => e.slug === d);
  if (ex) return `They are listed on ${ex.label}. Don't criticise ${ex.label}.`;
  return `Context on how we came across them (don't quote it unless natural): ${detail}.`;
}

const money = (n: number | null) => (n == null ? "unknown" : `$${Math.round(n).toLocaleString("en-US")}`);

export async function writeDraft(f: DraftFacts, channel: Channel, sender: string, angle: string | null): Promise<{ subject: string | null; body: string }> {
  const facts = [
    `Coin: ${f.name} (${f.symbol})${f.chain ? ` on ${chainName(f.chain)}` : ""}.`,
    `Traded in the last 24 hours: ${money(f.volume24hUsd)}. Market size: ${money(f.marketCapUsd)}. Trading pairs across other exchanges (not the number of exchanges): ${f.numMarketPairs ?? "unknown"}.`,
    f.dateAdded ? `First listed on CoinMarketCap: ${f.dateAdded.slice(0, 10)}.` : "",
    howFound(f.sourceDetail),
    f.website ? `Their website: ${f.website}` : "",
    f.contactName ? `Person to address: ${f.contactName}.` : "Address the team, not a named person.",
    f.notes ? `Our team's notes about them (context, don't quote): ${f.notes.slice(0, 600)}` : "",
    angle ? `Extra angle from our admin: ${angle.slice(0, 300)}` : "",
    `Sender name for the sign-off: ${sender}`,
  ].filter(Boolean).join("\n");

  const { generateResponse } = await import("@lovable.dev/ai-gateway");
  const res = await generateResponse({
    model: "openai/gpt-6.1-sol",
    instructions: `${RULES}\n\n${pitch(await (await import("@/lib/listing-pay.server")).livePrices())}\n\n${FORMAT[channel]}`,
    input: facts,
    max_output_tokens: 900,
    reasoning: { effort: "low" },
  });
  let text = (res.output ?? [])
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .map((c) => (c.type === "output_text" ? c.text : ""))
    .join("").trim();
  if (!text) throw new Error("The AI didn't send back a message. Try again in a minute.");
  let subject: string | null = null;
  const m = /^subject:\s*(.+)\n+/i.exec(text);
  if (m) { subject = m[1]!.trim().slice(0, 200); text = text.slice(m[0].length).trim(); }
  return { subject: channel === "email" ? subject : null, body: text.slice(0, CHANNEL_MAX[channel] + 400) };
}
