/** Pinned TRC-20 USDt, locally built calls, fees and exact finalized receipt checks. */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { concat, tronAddress, tronDecodeAddress } from "./encode";

export const USDT_TRON_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const USDT_TRON_ASSET = "TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T";
export const USDT_TRON_DECIMALS = 6;
/** Conservative operator safety ceiling, not a fee estimate or a Seeds fee. */
export const TRON_USDT_MAX_FEE_SUN = 100_000_000n;
export const TRON_USDT_MAX_BYTES = 1500n;
export type TronUsdtStage = "review" | "testers" | "open";
export function tronUsdtStage(): TronUsdtStage { return "testers"; }
export function tronUsdtBlocker(tester = false, stage = tronUsdtStage()): string | null {
  if (stage === "open" || (stage === "testers" && tester)) return null;
  return stage === "review"
    ? "USDT on TRON deposits, withdrawals and swaps are awaiting security review and a small live send test."
    : "USDT on TRON is open to beta testers first while live send tests are completed.";
}

export function tronHexAddress(address: string): string { return bytesToHex(tronDecodeAddress(address)); }
export function tronAbiAddress(address: string): string { return tronHexAddress(address).slice(2).padStart(64, "0"); }
export function tronUsdtDestinationProblem(to: string, own?: string): string | null {
  try {
    const h = tronHexAddress(to);
    if (h === tronHexAddress(USDT_TRON_CONTRACT)) return "That's the USDT contract, not a receiving wallet. Nothing was sent.";
    if (/^410{40}$/.test(h)) return "That's the empty (burn) address. Nothing was sent.";
    if (own && h === tronHexAddress(own)) return "That's your trading pocket's own address.";
    return null;
  } catch { return "That isn't a valid TRON mainnet address (T…, with its checksum intact)."; }
}
export function tronUsdtParameters(to: string, units: bigint): string {
  const why = tronUsdtDestinationProblem(to);
  if (why) throw new Error(why);
  if (units <= 0n || units >= 1n << 256n) throw new Error("Invalid USDT amount. Nothing was sent.");
  return tronAbiAddress(to) + units.toString(16).padStart(64, "0");
}
export function tronUsdtData(to: string, units: bigint): string { return "a9059cbb" + tronUsdtParameters(to, units); }

export type TronSimulation = { result?: { result?: boolean }; constant_result?: string[]; energy_used?: number; transaction?: { ret?: Array<{ contractRet?: string }> } };
/** A successful RPC envelope is insufficient: execution and any returned bool must agree. */
export function tronUsdtSimulationEnergy(simulation: TronSimulation): bigint {
  const energy = simulation.energy_used;
  if (simulation.result?.result !== true || simulation.transaction?.ret?.some((r) => r.contractRet && r.contractRet !== "SUCCESS") || !Number.isSafeInteger(energy) || !energy || energy <= 0) throw new Error("TRON couldn't simulate this USDT send. Nothing was sent.");
  const result = simulation.constant_result?.[0];
  // Tether's non-standard transfer ABI can return no value; an explicit false never passes.
  if (result && (!/^[0-9a-f]{64}$/i.test(result) || BigInt(`0x${result}`) !== 1n)) throw new Error("USDT refused the transfer simulation. Nothing was sent.");
  return BigInt(energy);
}

export function tronUsdtFeeBudget(energy: bigint, energyPrice: bigint, bytePrice: bigint, memoFee = 0n) {
  if (energy <= 0n || energyPrice <= 0n || bytePrice <= 0n || memoFee < 0n) throw new Error("TRON's fees couldn't be checked. Nothing was sent.");
  // Budget the full burn cost, even if staked/delegated resources would make it cheaper.
  const feeLimit = (energy * energyPrice * 12n + 9n) / 10n;
  const totalSun = feeLimit + TRON_USDT_MAX_BYTES * bytePrice + memoFee;
  if (totalSun > TRON_USDT_MAX_FEE_SUN) throw new Error("TRON's network fee for this send is above Seeds' 100 TRX safety limit right now (sends to an address that has never held USDT cost more). Nothing was sent — try again later or send to an address that already holds USDT.");
  return { feeLimit, totalSun };
}

function varint(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("Negative protobuf integer");
  const out: number[] = [];
  do { let byte = Number(value & 127n); value >>= 7n; if (value) byte |= 128; out.push(byte); } while (value);
  return Uint8Array.from(out);
}
const bytesField = (field: number, bytes: Uint8Array) => concat(varint(BigInt(field * 8 + 2)), varint(BigInt(bytes.length)), bytes);
const intField = (field: number, value: bigint) => concat(varint(BigInt(field * 8)), varint(value));
export type TronUsdtParams = { from: string; to: string; units: bigint; refBlockNum: number; refBlockId: string; timestamp: number; feeLimit: bigint; memo?: string };

