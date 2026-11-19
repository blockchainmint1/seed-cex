/**
 * "Buy now anyway" (pure, tested): when real buying is switched on while the plan
 * itself says wait in TSD, the owner can still buy the basket today. Shared by the
 * Account → AI strategies warning and the server, so both agree on what counts.
 */
import { basketTargets, type PlanSettings } from "./plan";

/** Coins the plan would normally hold but is keeping in TSD right now. */
export function coinsWaiting(settings: PlanSettings, current: Record<string, number> | null | undefined): string[] {
  if (settings.mode !== "basket") return [];
  const invest = 1 - (settings.reserve ?? 0) / 100;
  const base = basketTargets(settings);
  return Object.entries(base)
    .filter(([id, w]) => w * invest > 0.001 && (current?.[id] ?? 0) < 0.001)
    .map(([id]) => id);
}

/** True when the plan is sitting in TSD waiting for a signal (momentum: no coin passes its rules). */
export function planWaitingInTsd(settings: PlanSettings, current: Record<string, number> | null | undefined): boolean {
  if (settings.mode === "basket") return coinsWaiting(settings, current).length > 0;
  return !Object.entries(current ?? {}).some(([id, w]) => id !== "tsd" && w > 0.001);
}

/** "Buy now anyway" is offered for basket plans (momentum plans only ever buy coins that are rising). */
export function canBuyNow(settings: PlanSettings, current: Record<string, number> | null | undefined): boolean {
  return settings.mode === "basket" && coinsWaiting(settings, current).length > 0;
}

/** TSD a buy-now day would spend: the waiting coins' share of the plan. */
export function buyNowTsd(settings: PlanSettings, commitTsd: number, current: Record<string, number> | null | undefined): number {
  const invest = 1 - (settings.reserve ?? 0) / 100;
  const base = basketTargets(settings);
  const share = coinsWaiting(settings, current).reduce((a, id) => a + (base[id] ?? 0) * invest, 0);
  return Math.floor(commitTsd * share * 100) / 100;
}
