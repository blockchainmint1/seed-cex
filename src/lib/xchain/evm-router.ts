/**
 * THORChain EVM router calldata (pure). Swaps from Ethereum go through the
 * router contract, never a plain transfer to the vault:
 *   depositWithExpiry(address vault, address asset, uint256 amount, string memo, uint256 expiration)
 * Native ETH uses asset = 0x0 and sends the amount as value; ERC-20s need an
 * approve(router, amount) first and send value 0.
 */
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
export const NATIVE_ASSET = "0x0000000000000000000000000000000000000000";
export const DECIMALS_CALL = "0x313ce567";

export function selector(signature: string): string {
  return bytesToHex(keccak_256(new TextEncoder().encode(signature)).slice(0, 4));
}
const word = (n: bigint) => {
  if (n < 0n || n >= 1n << 256n) throw new Error("uint256 out of range");
  return n.toString(16).padStart(64, "0");
};
const addrWord = (a: string) => {
  if (!EVM_ADDR.test(a)) throw new Error(`Not an EVM address: ${a}`);
  return a.slice(2).toLowerCase().padStart(64, "0");
};

export function depositWithExpiryData(vault: string, asset: string, amount: bigint, memo: string, expiry: bigint): string {
  const m = new TextEncoder().encode(memo);
  if (m.length === 0) throw new Error("Memo required");
  const padded = bytesToHex(m).padEnd(Math.ceil(m.length / 32) * 64, "0");
  return (
    "0x" +
    selector("depositWithExpiry(address,address,uint256,string,uint256)") +
    addrWord(vault) + addrWord(asset) + word(amount) + word(160n) + word(expiry) +
    word(BigInt(m.length)) + padded
  );
}

export function approveData(spender: string, amount: bigint): string {
  return "0x" + selector("approve(address,uint256)") + addrWord(spender) + word(amount);
}

export function allowanceData(owner: string, spender: string): string {
  return "0x" + selector("allowance(address,address)") + addrWord(owner) + addrWord(spender);
}

/** "ETH.USDC-0XA0B8…" → "0xa0b8…" (lowercase), or null for a native coin. */
export function tokenContract(asset: string): string | null {
  const m = /-(0X[0-9A-F]{40})$/i.exec(asset);
  return m ? `0x${m[1].slice(2).toLowerCase()}` : null;
}

/** THORChain amounts are 1e8 units; convert to the token's own decimals, rounding down. */
export function toTokenUnits(amount1e8: bigint, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Bad token decimals");
  return decimals >= 8 ? amount1e8 * 10n ** BigInt(decimals - 8) : amount1e8 / 10n ** BigInt(8 - decimals);
}

/** Round a 1e8 amount down so it is exactly representable in the token's decimals. */
export function roundTo1e8Units(amount1e8: bigint, decimals: number): bigint {
  if (decimals >= 8) return amount1e8;
  const step = 10n ** BigInt(8 - decimals);
  return (amount1e8 / step) * step;
}
