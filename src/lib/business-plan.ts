/**
 * Business plan shapes + pure calculators (shared, tested).
 * The plan text itself lives in business-plan.server.ts and only reaches
 * admins through getBusinessPlan, so strategy never ships in public JS.
 */
import { LISTING_PACKAGES, type PackageId } from "./listing";

/** live = running on Seeds today · built = in preview · proposed = idea for Bobby · decide = needs Bobby's call */
export type PlanStatus = "live" | "built" | "proposed" | "decide";

export type PlanItem = { title: string; body: string; status?: PlanStatus; points?: string[] };
export type PlanBlock =
  | { kind: "text"; text: string }
  | { kind: "items"; title?: string; items: PlanItem[] }
  | { kind: "table"; title?: string; head: string[]; rows: string[][] }
  | { kind: "note"; tone: "info" | "warn"; text: string }
  | { kind: "calc"; calc: "listing" | "coins" };
export type PlanSection = { id: string; title: string; summary: string; blocks: PlanBlock[] };
export type BusinessPlan = { updated: string; sections: PlanSection[] };

export type PlanLive = {
  members: number;
  hmeMembers: number;
  linkedWallets: number;
  igniteSeats: number;
  igniteCapacity: number;
  listingApplications: number;
  listingsLive: number;
};

/** Proposed finder's fee for whoever brings a coin team that pays and goes live. Bobby to confirm. */
export const LISTING_FINDER_RATE = 0.2;

const priceOf = (id: PackageId) => LISTING_PACKAGES.find((p) => p.id === id)?.priceUsd ?? 0;
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Listing income for a mix of packages, before and after finder's fees on the referred share. */
export function listingRevenue(mix: Partial<Record<PackageId, number>>, referredShare = 0, rate = LISTING_FINDER_RATE) {
  const gross = (Object.keys(mix) as PackageId[]).reduce((sum, id) => sum + nonNeg(mix[id] ?? 0) * priceOf(id), 0);
  const share = Math.min(1, Math.max(0, Number.isFinite(referredShare) ? referredShare : 0));
  const fees = Math.round(gross * share * rate);
  return { gross, finderFees: fees, net: gross - fees };
}

/** Finder's fee for one coin team on a package. */
export const finderFee = (id: PackageId, rate = LISTING_FINDER_RATE) => Math.round(priceOf(id) * rate);

/** Conference giveaway coins: making them, plus the most any claim rewards could cost. */
export function coinGiveawayBudget(input: { coins: number; unitCost: number; setup: number; rewardUsd: number; claimRate: number }) {
  const coins = nonNeg(input.coins);
  const unit = Math.max(0, input.unitCost || 0);
  const setup = Math.max(0, input.setup || 0);
  const reward = Math.max(0, input.rewardUsd || 0);
  const rate = Math.min(1, Math.max(0, input.claimRate || 0));
  const making = Math.round((coins * unit + setup) * 100) / 100;
  const claims = Math.round(coins * rate);
  const rewards = Math.round(claims * reward * 100) / 100;
  const total = Math.round((making + rewards) * 100) / 100;
  return { making, claims, rewards, total, perSignup: claims ? Math.round((total / claims) * 100) / 100 : null };
}
