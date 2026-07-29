/**
 * Sign-in with an Ethereum wallet (EIP-191 personal_sign, EIP-4361 style text).
 *
 * The browser never sends a key — it sends a signature over a server-issued,
 * single-use nonce. We recover the address from the signature and mint a
 * Supabase session for the account bound to that address.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { evmAddressFromPubkey } from "@/lib/wallet/vault";

export function buildChallengeText(address: string, nonce: string, origin: string): string {
  return [
    `${origin} wants you to sign in with your Ethereum account:`,
    address,
    "",
    "Signing this proves you control this wallet. It authorizes nothing, moves nothing, and costs no gas.",
    "",
    `URI: ${origin}`,
    "Version: 1",
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join("\n");
}

/** Recover the signer address from a personal_sign signature. */
export function recoverPersonalSignAddress(message: string, signature: string): string | null {
  try {
    const sig = hexToBytes(signature.toLowerCase().replace(/^0x/, ""));
    if (sig.length !== 65) return null;
    let v = sig[64];
    if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;

    const bytes = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${bytes.length}`);
    const digest = keccak_256(new Uint8Array([...prefix, ...bytes]));

    const pub = secp256k1.Signature.fromBytes(sig.slice(0, 64), "compact")
      .addRecoveryBit(v)
      .recoverPublicKey(digest)
      .toBytes(false);
    return evmAddressFromPubkey(pub);
  } catch (err) {
    console.error("[wallet-auth] recovery failed", err);
    return null;
  }
}

/** Deterministic, non-deliverable identity for a wallet-only account. */
export function walletEmail(address: string): string {
  return `${address.toLowerCase()}@wallet.seeds.local`;
}
