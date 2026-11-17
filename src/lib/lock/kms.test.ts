import { describe, expect, test } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { spkiToCompressed, toLowSDer } from "./kms.server";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const priv = hexToBytes("11".repeat(32));
const pub = secp256k1.getPublicKey(priv, true);
const digest = hexToBytes("ab".repeat(32));

describe("KMS signature handling", () => {
  test("KMS public key (DER SPKI) becomes the 33-byte compressed key", () => {
    const spki = Uint8Array.of(...hexToBytes("3056301006072a8648ce3d020106052b8104000a034200"), ...secp256k1.getPublicKey(priv, false));
    expect(spkiToCompressed(spki)).toEqual(pub);
  });
  test("a non-secp256k1 key is refused", () => {
    expect(() => spkiToCompressed(new Uint8Array(91))).toThrow();
  });
  test("a high-S signature from KMS is flipped to low-S and still verifies", () => {
    const low = secp256k1.Signature.fromBytes(secp256k1.sign(digest, priv, { prehash: false, format: "der", lowS: true }), "der");
    const high = new secp256k1.Signature(low.r, N - low.s).toBytes("der");
    const fixed = toLowSDer(high);
    expect(secp256k1.Signature.fromBytes(fixed, "der").hasHighS()).toBe(false);
    expect(secp256k1.verify(fixed, digest, pub, { prehash: false, format: "der", lowS: true })).toBe(true);
  });
});
