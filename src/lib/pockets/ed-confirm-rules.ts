/** Delivery evidence, not just an accepted request or advanced wallet sequence. */
export type TonTrace = {
  emulated?: boolean;
  transaction: { aborted: boolean; success: boolean; in_msg?: { hash: string }; account: { address: string };
    out_msgs: { destination?: { address: string }; value: number | string }[] };
  children?: TonTrace[];
};
export function tonTraceStatus(trace: TonTrace, messageId: string, destination: string, units: bigint) {
  if (trace.emulated || trace.transaction.in_msg?.hash !== messageId) return null;
  // Imprecise evidence is not proof of failure: never release a hold on a parsing error.
  if (trace.transaction.out_msgs.some((m) => m.destination?.address === destination &&
    ((typeof m.value === "number" && !Number.isSafeInteger(m.value)) || !/^\d+$/.test(String(m.value))))) return null;
  const msg = trace.transaction.out_msgs.find((m) => {
    if (m.destination?.address !== destination) return false;
    if (typeof m.value === "number" && !Number.isSafeInteger(m.value)) return false;
    return /^\d+$/.test(String(m.value)) && BigInt(m.value) === units;
  });
  const child = trace.children?.find((c) => c.transaction.account.address === destination);
  if (trace.transaction.aborted || !trace.transaction.success || !msg) return { success: false, confirmations: 1 };
  if (!child || child.emulated) return null;
  return { success: !child.transaction.aborted && child.transaction.success, confirmations: 1 };
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