/** TriggerSmartContract.transfer: no approvals, allowances, native value or arbitrary payload. */
export function encodeTronUsdt(p: TronUsdtParams): Uint8Array {
  const why = tronUsdtDestinationProblem(p.to, p.from);
  if (why) throw new Error(why);
  const id = hexToBytes(p.refBlockId);
  if (id.length !== 32 || !Number.isSafeInteger(p.refBlockNum) || p.refBlockNum < 0 || !Number.isSafeInteger(p.timestamp) || p.timestamp <= 0) throw new Error("Invalid TRON block reference");
  if (p.feeLimit <= 0n || p.feeLimit > TRON_USDT_MAX_FEE_SUN) throw new Error("Invalid TRON fee limit");
  const memo = new TextEncoder().encode(p.memo ?? "");
  if (memo.length > 250 || /[^\x20-\x7e]/.test(p.memo ?? "")) throw new Error("Unsupported TRON swap memo");
  const num = new Uint8Array(8);
  new DataView(num.buffer).setBigUint64(0, BigInt(p.refBlockNum), false);
  const trigger = concat(bytesField(1, tronDecodeAddress(p.from)), bytesField(2, tronDecodeAddress(USDT_TRON_CONTRACT)), bytesField(4, hexToBytes(tronUsdtData(p.to, p.units))));
  const any = concat(bytesField(1, new TextEncoder().encode("type.googleapis.com/protocol.TriggerSmartContract")), bytesField(2, trigger));
  return concat(bytesField(1, num.slice(6)), bytesField(4, id.slice(8, 16)), intField(8, BigInt(p.timestamp + 180_000)),
    ...(memo.length ? [bytesField(10, memo)] : []), bytesField(11, concat(intField(1, 31n), bytesField(2, any))),
    intField(14, BigInt(p.timestamp)), intField(18, p.feeLimit));
}
export function signTronUsdt(p: TronUsdtParams, privateKey: Uint8Array) {
  if (tronAddress(secp256k1.getPublicKey(privateKey, true)) !== p.from) throw new Error("The stored key doesn't match your TRON pocket. Nothing was sent.");
  const raw = encodeTronUsdt(p);
  const hash = sha256(raw);
  const recovered = secp256k1.sign(hash, privateKey, { format: "recovered", prehash: false });
  const v = recovered[0];
  if (v === undefined || v > 1) throw new Error("Unsupported TRON signature recovery id");
  // Match TronWeb ECKeySign: r || s || (recovery + 27).
  const signature = concat(recovered.slice(1), Uint8Array.of(v + 27));
  const hex = bytesToHex(concat(bytesField(1, raw), bytesField(2, signature)));
  if (BigInt(hex.length / 2) > TRON_USDT_MAX_BYTES) throw new Error("TRON transfer exceeded its bandwidth budget");
  return { hex, txid: bytesToHex(hash), rawDataHex: bytesToHex(raw) };
}

export type TronReceipt = { id?: string; blockNumber?: number; result?: string; receipt?: { result?: string }; log?: Array<{ address?: string; topics?: string[]; data?: string }> };
const TRANSFER_TOPIC = bytesToHex(keccak_256(new TextEncoder().encode("Transfer(address,address,uint256)")));
/** Only a finalized SUCCESS receipt with exactly this token/from/to/amount proves delivery. */
export function tronUsdtReceipt(receipt: TronReceipt, txid: string, from: string, to: string, units: bigint): boolean | null {
  if (receipt.id?.toLowerCase() !== txid.toLowerCase() || !Number.isSafeInteger(receipt.blockNumber) || (receipt.blockNumber ?? 0) <= 0) return null;
  if (receipt.result === "FAILED") return false;
  if (!receipt.receipt?.result) return null;
  if (receipt.receipt.result !== "SUCCESS") return false;
  const matching = (receipt.log ?? []).filter((l) => l.address?.toLowerCase().replace(/^41/, "") === tronHexAddress(USDT_TRON_CONTRACT).slice(2)
    && l.topics?.length === 3 && l.topics[0]?.toLowerCase() === TRANSFER_TOPIC
    && l.topics[1]?.toLowerCase() === tronAbiAddress(from) && l.topics[2]?.toLowerCase() === tronAbiAddress(to)
    && l.data?.toLowerCase() === units.toString(16).padStart(64, "0"));
  return matching.length === 1 ? true : null;
}