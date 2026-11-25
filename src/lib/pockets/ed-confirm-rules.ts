/** Delivery evidence, not just an accepted request or advanced wallet sequence. */
export type TonTrace = {
  emulated?: boolean;
  transaction: {
    aborted: boolean; success: boolean; account: { address: string };
    in_msg?: { hash?: string; value?: number | string | null; destination?: { address?: string | null } | null };
    /** TONAPI traces leave this empty even when the wallet sent messages (audit TA1); never rely on it. */
    out_msgs?: unknown[];
    action_phase?: { success?: boolean; skipped_actions?: number; total_actions?: number } | null;
  };
  children?: TonTrace[];
};

/** A nanoton amount read exactly, or null when it is missing or too big to be read safely. */
function exactUnits(v: unknown): bigint | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null;
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return null;
}

/**
 * Audit TA1: payment proof comes from the destination's own transaction in the trace (its incoming
 * message carries the amount), and "accepted but skipped" proof from the wallet's action phase.
 * Anything less certain returns null, so a paid send is never marked failed and re-requestable.
 */
export function tonTraceStatus(trace: TonTrace, messageId: string, destination: string, units: bigint) {
  const root = trace.transaction;
  if (trace.emulated || root.in_msg?.hash !== messageId) return null;
  if (root.aborted || !root.success) return { success: false, confirmations: 1 };
  const toDest = (trace.children ?? []).filter((c) => c.transaction.account.address === destination && c.transaction.in_msg?.destination?.address === destination);
  for (const c of toDest) {
    const v = exactUnits(c.transaction.in_msg?.value);
    if (v === null) return null; // imprecise evidence: keep waiting
    if (v === units) return c.emulated ? null : { success: !c.transaction.aborted && c.transaction.success, confirmations: 1 };
  }
  const ap = root.action_phase;
  if (ap && ((typeof ap.skipped_actions === "number" && ap.skipped_actions > 0) || ap.success === false)) return { success: false, confirmations: 1 };
  return null;
}

/** Negative chain evidence is required; wall-clock age and a timeout alone never fail a send. */
export function stellarExpired(expiresAt: number, ledgerClosedAt: number): boolean {
  return Number.isSafeInteger(expiresAt) && expiresAt > 0 && Number.isFinite(ledgerClosedAt) && ledgerClosedAt > expiresAt + 30;
}
export function tonExpired(expiresAt: number, signedSeqno: number, liveSeqno: number, syncedAt: number): boolean {
  // W5 seqno=0 has 0xffffffff validity, regardless of the requested two-minute timeout.
  return signedSeqno > 0 && Number.isSafeInteger(signedSeqno) && liveSeqno === signedSeqno && stellarExpired(expiresAt, syncedAt);
}
export function suiExpired(expiresEpoch: string, currentEpoch: string): boolean {
  return /^\d+$/.test(expiresEpoch) && /^\d+$/.test(currentEpoch) && BigInt(currentEpoch) > BigInt(expiresEpoch);
}
export function suiPaid(changes: { address: string; coinType: string; amount: string }[] | undefined, to: string, units: bigint): boolean {
  return changes?.filter((c) => c.address === to && /^(0x0*2)::sui::SUI$/.test(c.coinType)).reduce((n, c) => n + BigInt(c.amount), 0n) === units;
}
/** Audit EF1: a Stellar 404 proves expiry only when that same response's Latest-Ledger is at
 * least the head we read first, and that head closed past the signed expiry (+ margin). */
export function stellarNotFoundExpired(expiresAt: number, head: { sequence: number; closed_at: string }, latestLedgerHeader: string | null): boolean {
  const latest = latestLedgerHeader != null && /^\d+$/.test(latestLedgerHeader.trim()) ? Number(latestLedgerHeader.trim()) : NaN;
  if (!Number.isSafeInteger(latest) || !Number.isSafeInteger(head.sequence) || latest < head.sequence) return false;
  const closed = Date.parse(head.closed_at) / 1000;
  return Number.isFinite(closed) && stellarExpired(expiresAt, closed);
}
