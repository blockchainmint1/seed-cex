/**
 * Pure readings of each network's "where is my transaction?" answer (QA-0013 follow-up).
 * Each returns null = keep waiting (not found yet, or the server answered unclearly),
 * success true = in a final block, success false = the network finally refused it.
 * A withdrawal is only ever marked failed when the network says so in a final block.
 */
export type TxReading = { confirmations: number; success: boolean | null } | null;

/** Blockbook /tx answer (BTC, DOGE, BCH). Missing = waiting; Bitcoin-style chains have no "failed in a block". */
export function readBlockbookTx(j: unknown): TxReading {
  if (!j || typeof j !== "object") return null;
  const c = (j as { confirmations?: unknown }).confirmations;
  if (typeof c !== "number" || !Number.isFinite(c) || c < 0) return null;
  return { confirmations: Math.floor(c), success: true };
}

/** XRP Ledger `tx` result. Only a validated ledger counts; tec* in a validated ledger = refused (only the fee was taken). */
export function readXrpTx(r: unknown): TxReading {
  if (!r || typeof r !== "object") return null;
  const o = r as { validated?: unknown; meta?: { TransactionResult?: unknown } };
  if (o.validated !== true) return null;
  const res = o.meta?.TransactionResult;
  if (res === "tesSUCCESS") return { confirmations: 1, success: true };
  if (typeof res === "string" && /^tec/.test(res)) return { confirmations: 1, success: false };
  return null;
}

/** TRON solidified gettransactionbyid answer. {} = not solidified yet. */
export function readTronTx(r: unknown): TxReading {
  if (!r || typeof r !== "object") return null;
  const ret = (r as { ret?: { contractRet?: unknown }[] }).ret;
  const cr = Array.isArray(ret) ? ret[0]?.contractRet : undefined;
  if (cr === "SUCCESS") return { confirmations: 1, success: true };
  if (typeof cr === "string" && cr.length > 0) return { confirmations: 1, success: false };
  return null;
}

/** Solana getSignatureStatuses value[0]. Only "finalized" counts either way. */
export function readSolStatus(v: unknown): TxReading {
  if (!v || typeof v !== "object") return null;
  const o = v as { confirmationStatus?: unknown; err?: unknown };
  if (o.confirmationStatus !== "finalized") return { confirmations: 0, success: null };
  return { confirmations: 1, success: o.err == null };
}

/** Koios tx_status row. Cardano never "fails in a block" for a plain send: missing = waiting. */
export function readKoiosStatus(rows: unknown): TxReading {
  const row = Array.isArray(rows) ? rows[0] : null;
  const n = row && typeof row === "object" ? (row as { num_confirmations?: unknown }).num_confirmations : null;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return null;
  return { confirmations: Math.floor(n), success: true };
}

/** Monero wallet get_transfer_by_txid. Only "out" transfers count; anything else keeps waiting. */
export function readMoneroTransfer(r: unknown): TxReading {
  const t = r && typeof r === "object" ? (r as { transfer?: { type?: unknown; confirmations?: unknown } }).transfer : null;
  if (!t || t.type !== "out" || typeof t.confirmations !== "number") return null;
  return { confirmations: Math.max(0, Math.floor(t.confirmations)), success: true };
}
