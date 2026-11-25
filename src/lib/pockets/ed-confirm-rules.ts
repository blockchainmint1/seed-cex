/** Delivery evidence, not just an accepted request or advanced wallet sequence. */
export type TonTrace = {
  emulated?: boolean;
  transaction: { aborted: boolean; success: boolean; in_msg?: { hash: string }; account: { address: string };
    out_msgs: { destination?: { address: string }; value: number | string }[] };
  children?: TonTrace[];
};
export function tonTraceStatus(trace: TonTrace, messageId: string, destination: string, units: bigint) {
  if (trace.emulated || trace.transaction.in_msg?.hash !== messageId) return null;
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
export function suiPaid(changes: { address: string; coinType: string; amount: string }[] | undefined, to: string, units: bigint): boolean {
  return changes?.filter((c) => c.address === to && /^(0x0*2)::sui::SUI$/.test(c.coinType)).reduce((n, c) => n + BigInt(c.amount), 0n) === units;
}