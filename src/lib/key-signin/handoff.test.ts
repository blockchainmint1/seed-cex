import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58, hex } from "@scure/base";
import { checkXprvMatches, newRecipientKeypair, openSealed, payloadSha256, type LinkChain } from "../hme-link.server";
import { evmAddressFromPubkey } from "../wallet/vault";
import { buildHandoff, coinIdentityKey, signTxcMessage, walletPocketWords, type KeyManifest } from "./seeds-key-reference";
import { verifyKeySignature } from "./signin.server";
import { walletPocketMessage } from "./rules";

const WORDS = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function manifest(pub: string): KeyManifest {
  return { type: "seeds-key-signin", version: 1, domain: "seeds.honest.money", challenge_id: "a".repeat(32), challenge: "c".repeat(48), recipient_pubkey: pub, submit_url: "https://seeds.honest.money/api/public/key-signin/submit", expires_at: new Date(Date.now() + 60_000).toISOString(), pocket: 1106 };
}

function personalSign(priv: Uint8Array, message: string): string {
  const m = new TextEncoder().encode(message);
  const pre = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`);
  const s = secp256k1.sign(keccak_256(new Uint8Array([...pre, ...m])), priv, { prehash: false, format: "recovered" });
  return `0x${hex.encode(new Uint8Array([...s.slice(1), 27 + s[0]!]))}`;
}

describe("coin hand-off (test vectors for the Seeds Key page)", () => {
  test("the coin's identity is the TXC address HME Wallet signs with", () => {
    expect(signTxcMessage(coinIdentityKey(WORDS), "x").address).toBe("TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd");
  });

  test("Seeds accepts the signature and opens the sealed pocket keys", async () => {
    const kp = newRecipientKeypair();
    const key = coinIdentityKey(WORDS);
    const identity = signTxcMessage(key, "x").address;
    const h = await buildHandoff({ manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity });
    expect(h.addresses.TXC).toBe("Tg7WMV1iBgw6w44Z8ZzftiSKPu1yEStXvy");
    expect(h.addresses.EVM).toBe("0x7231a79714ffD1b9f51216f79762fA38A40b4544");
    expect(h.message).toContain(`Payload-SHA256: ${payloadSha256(h.body.payload)}`);
    const { signature } = signTxcMessage(key, h.message);
    expect(verifyKeySignature("coin", identity, h.message, signature)).toBe(true);
    expect(verifyKeySignature("coin", identity, `${h.message} `, signature)).toBe(false);
    const xprvs = JSON.parse(openSealed(h.body.payload, kp.priv, kp.pub)) as Record<string, string>;
    for (const [c, pub] of Object.entries(h.body.xpubs)) expect(checkXprvMatches(c as LinkChain, xprvs[c]!, pub as string)).toBe(true);
  });
});

describe("outside-wallet hand-off", () => {
  const priv = hex.decode("4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318");

  test("the same wallet always rebuilds the same pocket", () => {
    const sig = hex.decode(personalSign(priv, walletPocketMessage("key.example")).slice(2));
    expect(walletPocketWords(sig, "key.example")).toBe("recall oil illness fancy announce curtain kiwi body certain blouse drill shock diary purchase fortune arrest police neutral define trash degree tourist adapt scissors");
  });

  test("a different Seeds Key site gives a different pocket", () => {
    const sig = hex.decode(personalSign(priv, walletPocketMessage("key.example")).slice(2));
    expect(walletPocketWords(sig, "other.example")).not.toBe(walletPocketWords(sig, "key.example"));
  });

  test("Seeds checks an Ethereum wallet's sign-in signature", () => {
    const addr = evmAddressFromPubkey(secp256k1.getPublicKey(priv, false));
    expect(verifyKeySignature("evm", addr, "hello", personalSign(priv, "hello"))).toBe(true);
    expect(verifyKeySignature("evm", addr, "hello!", personalSign(priv, "hello"))).toBe(false);
  });

  test("Seeds checks a Solana wallet's sign-in signature", () => {
    const sk = ed25519.utils.randomSecretKey();
    const pub = base58.encode(ed25519.getPublicKey(sk));
    const sig = hex.encode(ed25519.sign(new TextEncoder().encode("hello"), sk));
    expect(verifyKeySignature("sol", pub, "hello", sig)).toBe(true);
    expect(verifyKeySignature("sol", pub, "bye", sig)).toBe(false);
  });
});
