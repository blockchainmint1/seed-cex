/**
 * List on Seeds (pure, tested): the three listing packages and the rules for
 * an application. Starting prices are Bobby's (Nov 18 2026): $1,000 / $2,500 / $5,000,
 * paid by the coin's team — never by traders. Admins can change prices
 * (listing_prices); the numbers here are only the fallback when that read fails.
 * Payment: NectarPay checkout right after applying (Bobby, Nov 23 2026); a
 * declined coin is refunded by hand.
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
      "Featured in a Flight School trading class session",
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

// ---------------------------------------------------------------------------
// Prices (admin-editable) and promo codes
// ---------------------------------------------------------------------------

export type ListingPrices = Record<PackageId, number>;
export const PACKAGE_IDS: PackageId[] = ["seed", "sapling", "grove"];
export const DEFAULT_PRICES: ListingPrices = Object.fromEntries(LISTING_PACKAGES.map((p) => [p.id, p.priceUsd])) as ListingPrices;
export const MIN_PRICE_USD = 1;
export const MAX_PRICE_USD = 1_000_000;

/** Dollars to the cent. */
export const cents = (n: number) => Math.round(n * 100) / 100;

/** Prices from listing_prices rows; any missing or broken row falls back to the default. */
export function pricesFromRows(rows: { package: string; price_usd: number | string }[] | null | undefined): ListingPrices {
  const out = { ...DEFAULT_PRICES };
  for (const r of rows ?? []) {
    const n = Number(r.price_usd);
    if ((PACKAGE_IDS as string[]).includes(r.package) && Number.isFinite(n) && n >= MIN_PRICE_USD && n <= MAX_PRICE_USD) out[r.package as PackageId] = cents(n);
  }
  return out;
}

/** Packages with the live price in place of the fallback. */
export const pricedPackages = (prices: ListingPrices): ListingPackage[] => LISTING_PACKAGES.map((p) => ({ ...p, priceUsd: prices[p.id] }));

/** Checks an admin's new prices. Throws a plain-English message on the first problem. */
export function cleanPrices(raw: Record<string, unknown>): ListingPrices {
  const out = {} as ListingPrices;
  for (const id of PACKAGE_IDS) {
    const n = Number(typeof raw[id] === "string" ? String(raw[id]).replace(/[$,\s]/g, "") : raw[id]);
    const name = packageById(id)!.name;
    if (!Number.isFinite(n) || n < MIN_PRICE_USD || n > MAX_PRICE_USD) throw new Error(`${name} price must be between $${MIN_PRICE_USD} and $${MAX_PRICE_USD.toLocaleString("en-US")}.`);
    if (Math.abs(cents(n) - n) > 1e-9) throw new Error(`${name} price can have at most 2 decimals.`);
    out[id] = cents(n);
  }
  return out;
}

export type PromoKind = "percent" | "amount";
export type Promo = {
  code: string; kind: PromoKind; value: number; packages: PackageId[] | null;
  maxUses: number | null; uses: number; expiresAt: string | null; active: boolean;
};

export const PROMO_CODE_RE = /^[A-Z0-9_-]{3,24}$/;
/** How a member types a code: case and spaces don't matter. Null when it can't be a code. */
export function cleanPromoCode(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
  return PROMO_CODE_RE.test(s) ? s : null;
}

/** Checks a new promo code from an admin. Throws a plain-English message on the first problem. */
export function cleanPromoInput(raw: Record<string, unknown>, nowMs = Date.now()) {
  const code = cleanPromoCode(raw.code);
  if (!code) throw new Error("A code is 3–24 letters, numbers, dashes or underscores.");
  const kind = raw.kind === "percent" || raw.kind === "amount" ? raw.kind : null;
  if (!kind) throw new Error("Pick percent off or dollars off.");
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter how much the code takes off.");
  if (kind === "percent" && value > 100) throw new Error("Percent off can't be more than 100.");
  if (kind === "amount" && value > MAX_PRICE_USD) throw new Error("That's more than any package costs.");
  if (Math.abs(cents(value) - value) > 1e-9) throw new Error("Use at most 2 decimals.");
  const pk = Array.isArray(raw.packages) ? [...new Set(raw.packages.map(String))] : [];
  if (pk.some((p) => !(PACKAGE_IDS as string[]).includes(p))) throw new Error("Unknown package.");
  const packages = pk.length === 0 || pk.length === PACKAGE_IDS.length ? null : (pk as PackageId[]);
  const mu = raw.maxUses == null || raw.maxUses === "" ? null : Number(raw.maxUses);
  if (mu != null && (!Number.isInteger(mu) || mu < 1 || mu > 100_000)) throw new Error("Uses must be a whole number from 1 to 100,000, or blank for no limit.");
  let expiresAt: string | null = null;
  if (typeof raw.expiresAt === "string" && raw.expiresAt.trim()) {
    const t = new Date(raw.expiresAt).getTime();
    if (!Number.isFinite(t)) throw new Error("That end date doesn't look right.");
    if (t <= nowMs) throw new Error("The end date has to be in the future.");
    expiresAt = new Date(t).toISOString();
  }
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 300) || null : null;
  return { code, kind: kind as PromoKind, value: cents(value), packages, maxUses: mu, expiresAt, note };
}

