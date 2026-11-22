/**
 * Coins set aside in a member's own pocket (pure, client-safe, tested).
 *
 * Seeds never holds member coins, so nothing is locked on-chain. Instead Seeds keeps
 * its own books (Bobby, Nov 22 2026): coins promised to open orders, to exchange trades
 * whose side hasn't been sent yet, and to live P2P sales are "set aside". They still sit
 * in the pocket, but Seeds won't withdraw, swap, lend or promise them to anything else,
 * and when they leave the pocket some other way the newest orders that can't be covered
 * are cancelled (order-cover.server.ts).
 */
import { CHAINS, LEGS, getLeg, type LegId } from "@/lib/chains";
import { payAmountOf, payLegOf, type OpenOrderRow } from "@/lib/order-readiness";

export type SetAside = {
  /** Promised to resting orders (their unfilled part). */
  orders: number;
  /** Exchange trades already matched whose side this member still has to send. */
  trades: number;
  /** Live P2P sales (open, paid or disputed). */
  p2p: number;
  total: number;
  openOrders: number;
};

export const NOTHING_SET_ASIDE: SetAside = { orders: 0, trades: 0, p2p: 0, total: 0, openOrders: 0 };

const EPS = 1e-8;
const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
const fmt = (n: number) => String(Number(Math.max(0, n).toFixed(8)));

export type UnsentLeg = { leg: LegId; amount: number };

function orderLeg(o: OpenOrderRow): LegId | null {
  try {
    return payLegOf(o.pair, o.side);
  } catch {
    return null; // a retired market can't be filled
  }
}

function orderLeft(o: OpenOrderRow): number {
  const left = Math.max(0, Number(o.amount) - Number(o.filled));
  return payAmountOf(o.side, left, Number(o.price));
}

/** Everything set aside, per coin. */
export function setAsidesByLeg(i: {
  orders: OpenOrderRow[];
  unsentLegs: UnsentLeg[];
  p2p: Array<{ leg: LegId; amount: number }>;
}): Partial<Record<LegId, SetAside>> {
  const out: Partial<Record<LegId, SetAside>> = {};
  const at = (leg: LegId) => (out[leg] ??= { ...NOTHING_SET_ASIDE });
  for (const o of i.orders) {
    const leg = orderLeg(o);
    if (!leg) continue;
    const left = orderLeft(o);
    if (left <= EPS) continue;
    const s = at(leg);
    s.orders += left;
    s.openOrders += 1;
  }
  for (const t of i.unsentLegs) if (t.amount > EPS) at(t.leg).trades += t.amount;
  for (const p of i.p2p) if (p.amount > EPS) at(p.leg).p2p += p.amount;
  for (const s of Object.values(out)) {
    s.orders = round8(s.orders);
    s.trades = round8(s.trades);
    s.p2p = round8(s.p2p);
    s.total = round8(s.orders + s.trades + s.p2p);
  }
  return out;
}

/** Plain words for what the coins are set aside for. */
export function setAsideWhat(s: SetAside): string {
  const parts: string[] = [];
  if (s.orders > EPS) parts.push(s.openOrders === 1 ? "an open order" : "open orders");
  if (s.trades > EPS) parts.push("trades being paid");
  if (s.p2p > EPS) parts.push("P2P sales");
  if (parts.length <= 1) return parts[0] ?? "trades";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Can this send go out without touching coins set aside for trades?
 * `balances`: the coin's balance per network (EVM coins like USDC can sit on several;
 * a fill is paid from any one network that covers it). `network` = where this send
 * comes from (null → taken from the biggest balance, the cautious choice).
 * Returns a plain reason, or null.
 */
export function spendProblem(i: {
  symbol: string;
  setAside: SetAside;
  balances: Array<{ network: string | null; balance: number }> | null;
  amount: number;
  network?: string | null;
}): string | null {
  const held = i.setAside.total;
  if (held <= EPS) return null;
  if (!i.balances || i.balances.length === 0) {
    return `Couldn't check how much ${i.symbol} is free right now (some is set aside for ${setAsideWhat(i.setAside)}). Nothing was sent. Try again in a minute.`;
  }
  const rows = i.balances.map((b) => ({ ...b }));
  // The network this send leaves from couldn't be read: don't guess.
  if (i.network != null && rows.some((b) => b.network != null) && !rows.some((b) => b.network === i.network)) {
    return `Couldn't check how much ${i.symbol} is free right now (some is set aside for ${setAsideWhat(i.setAside)}). Nothing was sent. Try again in a minute.`;
  }
  let from = i.network == null ? -1 : rows.findIndex((b) => b.network === i.network);
  if (from < 0) from = rows.reduce((best, b, k) => (b.balance > (rows[best]?.balance ?? -1) ? k : best), 0);
  const here = rows[from]?.balance ?? 0;
  const otherBest = rows.reduce((m, b, k) => (k === from ? m : Math.max(m, b.balance)), 0);
  const afterHere = here - i.amount;
  if (Math.max(afterHere, otherBest) + EPS >= held) return null;
  const free = otherBest + EPS >= held ? here : Math.max(0, here - held);
  return `${fmt(held)} ${i.symbol} in your pocket is set aside for ${setAsideWhat(i.setAside)}. You can use up to ${fmt(free)} ${i.symbol} right now. Cancel an order on the Activity page to free more. Nothing was sent.`;
}

