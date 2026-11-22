/**
 * Seeds Lend — pure rules (tested). Peer-to-peer loans: a lender lends a stablecoin, the
 * borrower's collateral sits in a per-loan 2-of-3 lockbox (borrower, lender, Seeds) until
 * the loan is repaid, liquidated or defaults. Nothing here touches the network or database.
 *
 * Money rules Bobby set (Nov 22 2026): Seeds never takes a cut of a loan or its interest.
 * Seeds charges a fee ONLY when a loan is liquidated or defaults, and that fee comes only
 * out of the borrower's leftover collateral after the lender has been made whole.
 */

export const LOAN_COINS = ["TSD", "USDC", "USDT"] as const;
export type LoanCoin = (typeof LOAN_COINS)[number];
/** Collateral must be a coin Seeds can lock in a lockbox on its own chain. */
export const COLLATERAL_COINS = ["TXC"] as const;
export type CollateralCoin = (typeof COLLATERAL_COINS)[number];

export const LOAN_LIMITS = {
  minAmount: 25,
  maxAmount: 250_000,
  minDays: 7,
  maxDays: 365,
  /** Interest is one flat percentage for the whole term (like Hodl Hodl), set by whoever posts. */
  maxRatePct: 60,
  minStartLtvPct: 10,
  maxStartLtvPct: 70,
} as const;

/** Above this loan-to-value the borrower gets "add coins or repay" alerts. */
export const MARGIN_CALL_LTV = 75;
/** At or above this (sustained, see shouldLiquidate) the lockbox pays the lender out. */
export const LIQUIDATION_LTV = 85;
/** Days after the due date before an unpaid loan counts as defaulted. */
export const GRACE_HOURS = 72;
export const COLLATERAL_DEADLINE_HOURS = 24;
export const FUNDING_DEADLINE_HOURS = 24;
export const PROPOSAL_TTL_HOURS = 48;
export const MAX_ROUNDS = 12;
/** Lockbox coins count once this deep (TXC ~3 min blocks → ~9 minutes). */
export const COLLATERAL_CONFIRMATIONS = 3;
/** Seeds' only fee: % of the amount owed, on liquidation or default only (agent-chosen, to confirm). */
export const SEEDS_DEFAULT_FEE_PCT = 3;
/** Liquidation needs this many recent price checks agreeing (5-minute checks → 30 minutes). */
export const PRICE_MARK_WINDOW = 6;
/** A newest price older than this is stale: nothing gets liquidated on it. */
export const PRICE_STALE_MS = 15 * 60_000;
/** Lockbox outputs smaller than this aren't worth a coin of their own. */
export const DUST_SATS = 10_000n;
export const SATS = 100_000_000;

