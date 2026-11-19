/**
 * Seeds AI real buying — pure rules (tested in execute-rules.test.ts).
 *
 * A plan that buys for real keeps its own small ledger: the TSD it started with,
 * minus TSD spent on finished buys, plus TSD from finished sells, and the coin
 * units those swaps actually delivered. Each day the plan's target weights (the
 * same engine the member tested) are compared with that ledger at today's
 * prices, and the difference becomes a short list of swaps: sells first (they
 * free up TSD), then buys, each piece under the swap limit. Nothing runs until
 * the owner says yes.
 */

export type MoveSide = "buy" | "sell";
/** amount: TSD to spend for a buy, coin units to sell for a sell. */
export type PlannedMove = { side: MoveSide; coin: string; usd: number; amount: number };
export type Ledger = { tsd: number; units: Record<string, number> };
export type DoneMove = { side: MoveSide; coin: string; amountIn: number; amountOut: number };

/** Plan trades this small aren't worth a swap (and TSD Bridge has a minimum anyway). */
export const MIN_MOVE_USD = 10;
/** Pieces stay a little under the per-swap limit so a price wiggle can't push one over it. */
export const PIECE_MARGIN = 0.96;
/** On days the plan itself didn't trade, only catch up when a coin is this far off target (share of the plan). */
export const CATCH_UP_BAND = 0.05;
/** Waiting trades end before the next daily check. */
export const EXEC_TTL_MS = 20 * 60 * 60_000;

const floor8 = (n: number) => Math.floor(n * 1e8 + 1e-6) / 1e8;
const floor2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;

/** What the plan owns now, from its finished swaps only. Never below zero. */
export function ledgerFrom(commitTsd: number, done: DoneMove[]): Ledger {
  let tsd = commitTsd;
  const units: Record<string, number> = {};
  for (const m of done) {
    if (m.side === "buy") {
      tsd -= m.amountIn;
      units[m.coin] = (units[m.coin] ?? 0) + m.amountOut;
    } else {
      tsd += m.amountOut;
      units[m.coin] = (units[m.coin] ?? 0) - m.amountIn;
    }
  }
  for (const k of Object.keys(units)) units[k] = Math.max(0, floor8(units[k]!));
  return { tsd: Math.max(0, floor8(tsd)), units };
}

export function ledgerValue(l: Ledger, prices: Record<string, number>): number {
  return l.tsd + Object.entries(l.units).reduce((s, [c, u]) => s + u * (prices[c] ?? 0), 0);
}

/** Split an amount into pieces of at most `max` (last piece takes the rest). */
export function pieces(total: number, max: number): number[] {
  if (!(total > 0) || !(max > 0)) return [];
  const n = Math.ceil(total / max - 1e-9);
  const each = total / n;
  return Array.from({ length: n }, () => each);
}

/**
 * The swaps that bring the ledger to the target weights (fractions of the whole
 * plan per coin; whatever isn't a coin is TSD). With `planTradedToday` false only
 * coins off by more than CATCH_UP_BAND move, so a plan that rebalances weekly
 * doesn't trade every day. Sells come first; a coin going to 0% is sold in full.
 */
export function planRealMoves(p: {
  ledger: Ledger;
  targets: Record<string, number>;
  prices: Record<string, number>;
  planTradedToday: boolean;
  perSwapUsd: number;
  minUsd?: number;
}): PlannedMove[] {
  const min = p.minUsd ?? MIN_MOVE_USD;
  const value = ledgerValue(p.ledger, p.prices);
  if (!(value > 0)) return [];
  const coins = [...new Set([...Object.keys(p.targets), ...Object.keys(p.ledger.units)])].filter((c) => c !== "tsd");
  const maxPiece = p.perSwapUsd * PIECE_MARGIN;
  const sells: PlannedMove[] = [];
  const buys: PlannedMove[] = [];
  let tsdAfterSells = p.ledger.tsd;
  for (const c of coins) {
    const price = p.prices[c];
    if (!(price > 0)) continue;
    const held = p.ledger.units[c] ?? 0;
    const want = Math.max(0, p.targets[c] ?? 0);
    const heldUsd = held * price;
    const diff = want * value - heldUsd;
    if (Math.abs(diff) < min) continue;
    if (!p.planTradedToday && Math.abs(diff) / value < CATCH_UP_BAND) continue;
    if (diff < 0) {
      const sellAll = want < 0.001;
      const units = sellAll ? held : Math.min(held, -diff / price);
      const usd = units * price;
      if (usd < min) continue;
      for (const part of pieces(units, maxPiece / price)) {
        const u = floor8(part);
        if (u > 0) sells.push({ side: "sell", coin: c, usd: floor2(u * price), amount: u });
      }
      tsdAfterSells += usd;
    } else {
      buys.push({ side: "buy", coin: c, usd: diff, amount: diff });
    }
  }
  // Never plan to spend more TSD than the plan will have.
  const wanted = buys.reduce((s, b) => s + b.amount, 0);
  const scale = wanted > tsdAfterSells ? tsdAfterSells / wanted : 1;
  const outBuys: PlannedMove[] = [];
  for (const b of buys) {
    const tsd = b.amount * scale;
    if (tsd < min) continue;
    for (const part of pieces(tsd, maxPiece)) {
      const t = floor2(part);
      if (t >= min) outBuys.push({ side: "buy", coin: b.coin, usd: t, amount: t });
    }
  }
  return [...sells, ...outBuys];
}