export type CoverOrder = OpenOrderRow & { id: string; created_at: string };

/**
 * The pocket no longer covers everything set aside for this coin: which orders come off
 * the book. Trades being paid and P2P sales can't be cancelled, so they keep first call on
 * the coins; open orders are cancelled newest first until the rest is covered.
 */
export function ordersToCancel(i: { leg: LegId; balance: number; fixed: number; orders: CoverOrder[] }): string[] {
  const mine = i.orders
    .filter((o) => orderLeg(o) === i.leg && orderLeft(o) > EPS)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  let promised = i.fixed + mine.reduce((s, o) => s + orderLeft(o), 0);
  const out: string[] = [];
  for (const o of mine) {
    if (promised <= i.balance + EPS) break;
    out.push(o.id);
    promised -= orderLeft(o);
  }
  return out;
}

/* ------------------------------ which coin is it? ----------------------------- */

const NETWORK_CODE: Record<string, string> = { ETH: "ethereum", BASE: "base", BSC: "bsc", LTC: "ltc" };

function evmLegFor(network: string, contract: string | null): LegId | null {
  const chain = CHAINS.find((c) => c.id === network);
  if (!chain) return null;
  for (const def of Object.values(LEGS)) {
    if (def.kind !== "evm" || !def.evmChains?.includes(chain.id)) continue;
    const asset = def.native
      ? chain.assets.find((a) => a.contract === null && a.symbol === def.symbol)
      : chain.assets.find((a) => a.contract && a.symbol === def.symbol);
    if (!asset) continue;
    if (def.native ? contract === null : asset.contract?.toLowerCase() === contract?.toLowerCase()) return def.id;
  }
  return null;
}

/** An EVM token (contract, or null for the network's own coin) → the Seeds coin it is, if any. */
export function legForEvmToken(network: string, contract: string | null): LegId | null {
  return evmLegFor(network, contract ? contract.toLowerCase() : null);
}

/** A THORChain/Maya asset ("ETH.USDC-0XA0B8…", "LTC.LTC") → the Seeds coin it is, if any. */
export function legForSwapAsset(asset: string): LegId | null {
  const [code, rest] = asset.split(".");
  if (!code || !rest) return null;
  const network = NETWORK_CODE[code.toUpperCase()];
  if (!network) return null;
  if (network === "ltc") return rest.toUpperCase() === "LTC" ? "ltc" : null;
  const dash = rest.indexOf("-");
  return legForEvmToken(network, dash < 0 ? null : rest.slice(dash + 1));
}

/** A coin + network from Seeds' own lists (withdraw catalog, balance rows) → its Seeds coin. */
export function legForCoin(symbol: string, network: string): LegId | null {
  for (const def of Object.values(LEGS)) {
    if (def.symbol !== symbol) continue;
    if (def.kind === "evm" && def.evmChains?.some((c) => c === network)) return def.id;
    if (def.kind === "omni" && network === "txc-omni") return def.id;
    if (def.kind === "utxo" && def.chain === network) return def.id;
  }
  return null;
}

/**
 * Balance rows (one per coin + network) → how much of each row is set aside. A coin on
 * several networks (USDC, USDT) shows its set-aside on the network holding the most,
 * the one a fill would be paid from.
 */
export function rowSetAsides(
  rows: Array<{ key: string; symbol: string; network: string; balance: number | null }>,
  byLeg: Partial<Record<LegId, SetAside>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  const byLegRows = new Map<LegId, typeof rows>();
  for (const r of rows) {
    const leg = legForCoin(r.symbol, r.network);
    if (!leg || !byLeg[leg]) continue;
    byLegRows.set(leg, [...(byLegRows.get(leg) ?? []), r]);
  }
  for (const [leg, list] of byLegRows) {
    const best = list.reduce((a, b) => ((b.balance ?? 0) > (a.balance ?? 0) ? b : a), list[0]!);
    out[best.key] = byLeg[leg]!.total;
  }
  return out;
}

/** Display symbol for a coin's set-aside line. */
export const legSymbol = (leg: LegId) => getLeg(leg).symbol;
