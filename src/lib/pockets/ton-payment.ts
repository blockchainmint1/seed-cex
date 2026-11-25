/** Browser-safe TON invoice rules; no wallet SDK or Buffer dependency. */
import { base64urlnopad, hex } from "@scure/base";

export const USDT_TON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
export const USDT_TON_DECIMALS = 6;

function crc16(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** Check mainnet flags, workchain and checksum before returning the account hash. */
export function tonMainnetAccount(address: string): string {
  if (!/^[A-Za-z0-9+/_-]{48}$/.test(address)) throw new Error("Invalid TON friendly address");
  const raw = base64urlnopad.decode(address.replace(/\+/g, "-").replace(/\//g, "_"));
  if (raw.length !== 36 || (raw[0] !== 0x11 && raw[0] !== 0x51) || raw[1] !== 0) throw new Error("Use a TON mainnet workchain 0 address");
  const crc = crc16(raw.slice(0, 34));
  if (raw[34] !== crc >> 8 || raw[35] !== (crc & 0xff)) throw new Error("Invalid TON address checksum");
  const hash = raw.slice(2, 34);
  if (hash.every((b) => b === 0)) throw new Error("TON burn addresses are not supported");
  return hex.encode(hash);
}

export function isUsdtTonMaster(address: string): boolean {
  try { return tonMainnetAccount(address) === tonMainnetAccount(USDT_TON_MASTER); } catch { return false; }
}

/** A plain UTF-8 payment comment, never a caller-supplied binary Cell. */
export function checkedUsdtComment(raw: string | undefined | null): string {
  const comment = raw ?? "";
  if (new TextEncoder().encode(comment).length > 120 || /[\u0000-\u001f\u007f]/.test(comment)) {
    throw new Error("The payment note must be plain text, at most 120 UTF-8 bytes, without control characters.");
  }
  return comment;
}