export type LoanTerms = {
  coin: LoanCoin;
  collateralCoin: CollateralCoin;
  amount: number;
  ratePct: number;
  days: number;
  startLtvPct: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isLoanCoin(c: string): c is LoanCoin {
  return (LOAN_COINS as readonly string[]).includes(c);
}

/** null = fine, else a plain reason. */
export function termsProblem(t: LoanTerms): string | null {
  if (!isLoanCoin(t.coin)) return "Pick TSD, USDC or USDT to lend";
  if (!(COLLATERAL_COINS as readonly string[]).includes(t.collateralCoin)) return "Collateral must be TXC for now";
  if (!Number.isFinite(t.amount) || t.amount < LOAN_LIMITS.minAmount) return `Loans start at ${LOAN_LIMITS.minAmount} ${t.coin}`;
  if (t.amount > LOAN_LIMITS.maxAmount) return `Loans top out at ${LOAN_LIMITS.maxAmount.toLocaleString("en-US")} ${t.coin}`;
  if (round2(t.amount) !== t.amount) return "Use at most 2 decimal places";
  if (!Number.isInteger(t.days) || t.days < LOAN_LIMITS.minDays || t.days > LOAN_LIMITS.maxDays) return `Terms run ${LOAN_LIMITS.minDays}–${LOAN_LIMITS.maxDays} days`;
  if (!Number.isFinite(t.ratePct) || t.ratePct < 0 || t.ratePct > LOAN_LIMITS.maxRatePct) return `Interest must be 0–${LOAN_LIMITS.maxRatePct}% for the term`;
  if (!Number.isFinite(t.startLtvPct) || t.startLtvPct < LOAN_LIMITS.minStartLtvPct || t.startLtvPct > LOAN_LIMITS.maxStartLtvPct)
    return `Starting loan-to-value must be ${LOAN_LIMITS.minStartLtvPct}–${LOAN_LIMITS.maxStartLtvPct}%`;
  return null;
}

/** Amount owed at the end: principal plus the flat interest for the term. */
export function amountOwed(t: Pick<LoanTerms, "amount" | "ratePct">): number {
  return round2(t.amount * (1 + t.ratePct / 100));
}

/** The flat term rate expressed per year, for comparing offers. */
export function aprOf(ratePct: number, days: number): number {
  return days > 0 ? Math.round(((ratePct * 365) / days) * 100) / 100 : 0;
}

/** Collateral coins the borrower must lock, rounded UP to the smallest unit. */
export function collateralNeeded(t: LoanTerms, price: number): number {
  if (!(price > 0)) throw new Error("No price for the collateral coin");
  const coins = amountOwed(t) / (t.startLtvPct / 100) / price;
  return Math.ceil(coins * SATS) / SATS;
}

/** Loan-to-value in percent: what's owed vs what the locked coins are worth. */
export function ltvPct(owed: number, collateralCoins: number, price: number): number {
  const value = collateralCoins * price;
  if (!(value > 0)) return Infinity;
  return (owed / value) * 100;
}

/** The collateral price at which the loan gets liquidated. */
export function liquidationPrice(owed: number, collateralCoins: number): number {
  if (!(collateralCoins > 0)) return Infinity;
  return owed / (collateralCoins * (LIQUIDATION_LTV / 100));
}

export type Health = "healthy" | "margin_call" | "liquidate";
export function healthOf(ltv: number): Health {
  if (ltv >= LIQUIDATION_LTV) return "liquidate";
  if (ltv >= MARGIN_CALL_LTV) return "margin_call";
  return "healthy";
}

export type PriceMark = { price: number; atMs: number };

/** Newest price plus the median of the last PRICE_MARK_WINDOW checks. */
export function referencePrice(marks: PriceMark[], nowMs: number): { latest: number | null; median: number | null; fresh: boolean; enough: boolean } {
  const good = marks.filter((m) => Number.isFinite(m.price) && m.price > 0).sort((a, b) => b.atMs - a.atMs);
  const newest = good[0];
  if (!newest) return { latest: null, median: null, fresh: false, enough: false };
  const recent = good.slice(0, PRICE_MARK_WINDOW).map((m) => m.price).sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 ? recent[mid]! : (recent[mid - 1]! + recent[mid]!) / 2;
  return { latest: newest.price, median, fresh: nowMs - newest.atMs <= PRICE_STALE_MS, enough: recent.length >= PRICE_MARK_WINDOW };
}

/**
 * Liquidate only when the price is fresh, there are enough recent checks, and BOTH the newest
 * price and the median of recent checks put the loan at or over the line. One odd price
 * (a thin order book, a bad feed) can never trigger it on its own.
 */
export function shouldLiquidate(owed: number, collateralCoins: number, marks: PriceMark[], nowMs: number): boolean {
  const r = referencePrice(marks, nowMs);
  if (!r.fresh || !r.enough || r.latest === null || r.median === null) return false;
  return ltvPct(owed, collateralCoins, r.latest) >= LIQUIDATION_LTV && ltvPct(owed, collateralCoins, r.median) >= LIQUIDATION_LTV;
}

/** Past the due date plus the grace period, still unpaid. */
export function isDefaulted(dueAtMs: number, nowMs: number): boolean {
  return Number.isFinite(dueAtMs) && nowMs > dueAtMs + GRACE_HOURS * 3_600_000;
}

export type Split = { lenderSats: bigint; seedsFeeSats: bigint; borrowerSats: bigint; networkFeeSats: bigint };

/**
 * How the lockbox is paid out when a loan is liquidated or defaults.
 * 1. The lender gets collateral worth what they're owed (or everything, if that's less).
 * 2. Seeds' fee comes ONLY out of what's left after that — never from the lender's share.
 * 3. The borrower gets the rest. The network fee is paid from the borrower's part first,
 *    then Seeds' fee, and only touches the lender if nothing else is left.
 * Outputs under dust are folded in (borrower dust → lender; fee dust → dropped).
 */
export function liquidationSplit(p: { collateralSats: bigint; owed: number; price: number; feePct?: number; networkFeeSats: bigint }): Split {
  if (!(p.price > 0)) throw new Error("No price for the split");
  if (p.collateralSats <= 0n) throw new Error("The lockbox is empty");
  const feePct = p.feePct ?? SEEDS_DEFAULT_FEE_PCT;
  const toSats = (coins: number) => BigInt(Math.ceil(coins * SATS));
  const C = p.collateralSats;
  let lender = toSats(p.owed / p.price);
  if (lender > C) lender = C;
  let left = C - lender;
  let fee = toSats((p.owed * feePct) / 100 / p.price);
  if (fee > left) fee = left;
  let borrower = left - fee;
  // Network fee: borrower's share first, then Seeds' fee, then the lender.
  let net = p.networkFeeSats;
  const take = (have: bigint) => { const t = have < net ? have : net; net -= t; return have - t; };
  borrower = take(borrower);
  fee = take(fee);
  lender = take(lender);
  if (net > 0n) throw new Error("The lockbox can't cover the network fee");
  if (borrower > 0n && borrower < DUST_SATS) { lender += borrower; borrower = 0n; }
  if (fee > 0n && fee < DUST_SATS) fee = 0n;
  return { lenderSats: lender, seedsFeeSats: fee, borrowerSats: borrower, networkFeeSats: p.networkFeeSats };
}

/** Repaid or cancelled: everything goes back to the borrower, minus the network fee. Seeds takes nothing. */
export function returnSplit(collateralSats: bigint, networkFeeSats: bigint): Split {
  const back = collateralSats - networkFeeSats;
  if (back < DUST_SATS) throw new Error("The lockbox can't cover the network fee");
  return { lenderSats: 0n, seedsFeeSats: 0n, borrowerSats: back, networkFeeSats };
}

/* ------------------------------ negotiation ------------------------------ */

export type ProposalStatus = "pending" | "countered" | "accepted" | "declined" | "expired" | "withdrawn";
export type ProposalView = { status: ProposalStatus; proposerId: string; borrowerId: string; lenderId: string; expiresAtMs: number; round: number };
export type ProposalAction = "accept" | "counter" | "decline" | "withdraw";

/** null = allowed, else why not. Only the other side can accept/counter/decline; only the proposer can withdraw. */
export function proposalActionProblem(p: ProposalView, actorId: string, action: ProposalAction, nowMs: number): string | null {
  if (actorId !== p.borrowerId && actorId !== p.lenderId) return "This isn't your negotiation";
  if (p.status !== "pending") return `This offer is already ${p.status}`;
  if (nowMs > p.expiresAtMs) return "This offer has expired";
  if (action === "withdraw") return actorId === p.proposerId ? null : "Only the side that made this offer can withdraw it";
  if (actorId === p.proposerId) return "Waiting for the other side to answer";
  if (action === "counter" && p.round >= MAX_ROUNDS) return "That's a lot of back-and-forth — accept or decline this one";
  return null;
}

/** Who is who when someone answers an offer: the offer owner keeps their side. */
export function partiesFor(offer: { side: "lend" | "borrow"; userId: string }, takerId: string): { borrowerId: string; lenderId: string } {
  if (offer.userId === takerId) throw new Error("You can't take your own offer");
  return offer.side === "lend" ? { lenderId: offer.userId, borrowerId: takerId } : { borrowerId: offer.userId, lenderId: takerId };
}

/** A proposal on a posted offer must stay inside what that offer allows (where it sets limits). */
export function fitsOffer(
  o: { side: "lend" | "borrow"; coin: string; minAmount: number; maxAmount: number; maxLtvPct: number },
  t: LoanTerms,
): string | null {
  if (t.coin !== o.coin) return `This offer is for ${o.coin}`;
  if (t.amount < o.minAmount || t.amount > o.maxAmount) return `Amount must be ${o.minAmount}–${o.maxAmount} ${o.coin}`;
  return null;
}

/* ------------------------------- lifecycle ------------------------------- */

export type LoanStatus = "awaiting_collateral" | "awaiting_funding" | "active" | "closing" | "closed";
export type LoanOutcome = "repaid" | "liquidated" | "defaulted" | "cancelled";

export const STATUS_LABEL: Record<LoanStatus, string> = {
  awaiting_collateral: "Waiting for collateral",
  awaiting_funding: "Waiting for the lender",
  active: "Active",
  closing: "Paying out the lockbox",
  closed: "Closed",
};

export type EscrowPurpose = "return" | "release" | "liquidate" | "default";
/** Which two keys sign each kind of lockbox payout (pubkey order: borrower, lender, Seeds). */
export function signersFor(purpose: EscrowPurpose): ["borrower" | "lender", "seeds"] {
  return purpose === "return" || purpose === "release" ? ["borrower", "seeds"] : ["lender", "seeds"];
}

/** Funding may start only once the collateral has fully arrived and nobody's started a payout. */
export function canFund(l: { status: LoanStatus; escrowPurpose: string | null; fundingTxid: string | null; fundingDeadlineMs: number }, nowMs: number): string | null {
  if (l.status !== "awaiting_funding") return "The loan isn't waiting for funding";
  if (l.escrowPurpose) return "The lockbox is being paid out";
  if (l.fundingTxid) return "The loan has already been sent";
  if (nowMs > l.fundingDeadlineMs) return "The funding window has closed";
  return null;
}

/** Repayment may start while active and before any liquidation or default payout. */
export function canRepay(l: { status: LoanStatus; escrowPurpose: string | null; repayTxid: string | null }): string | null {
  if (l.status !== "active") return "Only an active loan can be repaid";
  if (l.escrowPurpose) return "The lockbox is already being paid out";
  if (l.repayTxid) return "The repayment is already on its way";
  return null;
}