/** Why a code can't be used for this package right now, or null when it can. */
export function promoProblem(p: Promo | null, pkg: PackageId, nowMs = Date.now()): string | null {
  if (!p || !p.active) return "That code isn't valid.";
  if (p.expiresAt && new Date(p.expiresAt).getTime() <= nowMs) return "That code has ended.";
  if (p.maxUses != null && p.uses >= p.maxUses) return "That code has been used up.";
  if (p.packages && !p.packages.includes(pkg)) {
    const names = p.packages.map((id) => packageById(id)?.name ?? id).join(" or ");
    return `That code works only with ${names}.`;
  }
  return null;
}

/**
 * What the team pays. Discount never exceeds the price; a balance under $1 is
 * waived (a checkout for a few cents isn't worth anyone's network fee).
 */
export function priceWithPromo(priceUsd: number, promo: { kind: PromoKind; value: number } | null) {
  const list = cents(priceUsd);
  if (!promo) return { listPriceUsd: list, discountUsd: 0, amountUsd: list };
  const raw = promo.kind === "percent" ? (list * Math.min(promo.value, 100)) / 100 : promo.value;
  let discountUsd = cents(Math.min(list, Math.max(0, raw)));
  let amountUsd = cents(list - discountUsd);
  if (amountUsd < 1) { discountUsd = list; amountUsd = 0; }
  return { listPriceUsd: list, discountUsd, amountUsd };
}

/** How a code reads on screen: "20% off" or "$500 off". */
export const promoLabel = (p: { kind: PromoKind; value: number }) =>
  p.kind === "percent" ? `${p.value}% off` : `$${p.value.toLocaleString("en-US", { maximumFractionDigits: 2 })} off`;

// ---------------------------------------------------------------------------
// Payment (NectarPay)
// ---------------------------------------------------------------------------

export const PAYMENT_STATUSES = ["unpaid", "pending", "underpaid", "paid", "free", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const CHECKOUT_MINUTES = 60;

/** NectarPay order id for an application's checkout. */
export const listingOrderId = (applicationId: string) => `listing-${applicationId}`;
/** The application an order id names, or null. */
export function applicationIdFromOrderId(orderId: string | null | undefined): string | null {
  const m = /^listing-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(orderId ?? "");
  return m ? m[1]!.toLowerCase() : null;
}

/** NectarPay says this invoice is paid in full for this application. */
export function listingInvoicePaid(inv: { status: string; fiat_amount: number | string; order_id?: string | null }, app: { id: string; amount_usd: number | string }) {
  return ["confirmed", "overpaid"].includes(inv.status)
    && Number(inv.fiat_amount) >= Number(app.amount_usd) - 0.005
    && applicationIdFromOrderId(inv.order_id) === app.id.toLowerCase();
}

/** Only these may become "paid" from a payment notice. */
export const PAYABLE_STATUSES = ["unpaid", "pending", "underpaid"] as const;

/**
 * Why the team can't open a checkout now, or null. An underpaid checkout is
 * finished by hand (a second full invoice would charge them twice).
 */
export function checkoutBlock(app: { status: string; payment_status: string; amount_usd: number | string }): string | null {
  if (Number(app.amount_usd) <= 0 || app.payment_status === "free") return "Nothing to pay — your promo code covers it.";
  if (app.payment_status === "paid") return "This application is already paid.";
  if (app.payment_status === "refunded") return "This payment was refunded.";
  if (app.payment_status === "underpaid") return "We got part of your payment. Reply to our email or write to support@honest.money and we'll sort out the rest.";
  if (app.status === "declined") return "This application was declined, so there's nothing to pay.";
  return null;
}

/** A live checkout worth sending the team back to (at least a minute left). */
export const checkoutStillOpen = (expiresAt: string | null | undefined, nowMs = Date.now()) =>
  !!expiresAt && new Date(expiresAt).getTime() > nowMs + 60_000;

/** A paid application that was declined: someone has to send the money back. */
export const refundNeeded = (app: { status: string; payment_status: string }) => app.status === "declined" && app.payment_status === "paid";

/** Admin hand actions on a payment. */
export type PaymentAction = "mark_paid" | "mark_refunded";
export function paymentActionAllowed(action: PaymentAction, paymentStatus: string): boolean {
  if (action === "mark_paid") return (PAYABLE_STATUSES as readonly string[]).includes(paymentStatus);
  return paymentStatus === "paid";
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Not paid", pending: "Waiting for payment", underpaid: "Part paid", paid: "Paid", free: "Free (promo)", refunded: "Refunded",
};