/** Telegram one-tap only for small days; bigger ones are confirmed on Seeds. */
export function oneTapAllowed(totalUsd: number, oneTapLimitUsd: number): boolean {
  return totalUsd > 0 && totalUsd <= oneTapLimitUsd;
}

/** The amount actually sent for a queued move: never more than the plan's ledger holds. Null = skip. */
export function moveAmountNow(m: { side: MoveSide; coin: string; amount: number }, l: Ledger, price: number | null, minUsd = MIN_MOVE_USD): number | null {
  const cap = m.side === "buy" ? l.tsd : (l.units[m.coin] ?? 0);
  const amt = m.side === "buy" ? floor2(Math.min(m.amount, cap)) : floor8(Math.min(m.amount, cap));
  const usd = m.side === "buy" ? amt : price != null ? amt * price : 0;
  return amt > 0 && usd >= minUsd ? amt : null;
}

/** First reason a plan can't buy for real, or null. */
export function realBuyingBlocker(i: {
  isAdmin: boolean;
  adminExecutionOn: boolean;
  membersExecutionOn: boolean;
  planStatus: string;
  unroutableCoins: string[];
  link: { mode: string; hasKey: boolean; pockets: string[] } | null;
  neededPockets: string[];
}): string | null {
  if (!(i.membersExecutionOn || (i.isAdmin && i.adminExecutionOn))) {
    return i.isAdmin ? "Real buying for beta testers is switched off in Admin → Seeds AI." : "Real buying is open to beta testers for now. Your plan keeps running on paper.";
  }
  if (i.planStatus !== "locked") return "Resume the plan first.";
  if (i.unroutableCoins.length) return `Seeds can't swap ${i.unroutableCoins.join(", ")} from TSD yet, so this plan stays on paper.`;
  if (!i.link) return "Link your HME Wallet trading pocket first (Account → Security).";
  if (i.link.mode !== "access" || !i.link.hasKey) return "Your pocket is linked in approve-every-trade mode. Real buying needs instant access.";
  const missing = i.neededPockets.filter((p) => !i.link!.pockets.includes(p));
  if (missing.length) return `Your linked pocket doesn't include ${missing.join(", ")}.`;
  return null;
}

/* ------------------------------ Telegram buttons ------------------------------ */

export type AiChoice = "yes" | "no";
const PREFIX: Record<AiChoice, string> = { yes: "ai1", no: "ai0" };
const CHOICE: Record<string, AiChoice> = { ai1: "yes", ai0: "no" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIG_LEN = 16;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(key: string, choice: AiChoice, checkId: string, userId: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`seeds-ai-exec|${choice}|${checkId}|${userId}`)));
  return b64url(mac).slice(0, SIG_LEN);
}

/** Telegram callback_data for "Do it" / "Skip today" (≤ 64 bytes), bound to one day's check and its owner. */
export async function aiButtonData(key: string, choice: AiChoice, checkId: string, userId: string): Promise<string> {
  if (!key || !UUID.test(checkId)) throw new Error("bad AI button");
  return `${PREFIX[choice]}:${checkId}:${await sign(key, choice, checkId, userId)}`;
}

export function parseAiButton(data: unknown): { choice: AiChoice; checkId: string; sig: string } | null {
  if (typeof data !== "string" || data.length > 64) return null;
  const [p, checkId, sig, ...rest] = data.split(":");
  const choice = CHOICE[p ?? ""];
  if (!choice || rest.length || !UUID.test(checkId ?? "") || !sig || sig.length !== SIG_LEN) return null;
  return { choice, checkId: checkId!, sig };
}

export async function aiButtonOk(key: string, d: { choice: AiChoice; checkId: string; sig: string }, userId: string): Promise<boolean> {
  if (!key) return false;
  const want = await sign(key, d.choice, d.checkId, userId);
  let diff = want.length ^ d.sig.length;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ (d.sig.charCodeAt(i) || 0);
  return diff === 0;
}

/** A tap counts only from the owner's verified private chat, on a one-tap-sized day still waiting. */
export function aiTapDecision(i: {
  signatureOk: boolean; privateChat: boolean; tapChatId: string; ownerChatId: string | null; ownerChatVerified: boolean;
  status: string; oneTap: boolean; expiresAtMs: number; nowMs: number; choice: AiChoice;
}): "refuse" | "already_decided" | "expired" | "needs_site" | "approve" | "decline" {
  if (!i.signatureOk || !i.privateChat || !i.ownerChatVerified || !i.ownerChatId || i.ownerChatId !== i.tapChatId) return "refuse";
  if (i.status !== "waiting") return "already_decided";
  if (!(i.expiresAtMs > i.nowMs)) return "expired";
  if (i.choice === "no") return "decline";
  return i.oneTap ? "approve" : "needs_site";
}
