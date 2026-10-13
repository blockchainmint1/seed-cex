import { HDKey } from "@scure/bip32";
import { base58check, bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";

/** The HME pocket receive address is child 0/0 of the submitted account xpub. */
export function pocketAddress(chain: string, xpub: string): string {
  const versions = chain === "LTC" && xpub.startsWith("Ltub")
    ? { public: 0x019da462, private: 0x019d9cfe }
    : undefined;
  const node = HDKey.fromExtendedKey(xpub, versions).deriveChild(0).deriveChild(0);
  const pub = node.publicKey;
  if (!pub) throw new Error("Missing pocket public key");
  if (chain === "EVM") {
    const raw = bytesToHex(keccak_256(secp256k1.Point.fromBytes(pub).toBytes(false).slice(1))).slice(-40);
    const hash = bytesToHex(keccak_256(new TextEncoder().encode(raw)));
    return "0x" + Array.from(raw, (c, i) => parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c).join("");
  }
  const hash = ripemd160(sha256(pub));
  if (chain === "BTC") return bech32.encode("bc", [0, ...bech32.toWords(hash)]);
  const version = { TXC: 66, ISK: 45, LTC: 48 }[chain];
  if (version === undefined) throw new Error("Unsupported pocket chain");
  return base58check(sha256).encode(Uint8Array.from([version, ...hash]));
}