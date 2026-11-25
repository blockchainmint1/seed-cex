/** Native XLM / TON / SUI transfers only. One activation gate for deposits and sends. */
import type { EdChain } from "./ed25519-chains";

export type EdSendStage = "review" | "testers" | "open";
// Review first; after clearance use "testers" for funded tests, then "open" after those pass.
export function edSendStage(): EdSendStage { return "testers"; }
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

/** Public, immutable evidence of the expiry actually included in the signed bytes. */
export type EdSendMeta = { chain: "XLM"; expiresAt: number } |
  { chain: "TON"; expiresAt: number; seqno: number; publicKeyHex: string } |
  { chain: "SUI"; expiresEpoch: string } |
  { chain: "TRON"; expiresAt: number; rawDataHex: string };

export function stellarMemoProblem(data: Record<string, string> | undefined): string | null {
  return data?.['config.memo_required'] === 'MQ=='
    ? "That address requires a memo, which Seeds doesn't support. Nothing was sent." : null;
}

export function stellarFeeBid(base: number, median: string): bigint {
  if (!Number.isSafeInteger(base) || base <= 0 || !/^\d+$/.test(median)) throw new Error("Stellar fees couldn't be checked. Nothing was sent.");
  const floor = BigInt(base) * 2n;
  const fee = BigInt(median) > floor ? BigInt(median) : floor;
  if (fee > ED_FEE_CAP.XLM) throw new Error("Stellar fees exceed the safety cap. Nothing was sent.");
  return fee;
}

export function spendableAfterFee(balance: bigint, fee: bigint, reserve = 0n): bigint {
  if (balance < 0n || fee <= 0n || reserve < 0n) throw new Error("Invalid network balance or fee");
  return balance > fee + reserve ? balance - fee - reserve : 0n;
}

/** Same ten-minute interrupted-send window as the existing withdrawal claim. Never re-sign. */
export function edSigningRecovery(txid: string | null, updatedAtMs: number, nowMs: number): "failed" | "unknown" | null {
  if (!Number.isFinite(updatedAtMs) || !Number.isFinite(nowMs) || nowMs - updatedAtMs <= 600_000) return null;
  return txid ? "unknown" : "failed";
}

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