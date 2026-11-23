/**
 * Order approval (Bobby, Nov 23 2026): the member taps Approve in Telegram once, when an
 * order is placed. That one tap lets Seeds pay every fill of that order, at its price or
 * better, up to its size, until the order fills or is cancelled. A market order is
 * approved before it executes; nothing waits for a tap after a trade has happened.
 * Pure and tested; the server parts live in order-approval.server.ts.
 */

/** How long the member has to tap Approve after placing (a market order must be fresh). */
export const ORDER_TAP_TTL_MS = { limit: 15 * 60_000, market: 3 * 60_000 } as const;

/** An approved limit order stays approved until it fills or is cancelled; this is only a backstop. */
export const ORDER_APPROVAL_LIFETIME_MS = 365 * 24 * 60 * 60_000;

/** An approved market order executes straight away; its approval only needs to outlive that. */
export const ORDER_MARKET_RUN_MS = 5 * 60_000;

/** Placeholder destination stored on an order approval: each fill pays whoever is on the other side. */
export const ORDER_BOOK_DESTINATION = "seeds-order-book";

const EPS = 1e-8;

/**
 * Most coins the order may ever send. Sell: the base coins offered. Buy: size × limit price
 * (a market order's limit is its price protection), since every fill is at that price or better.
 */
export function orderApprovalCap(side: "buy" | "sell", amount: number, price: number): number {
  return side === "sell" ? amount : amount * price;
}

/** A fill's price is allowed when it is at the order's price or better for the member. */
export function fillPriceAllowed(side: "buy" | "sell", fillPrice: number, limitPrice: number): boolean {
  const tol = Math.abs(limitPrice) * 1e-9;
  return side === "buy" ? fillPrice <= limitPrice + tol : fillPrice >= limitPrice - tol;
}

export type OrderApprovalView = {
  status: string;
  expiresAtMs: number;
  userId: string;
  linkId: string;
  fromAddress: string;
  leg: string;
  /** Most coins this approval may pay out in total. */
  cap: number;
  side: "buy" | "sell";
  limitPrice: number;
};

export type FillAsk = {
  userId: string;
  linkId: string;
  fromAddress: string;
  leg: string;
  /** Coins this fill would send. */
  amount: number;
  price: number;
  side: "buy" | "sell";
  nowMs: number;
  /** Coins earlier fills of this order already took from the approval (not counting cancelled ones). */
  alreadyCommitted: number;
};

/** Why this fill can't be paid under the order's approval, or null when it can. */
export function fillFromOrderProblem(a: OrderApprovalView | null, f: FillAsk): string | null {
  if (!a) return "This order was never approved in Telegram.";
  if (a.status !== "approved") return "This order's Telegram approval has ended.";
  if (a.expiresAtMs <= f.nowMs) return "This order's Telegram approval has ended.";
  if (a.userId !== f.userId) return "This order belongs to someone else.";
  if (a.linkId !== f.linkId || a.fromAddress !== f.fromAddress) return "Your trading pocket changed since you approved this order.";
  if (a.leg !== f.leg) return "This fill pays a different coin than the order approved.";
  if (a.side !== f.side) return "This fill is on the other side of the order.";
  if (!(f.amount > 0)) return "Nothing to pay.";
  if (!fillPriceAllowed(a.side, f.price, a.limitPrice)) return "This fill's price is worse than the order's price.";
  if (f.alreadyCommitted + f.amount > a.cap + EPS) return "This fill would pay more than the order approved.";
  return null;
}

const num = (n: number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 8 });

/** The Telegram text for an order tap: what is placed, the worst price, the most that can leave, how long it lasts. */
export function orderTapText(i: {
  side: "buy" | "sell";
  orderType: "limit" | "market";
  amount: number;
  price: number;
  baseSymbol: string;
  quoteSymbol: string;
  pair: string;
  /** Recent-price line from trade-terms (e.g. "market price 0.1"), or null. */
  reference: string | null;
  warning: string | null;
}): { text: string; capLine: string } {
  const payer = i.side === "sell" ? i.baseSymbol : i.quoteSymbol;
  const cap = orderApprovalCap(i.side, i.amount, i.price);
  const what = i.orderType === "market"
    ? `${i.side === "buy" ? "Buy" : "Sell"} ${num(i.amount)} ${i.baseSymbol} now at the market, ${i.side === "buy" ? "paying at most" : "getting at least"} ${num(i.price)} ${i.quoteSymbol} each`
    : `${i.side === "buy" ? "Buy" : "Sell"} ${num(i.amount)} ${i.baseSymbol} at ${num(i.price)} ${i.quoteSymbol} each (or better)`;
  const capLine = `Up to ${num(cap)} ${payer} can leave your trading pocket for this order, only to the members it trades with.`;
  const lasts = i.orderType === "market"
    ? "Anything that can't fill within that price right after you approve is cancelled."
    : "It stays on the book and trades automatically until it fills or you cancel it. No more taps.";
  return {
    capLine,
    text:
      `🧾 <b>Place this order?</b>\n` +
      `<b>${esc(what)}</b>\n` +
      `${esc(i.pair)}${i.reference ? ` · ${esc(i.reference)}` : ""}\n\n` +
      `${esc(capLine)}\n${esc(lasts)}\n\n` +
      (i.warning ? `⚠️ <b>${esc(i.warning)}</b>\n\n` : "") +
      `Nothing is placed until you tap Approve.\nIf you didn't place this, tap Decline and check your account.`,
  };
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
