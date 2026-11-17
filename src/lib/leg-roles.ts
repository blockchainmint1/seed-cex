/**
 * Who delivers which leg, and how much.
 *
 * Pure logic, shared by every settlement engine so the base/quote question is
 * answered in exactly one place.
 */
import { getPair, type LegId } from "@/lib/chains";

export type TradeShape = {
  id: string;
  status: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  pair?: string | null;
  maker_id: string | null;
  taker_id: string | null;
};

export type LegRole = "base" | "quote";

export function legRole(pairId: string | null | undefined, leg: LegId): LegRole {
  const pair = getPair(pairId ?? "TSD_TXC");
  if (pair.baseLeg === leg) return "base";
  if (pair.quoteLeg === leg) return "quote";
  throw new Error(`${leg.toUpperCase()} is not a leg of ${pair.label}`);
}

/** The seller of the base asset — the taker when they sold, else the maker. */
export function baseSeller(trade: TradeShape): string | null {
  return trade.side === "sell" ? trade.taker_id : trade.maker_id;
}

/** The party who delivers a given leg. */
export function delivererOf(trade: TradeShape, role: LegRole): string | null {
  const seller = baseSeller(trade);
  const buyer = seller === trade.taker_id ? trade.maker_id : trade.taker_id;
  return role === "base" ? seller : buyer;
}

/** The party who receives a given leg. */
export function receiverOf(trade: TradeShape, role: LegRole): string | null {
  return delivererOf(trade, role === "base" ? "quote" : "base");
}

/** Size of a leg: base legs move `amount`, quote legs move `amount * price`. */
export function legAmount(
  trade: TradeShape,
  role: LegRole,
  _expected?: number | string | null,
): number {
  // Always derived from the immutable trade terms, never from a stored row
  // (security audit C1).
  return role === "base" ? Number(trade.amount) : Number(trade.amount) * Number(trade.price);
}

/** Only the party who pays a leg may send it (security audit C2). */
export function assertDeliverer(callerId: string, deliverer: string | null, symbol: string) {
  if (!deliverer || callerId !== deliverer) {
    throw new Error(`Only the party paying the ${symbol} leg can send it`);
  }
}
