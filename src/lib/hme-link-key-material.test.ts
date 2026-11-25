import { describe, expect, test } from "bun:test";
import { HDKey } from "@scure/bip32";
import { createBase58check, hex } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { canonicalLinkedPublicKey, sameLinkedPublicKey } from "./hme-link.server";
import { REFUSE_OTHER_WALLET, REFUSE_OTHER_POCKET, replaceProblem } from "./hme-link-rules";
import { accountPath, type PocketCoin } from "./pockets/coins";
import { pocketKeysMatch, pocketReceiveAddress, pocketsFromMnemonic } from "./pockets/derive";
import { parseMoneroAddress } from "./pockets/monero";

// Public deterministic test fixtures only; never a member's wallet.
const node = HDKey.fromMasterSeed(new Uint8Array(32).fill(1)).derive(accountPath("BTC", 1106));
const other = HDKey.fromMasterSeed(new Uint8Array(32).fill(2)).derive(accountPath("BTC", 1106));
const pub = node.publicExtendedKey;
const b58c = createBase58check(sha256);
function encodeVersion(version: number): string {
  const raw = b58c.decode(pub);
  new DataView(raw.buffer, raw.byteOffset, raw.byteLength).setUint32(0, version);
  return b58c.encode(raw);
}
function problem(coin: PocketCoin, a: string, b: string) {
  return replaceProblem(
    { account: 1106, paths: [accountPath(coin, 1106)], xpubs: { [coin]: a } },
    { account: 1106, chains: [coin], xpubs: { [coin]: b }, mode: "access" },
    sameLinkedPublicKey,
  );
}

