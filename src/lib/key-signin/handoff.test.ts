import { describe, expect, test } from "bun:test";
import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { base58, hex } from "@scure/base";
import { checkXprvMatches, newRecipientKeypair, openSealed, payloadSha256, type LinkChain } from "../hme-link.server";
import { evmAddressFromPubkey } from "../wallet/vault";
import { buildHandoff, manifestProblem, coinIdentityKey, signTxcMessage, walletPocketWords, type KeyManifest } from "./seeds-key-reference";
import { verifyKeySignature } from "./signin.server";
import { walletPocketMessage } from "./rules";

const WORDS = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

const MURL = "https://seeds.honest.money/api/public/key-signin/manifest/abc";

function manifest(pub: string): KeyManifest {
  return { type: "seeds-key-signin", version: 1, domain: "seeds.honest.money", challenge_id: "a".repeat(32), challenge: "c".repeat(48), recipient_pubkey: pub, submit_url: "https://seeds.honest.money/api/public/key-signin/submit", expires_at: new Date(Date.now() + 60_000).toISOString(), pocket: 1106, key_host: "key.seeds.honest.money", issued_at: "2026-11-21T17:00:00.000Z" };
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
    const h = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity });
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

  const addr = evmAddressFromPubkey(secp256k1.getPublicKey(priv, false));
  const pocketSig = () => personalSign(priv, walletPocketMessage("key.example", "evm", addr));

  test("the same wallet always rebuilds the same pocket (test vector for the Seeds Key page)", () => {
    expect(pocketSig()).toBe("0xfb124074c5b142a7fd343341e1b7b0daab2d21761635b82c52e43dbaf9d6d88709a5754319c0595ec99cf2d791c3ee3e02786934a05147f1c79866f3cde4a4511c");
    expect(pocketSig()).toBe(pocketSig());
    expect(walletPocketWords(hex.decode(pocketSig().slice(2)), "key.example")).toBe("educate unveil nation talent turtle mother satisfy diesel nerve huge riot disorder video belt romance caught morning escape canoe top crystal various real same");
  });

  test("a different Seeds Key site gives a different pocket", () => {
    const sig = hex.decode(pocketSig().slice(2));
    expect(walletPocketWords(sig, "other.example")).not.toBe(walletPocketWords(sig, "key.example"));
  });

  test("a wallet's sign-in hand-off is the Sign-In with Ethereum layout and verifies", async () => {
    const kp = newRecipientKeypair();
    const h = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "evm", identity: addr });
    expect(h.message.startsWith("key.seeds.honest.money wants you to sign in with your Ethereum account:\n")).toBe(true);
    expect(h.message).toContain(`- urn:seeds:payload-sha256:${payloadSha256(h.body.payload)}`);
    expect(verifyKeySignature("evm", addr, h.message, personalSign(priv, h.message))).toBe(true);
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

describe("extra password (BIP39 passphrase) for HME Vault seeds", () => {
  const ADDR = "TZZCuca5ntPVCJL5ryTjh465Jvw5vHxsVd";

  test("no password = unchanged coin identity", () => {
    expect(signTxcMessage(coinIdentityKey(WORDS, ""), "x").address).toBe(ADDR);
  });

  test("identity uses the official BIP39 seed for the password (TREZOR test vector)", async () => {
    const { HDKey } = await import("@scure/bip32");
    // BIP39 vector: "abandon … about" + passphrase "TREZOR".
    const seed = hex.decode("c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04");
    const want = HDKey.fromMasterSeed(seed).derive("m/44'/696969'/0'/0/0").privateKey!;
    expect(hex.encode(coinIdentityKey(WORDS, "TREZOR"))).toBe(hex.encode(want));
    expect(signTxcMessage(coinIdentityKey(WORDS, "TREZOR"), "x").address).not.toBe(ADDR);
  });

  test("Seeds accepts a password seed's hand-off and every pocket key matches", async () => {
    const kp = newRecipientKeypair();
    const key = coinIdentityKey(WORDS, "TREZOR");
    const identity = signTxcMessage(key, "x").address;
    const h = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity, passphrase: "TREZOR" });
    const plain = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity });
    expect(h.addresses.TXC).not.toBe(plain.addresses.TXC);
    expect(h.addresses.ADA).not.toBe(plain.addresses.ADA);
    const { signature } = signTxcMessage(key, h.message);
    expect(verifyKeySignature("coin", identity, h.message, signature)).toBe(true);
    const xprvs = JSON.parse(openSealed(h.body.payload, kp.priv, kp.pub)) as Record<string, string>;
    expect(Object.keys(h.body.xpubs).length).toBe(19);
    for (const [c, pub] of Object.entries(h.body.xpubs)) expect(checkXprvMatches(c as LinkChain, xprvs[c]!, pub as string)).toBe(true);
  });

  test("the same password typed two Unicode ways gives the same wallet, Cardano included", async () => {
    const composed = "caf\u00e9 ñ";
    const decomposed = "cafe\u0301 n\u0303";
    expect(hex.encode(coinIdentityKey(WORDS, composed))).toBe(hex.encode(coinIdentityKey(WORDS, decomposed)));
    const kp = newRecipientKeypair();
    const a = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity: "x", passphrase: composed });
    const b = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity: "x", passphrase: decomposed });
    expect(a.addresses).toEqual(b.addresses);
    expect(a.body.xpubs).toEqual(b.body.xpubs);
  });

  test("a password is never part of what Seeds receives", async () => {
    const kp = newRecipientKeypair();
    const h = await buildHandoff({ manifestUrl: MURL, manifest: manifest(kp.pub), words: WORDS, kind: "coin", identity: "x", passphrase: "correct horse battery" });
    expect(JSON.stringify({ m: h.message, b: h.body })).not.toContain("correct horse");
  });
});

describe("look-alike site check (auditor HK2)", () => {
  const m = manifest("x");
  test("a real Seeds request passes", () => { expect(manifestProblem(MURL, m)).toBeNull(); });
  test("a request from another site is refused", () => {
    expect(manifestProblem("https://seeds-honest.money/api/public/key-signin/manifest/abc", m)).toBe("origin_not_allowed");
  });
  test("a Seeds preview address is refused: only the live site is trusted", () => {
    expect(manifestProblem("https://id-preview--0ce4bcf5-5883-4de0-96d3-b161585d1bf4.lovable.app/api/public/key-signin/manifest/abc", m)).toBe("origin_not_allowed");
    expect(manifestProblem("https://seeds-cex.lovable.app/api/public/key-signin/manifest/abc", m)).toBe("origin_not_allowed");
  });
  test("keys can't be sent to a different site", () => {
    expect(manifestProblem(MURL, { ...m, submit_url: "https://evil.example/submit" })).toBe("submit_origin");
  });
  test("pocket must be 1106", () => { expect(manifestProblem(MURL, { ...m, pocket: 1107 })).toBe("bad_pocket"); });
  test("expired request is refused", () => {
    expect(manifestProblem(MURL, { ...m, expires_at: "2020-01-01T00:00:00.000Z" })).toBe("expired");
  });
  test("wrong match code is refused", () => { expect(manifestProblem(MURL, { ...m, pairing_code: "abc" })).toBe("pairing_mismatch"); });
  test("buildHandoff refuses a look-alike site", async () => {
    await expect(buildHandoff({ manifestUrl: "https://evil.example/m", manifest: m, words: WORDS, kind: "coin", identity: "x" })).rejects.toThrow("origin_not_allowed");
  });
});
