import { describe, expect, test } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { addressFromPrivateKey, addressFromPublicKey, signEip1559, signEip1559External } from "./tx.server";
import { recoverableFromDer } from "../lock/kms.server";

describe("Seeds gas wallet signing (KMS-style)", () => {
  test("a DER signature + recovered bit gives the exact same Ethereum transaction as a local key", async () => {
    const priv = secp256k1.utils.randomSecretKey();
    const pub = secp256k1.getPublicKey(priv, true);
    const params = { chainId: 1, nonce: 7, maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n, gasLimit: 21_000n, to: "0x1111111111111111111111111111111111111111", value: 123_456_789n, data: "0x" };
    const local = signEip1559({ ...params, privateKeyHex: bytesToHex(priv) });
    const ext = await signEip1559External(params, {
      address: addressFromPublicKey(pub),
      sign: async (digest) => recoverableFromDer(secp256k1.sign(digest, priv, { prehash: false, format: "der", lowS: true }), digest, pub),
    });
    expect(ext.raw).toBe(local.raw);
    expect(ext.from).toBe(addressFromPrivateKey(bytesToHex(priv)));
  });
  test("a signature from a different key is refused", () => {
    const a = secp256k1.utils.randomSecretKey();
    const b = secp256k1.getPublicKey(secp256k1.utils.randomSecretKey(), true);
    const d = new Uint8Array(32).fill(9);
    expect(() => recoverableFromDer(secp256k1.sign(d, a, { prehash: false, format: "der" }), d, b)).toThrow(/does not match/);
  });
});