describe("RL1: re-link compares account public material", () => {
  for (const [name, version] of [
    ["ypub", 0x049d7cb2], ["zpub", 0x04b24746], ["Ypub", 0x0295b43f],
    ["Zpub", 0x02aa7ed3], ["Ltub", 0x019da462], ["Mtub", 0x01b26ef6],
  ] as const) {
    test(`${name} re-encoding keeps pocket 1106 and its original receive address`, () => {
      const encoded = encodeVersion(version);
      expect(encoded).not.toBe(pub);
      expect(problem("BTC", pub, encoded)).toBeNull();
      expect(problem("BTC", encoded, pub)).toBeNull();
      const canonical = canonicalLinkedPublicKey("BTC", encoded);
      expect(canonical).toBe(pub);
      expect(pocketReceiveAddress("BTC", canonical)).toBe(pocketReceiveAddress("BTC", pub));
      expect(pocketKeysMatch("BTC", node.privateExtendedKey, canonical)).toBe(true);
    });
  }
  test("a different wallet is still refused", () => {
    expect(problem("BTC", pub, other.publicExtendedKey)).toBe(REFUSE_OTHER_WALLET);
  });
  test("the same public key with a different chain code is refused", () => {
    const raw = b58c.decode(pub);
    const first = raw[13];
    if (first === undefined) throw new Error("missing chain code fixture");
    raw[13] = first ^ 1;
    expect(problem("BTC", pub, b58c.encode(raw))).toBe(REFUSE_OTHER_WALLET);
  });
  test("another coin cannot change while the first coin is equivalent", () => {
    expect(replaceProblem(
      { account: 1106, paths: [accountPath("TXC", 1106), accountPath("BTC", 1106)], xpubs: { TXC: pub, BTC: pub } },
      { account: 1106, chains: ["TXC", "BTC"], xpubs: { TXC: encodeVersion(0x049d7cb2), BTC: other.publicExtendedKey } },
      sameLinkedPublicKey,
    )).toBe(REFUSE_OTHER_WALLET);
  });
  test("equivalent keys do not permit another pocket number", () => {
    expect(replaceProblem(
      { account: 1106, paths: [accountPath("BTC", 1106)], xpubs: { BTC: pub } },
      { account: 1107, chains: ["BTC"], xpubs: { BTC: encodeVersion(0x049d7cb2) } },
      sameLinkedPublicKey,
    )).toBe(REFUSE_OTHER_POCKET);
  });
  test("equivalent keys still cannot drop an existing coin", () => {
    expect(replaceProblem(
      { account: 1106, paths: [accountPath("TXC", 1106), accountPath("BTC", 1106)], xpubs: { TXC: pub, BTC: pub } },
      { account: 1106, chains: ["TXC"], xpubs: { TXC: encodeVersion(0x049d7cb2) } },
      sameLinkedPublicKey,
    )).toContain("BTC");
  });
  test("unparseable keys use exact equality, never a permissive fallback", () => {
    expect(problem("BTC", "old-format", "old-format")).toBeNull();
    expect(problem("BTC", "old-format", "other-format")).toBe(REFUSE_OTHER_WALLET);
    expect(problem("BTC", pub, "broken")).toBe(REFUSE_OTHER_WALLET);
  });
  test("checksum corruption and unknown versions are not accepted for storage", () => {
    const corrupt = pub.slice(0, -1) + (pub.endsWith("1") ? "2" : "1");
    expect(() => canonicalLinkedPublicKey("BTC", corrupt)).toThrow();
    expect(() => canonicalLinkedPublicKey("BTC", encodeVersion(0x12345678))).toThrow();
  });
  test("a private key cannot be substituted for a public encoding", () => {
    expect(problem("BTC", pub, node.privateExtendedKey)).toBe(REFUSE_OTHER_WALLET);
    expect(() => canonicalLinkedPublicKey("BTC", node.privateExtendedKey)).toThrow();
  });

  const bundle = pocketsFromMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
  const otherBundle = pocketsFromMnemonic("legal winner thank year wave sausage worth useful legal winner thank yellow");
  test("Cardano hex letter case preserves both public key and chain code", () => {
    const key = bundle.xpubs.ADA;
    if (!key) throw new Error("missing Cardano fixture");
    expect(problem("ADA", key, key.toUpperCase())).toBeNull();
    const different = otherBundle.xpubs.ADA;
    if (!different) throw new Error("missing other Cardano fixture");
    expect(problem("ADA", key, different)).toBe(REFUSE_OTHER_WALLET);
    const canonical = canonicalLinkedPublicKey("ADA", key.toUpperCase());
    expect(pocketReceiveAddress("ADA", canonical)).toBe(bundle.addresses.ADA);
    const raw = hex.decode(key);
    const first = raw[32];
    if (first === undefined) throw new Error("missing Cardano chain code");
    raw[32] = first ^ 1;
    expect(problem("ADA", key, hex.encode(raw))).toBe(REFUSE_OTHER_WALLET);
  });
  test("Monero address and its two public keys identify the same pocket", () => {
    const address = bundle.xpubs.XMR;
    if (!address) throw new Error("missing Monero fixture");
    const keys = parseMoneroAddress(address);
    const encoded = hex.encode(keys.spendPub) + hex.encode(keys.viewPub);
    expect(problem("XMR", address, encoded.toUpperCase())).toBeNull();
    const different = otherBundle.xpubs.XMR;
    if (!different) throw new Error("missing other Monero fixture");
    expect(problem("XMR", address, different)).toBe(REFUSE_OTHER_WALLET);
    expect(canonicalLinkedPublicKey("XMR", encoded)).toBe(address);
    expect(pocketReceiveAddress("XMR", encoded)).toBe(address);
  });
  for (const coin of ["SOL", "XLM", "TON", "SUI"] as const) {
    test(`${coin} compares valid public material without loosening its pinned format`, () => {
      const key = bundle.xpubs[coin];
      if (!key) throw new Error(`missing ${coin} fixture`);
      expect(problem(coin, key, key)).toBeNull();
      const different = otherBundle.xpubs[coin];
      if (!different) throw new Error(`missing other ${coin} fixture`);
      expect(problem(coin, key, different)).toBe(REFUSE_OTHER_WALLET);
      expect(problem(coin, key, "different-key")).toBe(REFUSE_OTHER_WALLET);
      expect(pocketReceiveAddress(coin, canonicalLinkedPublicKey(coin, key))).toBe(bundle.addresses[coin]);
    });
  }
});