/**
 * "Arriving" coins: deposits Seeds can already see on their way to a pocket but that
 * aren't in a block yet (Bobby, Nov 24 2026). They are shown as a grey note next to the
 * coin and never count toward a balance, the pocket's total value, "Available",
 * withdrawals, orders, swaps or any other spend — those read confirmed coins only.
 *
 * A waiting transaction counts as arriving only when none of its inputs come from the
 * pocket itself, so the pocket's own change (e.g. after paying TSD) is never shown as a
 * deposit, and a pocket sending and receiving at once still shows the incoming coins.
 *
 * Pure and tested (arriving.test.ts).
 */

/** Below this much an amount is dust (rounding, tiny spam outputs), not a deposit. */
export const ARRIVING_FLOOR: Record<string, number> = {
  TXC: 0.01,
  ISK: 0.001,
  DOGE: 0.01,
};
const DEFAULT_FLOOR = 0.00001;

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

/** The amount to show as arriving for a coin (0 = show nothing). */
export function arrivingShown(symbol: string, amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount)) return 0;
  const n = round8(amount);
  return n > (ARRIVING_FLOOR[symbol] ?? DEFAULT_FLOOR) ? n : 0;
}

/** A waiting transaction reduced to what matters here. */
export type FlatTx = {
  txid: string;
  /** Address of every input; null when an input's owner can't be read. */
  from: Array<string | null>;
  outputs: Array<{ address: string | null; sats: number }>;
  /** Carries an Omni payload (TSD etc.): its TXC output is the token's marker, not a deposit. */
  omni: boolean;
};

/** Most waiting transactions one read looks at; beyond that nothing is shown as arriving. */
export const MAX_ARRIVING_TXS = 25;

/**
 * Coins arriving at `address`, in whole coins (8 decimals): outputs to it in waiting
 * transactions none of whose inputs are this address (or unreadable). Omni transactions
 * are skipped — their token shows as arriving TSD instead.
 */
export function arrivingFromTxs(txs: FlatTx[], address: string, decimals = 8): number {
  if (txs.length > MAX_ARRIVING_TXS) return 0;
  const seen = new Set<string>();
  let sats = 0;
  for (const t of txs) {
    if (seen.has(t.txid)) continue;
    seen.add(t.txid);
    if (t.omni) continue;
    if (t.from.length === 0 || t.from.some((a) => a === null || a === address)) continue;
    for (const o of t.outputs) if (o.address === address && Number.isFinite(o.sats) && o.sats > 0) sats += o.sats;
  }
  return round8(sats / 10 ** decimals);
}

const OMNI_MARKER = "6f6d6e69"; // "omni"
const isTxid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);
const one = (v: unknown): string | null => (Array.isArray(v) && v.length === 1 && typeof v[0] === "string" ? v[0] : null);

/** An Esplora (mempool.texitcoin.org / mempool.iskandercoin.com) transaction, only if still waiting. */
export function flatFromEsplora(raw: unknown): FlatTx | null {
  const t = raw as {
    txid?: unknown;
    status?: { confirmed?: unknown };
    vin?: Array<{ is_coinbase?: unknown; prevout?: { scriptpubkey_address?: unknown } | null }>;
    vout?: Array<{ scriptpubkey?: unknown; scriptpubkey_type?: unknown; scriptpubkey_address?: unknown; value?: unknown }>;
  } | null;
  if (!t || !isTxid(t.txid) || t.status?.confirmed !== false || !Array.isArray(t.vin) || !Array.isArray(t.vout)) return null;
  return {
    txid: t.txid.toLowerCase(),
    from: t.vin.map((i) => (i && i.is_coinbase !== true && typeof i.prevout?.scriptpubkey_address === "string" ? i.prevout.scriptpubkey_address : null)),
    outputs: t.vout.map((o) => ({ address: typeof o?.scriptpubkey_address === "string" ? o.scriptpubkey_address : null, sats: typeof o?.value === "number" ? o.value : 0 })),
    omni: t.vout.some((o) => o?.scriptpubkey_type === "op_return" && typeof o.scriptpubkey === "string" && o.scriptpubkey.toLowerCase().includes(OMNI_MARKER)),
  };
}

/** A Blockbook (NowNodes) transaction, only if still waiting (0 confirmations). */
export function flatFromBlockbook(raw: unknown): FlatTx | null {
  const t = raw as {
    txid?: unknown;
    confirmations?: unknown;
    blockHeight?: unknown;
    vin?: Array<{ addresses?: unknown; isAddress?: unknown; coinbase?: unknown }>;
    vout?: Array<{ value?: unknown; addresses?: unknown; isAddress?: unknown }>;
  } | null;
  if (!t || !isTxid(t.txid) || t.confirmations !== 0 || !Array.isArray(t.vin) || !Array.isArray(t.vout)) return null;
  return {
    txid: t.txid.toLowerCase(),
    from: t.vin.map((i) => (i && i.coinbase === undefined && i.isAddress === true ? one(i.addresses) : null)),
    outputs: t.vout.map((o) => ({
      address: o?.isAddress === true ? one(o.addresses) : null,
      sats: typeof o?.value === "string" && /^\d+$/.test(o.value) ? Number(o.value) : 0,
    })),
    omni: false,
  };
}

/** One entry of the TEXITcoin node's omni_listpendingtransactions. */
export type PendingOmniTx = {
  txid?: string;
  sendingaddress?: string;
  referenceaddress?: string;
  type_int?: number;
  propertyid?: number;
  amount?: string | number;
};

/**
 * Omni tokens (e.g. TSD) arriving at an address: unconfirmed Simple Sends of that
 * property from someone else to it. The pocket's own sends and other transaction
 * types never count.
 */
export function omniArriving(list: unknown, address: string, propertyId: number): number {
  if (!Array.isArray(list)) return 0;
  let sum = 0;
  const seen = new Set<string>();
  for (const raw of list as PendingOmniTx[]) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.type_int !== 0 || raw.propertyid !== propertyId) continue;
    if (raw.referenceaddress !== address || raw.sendingaddress === address) continue;
    if (raw.txid) {
      if (seen.has(raw.txid)) continue;
      seen.add(raw.txid);
    }
    const amt = Number(raw.amount);
    if (Number.isFinite(amt) && amt > 0) sum += amt;
  }
  return round8(sum);
}
