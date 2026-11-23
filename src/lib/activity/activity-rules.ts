/**
 * Activity page rules (pure, client-safe, tested): one row shape for everything a
 * member does on Seeds — orders, trades, swaps, P2P, withdrawals, AI moves,
 * Telegram approvals and wallet links — plus filters and the CSV download.
 *
 * Each swap is one row: TSD Bridge legs, pool hops of a two-step swap and the
 * THORChain leg of a TSD swap belong to their parent and are never listed twice.
 */

export type ActivityKind = "order" | "trade" | "swap" | "p2p" | "withdrawal" | "deposit" | "ai" | "approval" | "wallet";
/** done = finished well · pending = still moving · stopped = ended without finishing · action = waiting on the member. */
export type Tone = "done" | "pending" | "stopped" | "action";
export type Amount = { amount: number; coin: string };

export type ActivityRow = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string | null;
  sent: Amount | null;
  got: Amount | null;
  status: string;
  tone: Tone;
  /** Page inside Seeds that shows this item. */
  href: string | null;
  /** Public explorer / tracker page for its transaction. */
  txUrl: string | null;
};

export const KIND_LABEL: Record<ActivityKind, string> = {
  order: "Order", trade: "Trade", swap: "Swap", p2p: "P2P", withdrawal: "Withdrawal", deposit: "Deposit",
  ai: "Seeds AI", approval: "Approval", wallet: "Wallet link",
};

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const nn = (v: unknown): number | null => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/* ---------------------------------- orders ---------------------------------- */

export type OrderIn = { id: string; pair: string; side: string; price: number | string; amount: number | string; filled: number | string; status: string; order_type?: string | null; created_at: string };

export function orderTone(status: string): Tone {
  if (status === "open" || status === "partial") return "pending";
  if (status === "filled") return "done";
  return "stopped";
}
export const ORDER_LABEL: Record<string, string> = { open: "Open", partial: "Partly filled", filled: "Filled", cancelled: "Cancelled" };
export const isOpenOrder = (o: { status: string }) => o.status === "open" || o.status === "partial";

/* ---------------------------------- trades ---------------------------------- */

export const TRADE_LABEL: Record<string, string> = {
  matched: "Settling", both_funded: "Confirming", settled: "Settled", disputed: "On hold · team review", timed_out: "Cancelled", cancelled: "Cancelled",
};
export function tradeTone(status: string): Tone {
  if (status === "settled") return "done";
  if (status === "matched" || status === "both_funded") return "pending";
  if (status === "disputed") return "action";
  return "stopped";
}

/* ---------------------------------- swaps ----------------------------------- */

export const SEND_LABEL: Record<string, string> = { signing: "Sending", sent: "Swapping", done: "Delivered", refunded: "Refunded", failed: "Not sent", unknown: "Checking" };
export function sendTone(s: string): Tone {
  return s === "done" ? "done" : s === "failed" || s === "refunded" ? "stopped" : "pending";
}

export const ROUTE_LABEL: Record<string, string> = {
  reserved: "Starting", sending_tsd: "Sending TSD", bridging: "TSD Bridge converting", swapping: "Swapping", gas_pending: "Paying network fee",
  swap_sent: "Swapping", minting: "Sending USDC to TSD Bridge", needs_ok: "Price moved — your call", done: "Delivered",
  refunded: "Refunded", kept_usdc: "Stopped — USDC in your pocket", failed: "Stopped",
};
export function routeTone(s: string): Tone {
  if (s === "done") return "done";
  if (s === "needs_ok") return "action";
  if (s === "failed" || s === "refunded" || s === "kept_usdc") return "stopped";
  return "pending";
}

export const DEX_LABEL: Record<string, string> = {
  awaiting_approval: "Waiting for your Telegram tap", approved: "Starting", bridging: "TSD Bridge converting", ready: "Preparing",
  approving: "Giving the pool permission", swapping: "Swapping", minting: "TSD Bridge issuing TSD", done: "Delivered",
  failed: "Stopped", declined: "Declined", expired: "Not approved in time", cancelled: "Cancelled", kept_usdc: "Stopped — USDC in your pocket",
};
export function dexTone(s: string): Tone {
  if (s === "done") return "done";
  if (s === "awaiting_approval") return "action";
  if (["failed", "declined", "expired", "cancelled", "kept_usdc"].includes(s)) return "stopped";
  return "pending";
}

export const TWO_LABEL: Record<string, string> = {
  awaiting_approval: "Waiting for your Telegram tap", approved: "Starting", leg1: "Step 1 of 2", mid: "Starting step 2", leg2: "Step 2 of 2",
  done: "Delivered", failed: "Stopped", refunded: "Refunded", kept_mid: "Stopped — coins in your pocket", declined: "Declined",
  expired: "Not approved in time", cancelled: "Cancelled",
};
export function twoTone(s: string): Tone {
  if (s === "done") return "done";
  if (s === "awaiting_approval") return "action";
  if (["failed", "refunded", "kept_mid", "declined", "expired", "cancelled"].includes(s)) return "stopped";
  return "pending";
}

/* ----------------------------------- p2p ------------------------------------ */

export const P2P_LABEL: Record<string, string> = { open: "Waiting for payment", paid: "Buyer says paid", released: "Completed", cancelled: "Cancelled", disputed: "In dispute" };
/** Open/paid trades wait on one side: the buyer pays, the seller releases. */
export function p2pTone(status: string, role: "buyer" | "seller"): Tone {
  if (status === "released") return "done";
  if (status === "cancelled") return "stopped";
  if (status === "disputed") return "action";
  if (status === "open") return role === "buyer" ? "action" : "pending";
  if (status === "paid") return role === "seller" ? "action" : "pending";
  return "pending";
}

