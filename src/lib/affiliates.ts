/**
 * Affiliates (pure, tested): who is sharing invite links and what the members
 * they bring in do on Seeds. Honest.Money keeps the official referral credit;
 * these are Seeds' own counts for Admin → Affiliates.
 */

/** A sign-up counts as referred only if the code is recorded within this long of joining Seeds. */
export const REFERRAL_WINDOW_MS = 7 * 86_400_000;
/** How long a browser remembers the first invite code it arrived with. */
export const REF_REMEMBER_MS = 30 * 86_400_000;
/** Members whose TSD is read for one admin view (balances go through the shared cache). */
export const MAX_TSD_MEMBERS = 200;
export const AFFILIATE_PERIODS = [7, 30, 90, 365] as const;
export type AffiliatePeriod = (typeof AFFILIATE_PERIODS)[number];
export const DEFAULT_PERIOD: AffiliatePeriod = 30;
export const periodDays = (v: unknown): AffiliatePeriod =>
  (AFFILIATE_PERIODS as readonly number[]).includes(Number(v)) ? (Number(v) as AffiliatePeriod) : DEFAULT_PERIOD;

export const REF_CODE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
export const cleanCode = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return REF_CODE_RE.test(s) ? s : null;
};

/** Why a referral can't be recorded for this account, or null when it can. */
export function referralProblem(o: {
  code: string | null; accountCreatedAt: string | null; alreadyRecorded: boolean; ownCode: string | null; nowMs?: number;
}): string | null {
  if (!o.code) return "no_code";
  if (o.alreadyRecorded) return "already_recorded"; // first code wins
  if (!o.accountCreatedAt) return "no_account";
  if ((o.nowMs ?? Date.now()) - new Date(o.accountCreatedAt).getTime() > REFERRAL_WINDOW_MS) return "not_new";
  if (o.ownCode && o.ownCode.toLowerCase() === o.code.toLowerCase()) return "own_code";
  return null;
}

/** Link-preview fetchers and crawlers open invite links without a person behind them. */
const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|linkedin|vkshare|curl|wget|python|headless|monitor|uptime/i;
export const isAutomatedVisit = (userAgent: string | null | undefined) => !userAgent || BOT_RE.test(userAgent);

/** One entry per UTC day from (today − days + 1) to today, filling gaps with zero. */
export function fillDays(rows: { day: string; total: number; referred: number }[], days: number, nowMs = Date.now()) {
  const by = new Map(rows.map((r) => [r.day, r]));
  const out: { day: string; total: number; referred: number }[] = [];
  const today = Date.UTC(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), new Date(nowMs).getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today - i * 86_400_000).toISOString().slice(0, 10);
    out.push(by.get(d) ?? { day: d, total: 0, referred: 0 });
  }
  return out;
}

export type AffiliateRow = {
  code: string; ownerId: string | null; ownerName: string | null; linkSeenAt: string | null;
  clicksAll: number; clicksPeriod: number; signupsAll: number; signupsPeriod: number;
  activeMembers: number; trades: number; tradedValue: number; swaps: number; swapUsd: number;
  ignitePaid: number; igniteStarted: number;
};
export const AFFILIATE_SORTS = ["signupsPeriod", "signupsAll", "clicksPeriod", "tradedValue", "swapUsd", "activeMembers", "ignitePaid"] as const;
export type AffiliateSort = (typeof AFFILIATE_SORTS)[number];
export const affiliateSort = (v: unknown): AffiliateSort =>
  (AFFILIATE_SORTS as readonly string[]).includes(String(v)) ? (v as AffiliateSort) : "signupsPeriod";

/** Busiest first; ties by all-time sign-ups, then clicks, then code so the order never jumps. */
export function sortAffiliates(rows: AffiliateRow[], key: AffiliateSort): AffiliateRow[] {
  return [...rows].sort((a, b) =>
    (b[key] - a[key]) || (b.signupsAll - a.signupsAll) || (b.clicksAll - a.clicksAll) || a.code.localeCompare(b.code));
}

/** An affiliate is "sharing" in a period when their link was clicked or brought someone in. */
export const isSharing = (r: Pick<AffiliateRow, "clicksPeriod" | "signupsPeriod">) => r.clicksPeriod > 0 || r.signupsPeriod > 0;
