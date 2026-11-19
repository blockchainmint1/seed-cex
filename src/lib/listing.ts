/**
 * List on Seeds (pure, tested): the three listing packages and the rules for
 * an application. Prices are Bobby's (Nov 18 2026): $1,000 / $2,500 / $5,000,
 * paid by the coin's team — never by traders.
 */

export type PackageId = "seed" | "sapling" | "grove";

export type ListingPackage = {
  id: PackageId;
  name: string;
  priceUsd: number;
  tag: string;
  /** How many order-book markets the coin gets. */
  markets: number;
  /** Lines shown on the package card ("everything in X, plus" comes first for higher tiers). */
  features: string[];
  /** Things that start later; shown with a "starts after launch" mark. */
  later?: string[];
};

export const LISTING_PACKAGES: ListingPackage[] = [
  {
    id: "seed",
    name: "Seed",
    priceUsd: 1000,
    tag: "Get your coin trading",
    markets: 1,
    features: [
      "1 market against TSD on the Seeds order book",
      "Buy and sell on the Seeds P2P desk",
      "Open to the Seeds AI basket builder",
      "Safety check and setup before it goes live",
      "Listing announcement on Seeds",
      "“New” badge on the markets for 14 days",
      "Market data in Seeds’ public price feed",
      "Wallet and contract updates when your coin changes",
    ],
  },
  {
    id: "sapling",
    name: "Sapling",
    priceUsd: 2500,
    tag: "Bring your community",
    markets: 2,
    features: [
      "Everything in Seed, plus:",
      "A 2nd market (against TXC or USDC)",
      "Homepage spotlight for 14 days",
      "A “How to buy on Seeds” guide page for your community",
      "1 live AMA with the Seeds team",
    ],
    later: ["1 trading contest for your coin"],
  },
  {
    id: "grove",
    name: "Grove",
    priceUsd: 5000,
    tag: "Full launch",
    markets: 3,
    features: [
      "Everything in Sapling, plus:",
      "Up to 3 markets",
      "Homepage spotlight for 30 days, with a launch-week pop-up",
      "Featured in an Ignite trading class session",
      "Priority review and setup, with a named contact on the Seeds team",
      "Monthly report for 3 months: volume, trades and number of traders",
    ],
    later: ["3 trading contests, one a month for 3 months"],
  },
];

export const packageById = (id: string) => LISTING_PACKAGES.find((p) => p.id === id) ?? null;

export const LISTING_NETWORKS = [
  { id: "texitcoin", label: "TEXITcoin (Omni token)" },
  { id: "pulsechain", label: "PulseChain" },
  { id: "ethereum", label: "Ethereum" },
  { id: "base", label: "Base" },
  { id: "bsc", label: "BNB Chain" },
  { id: "other", label: "Another network" },
] as const;
export type ListingNetwork = (typeof LISTING_NETWORKS)[number]["id"];

export const LISTING_STATUSES = ["new", "reviewing", "approved", "declined", "live"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** One account may send at most this many applications per 24 hours. */
export const APPLY_LIMIT_PER_DAY = 3;

export type ListingApplicationInput = {
  package: PackageId;
  coinName: string;
  ticker: string;
  network: ListingNetwork;
  contract: string | null;
  website: string;
  community: string | null;
  contactName: string;
  contactEmail: string;
  contactTelegram: string | null;
  notes: string | null;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const opt = (v: unknown) => str(v) || null;

function httpsUrl(v: string, field: string): string {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { throw new Error(`${field} doesn't look like a web address.`); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`${field} must be a web address.`);
  if (!u.hostname.includes(".")) throw new Error(`${field} doesn't look like a web address.`);
  return u.toString();
}

/** Checks and tidies an application. Throws a plain-English message on the first problem. */
export function cleanApplication(raw: Record<string, unknown>): ListingApplicationInput {
  const pkg = str(raw.package);
  if (!packageById(pkg)) throw new Error("Pick a package.");
  const network = str(raw.network);
  if (!LISTING_NETWORKS.some((n) => n.id === network)) throw new Error("Pick your coin's network.");

  const coinName = str(raw.coinName);
  if (!coinName || coinName.length > 60) throw new Error("Enter your coin's name (up to 60 characters).");
  const ticker = str(raw.ticker).toUpperCase().replace(/^\$/, "");
  if (!/^[A-Z0-9]{1,12}$/.test(ticker)) throw new Error("The ticker should be 1–12 letters or numbers, like TSD.");

  const contract = opt(raw.contract);
  if (contract && contract.length > 120) throw new Error("The contract or property id is too long.");
  if (contract && ["pulsechain", "ethereum", "base", "bsc"].includes(network) && !/^0x[0-9a-fA-F]{40}$/.test(contract)) {
    throw new Error("A token contract on this network looks like 0x followed by 40 letters and numbers.");
  }
  if (contract && network === "texitcoin" && !/^\d{1,10}$/.test(contract)) throw new Error("An Omni token is identified by its property number, like 39.");

  const websiteRaw = str(raw.website);
  if (!websiteRaw || websiteRaw.length > 200) throw new Error("Enter your project's website.");
  const website = httpsUrl(websiteRaw, "Website");
  const communityRaw = opt(raw.community);
  if (communityRaw && communityRaw.length > 200) throw new Error("The community link is too long.");
  const community = communityRaw ? httpsUrl(communityRaw, "Community link") : null;

  const contactName = str(raw.contactName);
  if (!contactName || contactName.length > 80) throw new Error("Enter who we should talk to.");
  const contactEmail = str(raw.contactEmail).toLowerCase();
  if (contactEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter an email we can reach you at.");
  const tg = opt(raw.contactTelegram)?.replace(/^@/, "") ?? null;
  if (tg && !/^[A-Za-z0-9_]{5,32}$/.test(tg)) throw new Error("A Telegram username is 5–32 letters, numbers or underscores.");
  const notes = opt(raw.notes);
  if (notes && notes.length > 2000) throw new Error("Please keep notes under 2,000 characters.");

  return { package: pkg as PackageId, coinName, ticker, network: network as ListingNetwork, contract, website, community, contactName, contactEmail, contactTelegram: tg, notes };
}

/** May this account send another application right now? */
export function canApply(sentInLast24h: number): boolean {
  return sentInLast24h < APPLY_LIMIT_PER_DAY;
}