/* -------------------------------- withdrawals ------------------------------- */

export const WITHDRAW_LABEL: Record<string, string> = {
  approving: "Waiting for your Telegram tap", held: "Safety hold", signing: "Sending", sent: "Sent — confirming", confirmed: "Confirmed",
  cancelled: "Cancelled", failed: "Not sent", unknown: "Checking",
};
export function withdrawTone(s: string): Tone {
  if (s === "confirmed") return "done";
  if (s === "approving") return "action";
  if (s === "cancelled" || s === "failed") return "stopped";
  return "pending";
}

/* --------------------------------- seeds ai --------------------------------- */

export const AI_LABEL: Record<string, string> = { queued: "Queued", starting: "Starting", running: "Running", done: "Done", failed: "Stopped", skipped: "Skipped", cancelled: "Cancelled" };
export function aiTone(s: string): Tone {
  if (s === "done") return "done";
  if (s === "failed" || s === "skipped" || s === "cancelled") return "stopped";
  return "pending";
}

/* -------------------------------- approvals --------------------------------- */

export const APPROVAL_WHAT: Record<string, string> = {
  trade_leg: "Exchange trade payment", p2p_release: "P2P release", swap_out: "Swap to an outside address", dex_swap: "Pool swap",
  withdrawal: "Withdrawal", two_step: "Two-step swap",
  loan_collateral: "Loan collateral", loan_funding: "Loan sent", loan_repay: "Loan repayment",
  order: "Exchange order",
};
/** A Telegram request still waiting for a tap right now. */
export function approvalWaiting(a: { status: string; expires_at: string }, now = Date.now()): boolean {
  return a.status === "pending" && Date.parse(a.expires_at) > now;
}

/* --------------------------------- trades ----------------------------------- */

/** The member's own side of a fill: trades store the taker's side, so the maker did the opposite. */
export function mySide(side: string, role: "maker" | "taker"): "buy" | "sell" {
  const s = side === "sell" ? "sell" : "buy";
  return role === "taker" ? s : s === "buy" ? "sell" : "buy";
}

/* --------------------------------- leg rules -------------------------------- */

/**
 * Ids that are a step of something else and must not get their own swap row:
 * THORChain/Maya legs of TSD swaps and two-step swaps, TSD routes inside pool swaps,
 * and pool hops of two-step swaps.
 */
export function hiddenLegs(i: {
  tsdRoutes: Array<{ swap_send_id: string | null }>;
  twoSteps: Array<{ swap_send_id: string | null; leg2_swap_send_id: string | null }>;
  dexSwaps: Array<{ id: string; tsd_route_id: string | null; two_step_id: string | null }>;
}): { sends: Set<string>; routes: Set<string>; dex: Set<string> } {
  const sends = new Set<string>();
  for (const r of i.tsdRoutes) if (r.swap_send_id) sends.add(r.swap_send_id);
  for (const t of i.twoSteps) {
    if (t.swap_send_id) sends.add(t.swap_send_id);
    if (t.leg2_swap_send_id) sends.add(t.leg2_swap_send_id);
  }
  const routes = new Set(i.dexSwaps.map((d) => d.tsd_route_id).filter((x): x is string => Boolean(x)));
  const dex = new Set(i.dexSwaps.filter((d) => d.two_step_id).map((d) => d.id));
  return { sends, routes, dex };
}

/* --------------------------------- filters ---------------------------------- */

export type ActivityFilter = { kinds?: ActivityKind[]; coin?: string; from?: string; to?: string; tones?: Tone[] };

export function filterRows(rows: ActivityRow[], f: ActivityFilter): ActivityRow[] {
  const coin = f.coin?.trim().toUpperCase();
  const from = f.from ? Date.parse(f.from) : null;
  // "to" is a day: include all of it.
  const to = f.to ? Date.parse(f.to) + 86_400_000 : null;
  return rows.filter((r) => {
    if (f.kinds?.length && !f.kinds.includes(r.kind)) return false;
    if (f.tones?.length && !f.tones.includes(r.tone)) return false;
    if (coin && ![r.sent?.coin, r.got?.coin].some((c) => c?.toUpperCase() === coin)) return false;
    const t = Date.parse(r.at);
    if (from != null && Number.isFinite(from) && t < from) return false;
    if (to != null && Number.isFinite(to) && t >= to) return false;
    return true;
  });
}

export const newestFirst = (a: ActivityRow, b: ActivityRow) => b.at.localeCompare(a.at);

/** Coins that appear anywhere in the rows, for the coin filter. */
export function coinsIn(rows: ActivityRow[]): string[] {
  const s = new Set<string>();
  for (const r of rows) for (const c of [r.sent?.coin, r.got?.coin]) if (c) s.add(c);
  return [...s].sort();
}

/* ----------------------------------- csv ------------------------------------ */

function cell(v: string | number | null | undefined): string {
  if (v == null) return "";
  let s = String(v);
  // Spreadsheets run cells starting with these as formulas.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function activityCsv(rows: ActivityRow[]): string {
  const head = ["Date (UTC)", "Type", "What", "Sent", "Sent coin", "Received", "Received coin", "Status", "Transaction"];
  const lines = rows.map((r) => [
    r.at, KIND_LABEL[r.kind], r.detail ? `${r.title} — ${r.detail}` : r.title,
    r.sent?.amount ?? null, r.sent?.coin ?? null, r.got?.amount ?? null, r.got?.coin ?? null, r.status, r.txUrl,
  ].map(cell).join(","));
  return [head.join(","), ...lines].join("\n");
}

export { n as toNum, nn as toNumOrNull };
