/** Native XLM / TON / SUI transfers only. One activation gate for deposits and sends. */
import type { EdChain } from "./ed25519-chains";

export type EdSendStage = "review" | "testers" | "open";
// Review first; after clearance use "testers" for funded tests, then "open" after those pass.
export function edSendStage(): EdSendStage { return "review"; }
export const ED_SENDS_ENABLED = edSendStage() === "open";
export function edStageAllows(stage: EdSendStage, tester: boolean): boolean {
  return stage === "open" || (stage === "testers" && tester);
}
export function edSendBlocker(symbol: string, tester = false): string | null {
  if (!["XLM", "TON", "SUI"].includes(symbol.toUpperCase())) return null;
  const stage = edSendStage();
  if (edStageAllows(stage, tester)) return null;
  if (stage === "review") return "Stellar, TON and Sui deposits and withdrawals are awaiting security review and a small live send test.";
  if (stage === "testers" && !tester) return "Stellar, TON and Sui deposits and withdrawals are open to beta testers first while live send tests are completed.";
  return null;
}

/** Conservative starting caps, in base units, for auditor review (not Seeds fees). */
export const ED_FEE_CAP: Record<EdChain, bigint> = { XLM: 1_000_000n, TON: 50_000_000n, SUI: 50_000_000n };
export const TON_KEEP = 10_000_000n;

export function checkNativeSpend(chain: EdChain, amount: bigint, balance: bigint, fee: bigint, reserve = 0n): void {
  if (amount <= 0n || amount > 0xffffffffffffffffn) throw new Error("Invalid native-coin amount. Nothing was sent.");
  if (balance < 0n || reserve < 0n || fee <= 0n || fee > ED_FEE_CAP[chain]) throw new Error(`${chain} fees or reserve couldn't be safely checked. Nothing was sent.`);
  if (balance < amount + fee + reserve) throw new Error(`Not enough available ${chain} after its network fee and reserve. Nothing was sent.`);
}

/** Exact Horizon decimals: never round a spend through a floating-point balance. */
export function stellarUnits(text: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,7}))?$/.exec(text);
  const whole = match?.[1];
  if (!whole) throw new Error("Invalid Stellar balance");
  return BigInt(whole) * 10_000_000n + BigInt((match?.[2] ?? "").padEnd(7, "0"));
}

export function stellarReserve(baseReserve: bigint, subentries: number, sponsoring: number, sponsored: number, sellingLiabilities: bigint): bigint {
  for (const count of [subentries, sponsoring, sponsored]) if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid Stellar reserve");
  const entries = 2 + subentries + sponsoring - sponsored;
  if (baseReserve <= 0n || entries < 0 || sellingLiabilities < 0n) throw new Error("Invalid Stellar reserve");
  return BigInt(entries) * baseReserve + sellingLiabilities;
}