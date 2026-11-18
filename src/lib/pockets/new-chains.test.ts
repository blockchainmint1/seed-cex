/**
 * DASH, ATOM, RUNE, ADA and XMR pocket keys (Nov 18 2026).
 * Pinned values come from outside references, not from this code:
 * - Monero: Trezor firmware tests/device_tests/monero/test_getaddress.py (MNEMONIC12).
 * - Cardano: CIP-19 test vectors (payment part) + an independent library's base address.
 * - DASH / ATOM / RUNE: well-known "abandon … about" account-0 addresses.
 * - The HME_* public keys were produced by HME Wallet's own delegate-keys.ts.
 */
import { describe, expect, test } from "bun:test";
import { HDKey } from "@scure/bip32";
import { mnemonicToEntropy, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { hex } from "@scure/base";
import { accountPath, parseAccountPath, receivePath } from "./coins";
import { addressFor } from "./encode";
import { pocketKeysMatch, pocketReceiveAddress, pocketsFromMnemonic, pocketsFromSeed, receivePrivateKey } from "./derive";
import { slip10Ed25519 } from "./slip10";
import { moneroAddress, moneroKeysFromSeedKey, moneroKeysMatch, scReduce } from "./monero";
import { cardanoAccountXprv, cardanoBaseAddress, xprvToXpub } from "./cardano";
import { recoveryLines } from "./hme-support";
import { OPTIONAL_CHAINS, optionalRequest, parseExtKey } from "../hme-link.server";

const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TREZOR12 = "alcohol woman abuse must during monitor noble actual mixed trade anger aisle";
const bundle = pocketsFromMnemonic(ABANDON, { account: 1106 });

const HME_ADA_PUB = "44c508747d1f92f49b06019d1f92fbaff0f1a1b08eb8815d77e50fb790f09c0a2e995b349397df051d6674f12c7732907d995ac8baf74ac0ad837aa26ec1a598";
const HME_DASH_XPUB = "xpub6CYEjsU6zPMtSzi4qWgdBWmtGXhKt3zCpXYUntAWUhqKridudrsJCKWHqzsfgFmeUcW8WrA794f2Qp5rHJQpUNdmULbipvB4h6G9ZYUBtX8";
const HME_ATOM_XPUB = "xpub6DGzViq8bmhBxaVfiupQe5DB1Yc9rr5NmjzqqtK4PoAPZQvqCo4XjUaXnrnWzLvEMxdaEst16D9VmA2fyaiMqmj7HFaPrJKuB5HdVTRvXdQ";
const HME_RUNE_XPUB = "xpub6CNbXkRDJeMg8BAp4HD8ZUd6RE3jpBbwMtovvKEQqbDvNzUutoECUP2Q1favP9peqwYn9z7uDgAzmdkexgqfpqNnHPbr5jDArd4KCNYMZCY";

describe("Monero uses Trezor's method", () => {
  test("matches Trezor's own test addresses for accounts 0, 1 and 2", () => {
    const seed = mnemonicToSeedSync(TREZOR12);
    const want = [
      "4Ahp23WfMrMFK3wYL2hLWQFGt87ZTeRkufS6JoQZu6MEFDokAQeGWmu9MA3GFq1yVLSJQbKJqVAn9F9DLYGpRzRAEXqAXKM",
      "44iAazhoAkv5a5RqLNVyh82a1n3ceNggmN4Ho7bUBJ14WkEVR8uFTe9f7v5rNnJ2kEbVXxfXiRzsD5Jtc6NvBi4D6WNHPie",
      "47ejhmbZ4wHUhXaqA4b7PN667oPMkokf4ZkNdWrMSPy9TNaLVr7vLqVUQHh2MnmaAEiyrvLsX8xUf99q3j1iAeMV8YvSFcH",
    ];
    want.forEach((addr, a) => {
      const k = moneroKeysFromSeedKey(slip10Ed25519(seed, `m/44'/128'/${a}'`).privateKey);
      expect(moneroAddress(k.spendPub, k.viewPub)).toBe(addr);
    });
  });
  test("pocket path is m/44'/128'/N' and the address is the account itself", () => {
    expect(accountPath("XMR", 1106)).toBe("m/44'/128'/1106'");
    expect(receivePath("XMR", 1106)).toBe("m/44'/128'/1106'");
    expect(parseAccountPath("m/44'/128'/1106'")).toEqual({ coin: "XMR", account: 1106 });
    expect(bundle.addresses.XMR).toBe("4A4meFan68GQTKM2GJemCwBkfbVP2UsH2ZLPxWKquxhF93ruBpNL3PjSQzkKWFX5ELS8P4MKc4DVqb5sDFuswXJFCRuGsea");
  });
  test("the raw SLIP-0010 key and the reduced spend key are the same wallet", () => {
    const raw = bundle.xprvs.XMR!;
    const spend = hex.encode(scReduce(hex.decode(raw)));
    expect(moneroKeysMatch(raw, bundle.xpubs.XMR!)).toBe(true);
    expect(moneroKeysMatch(spend, bundle.xpubs.XMR!)).toBe(true);
    expect(hex.encode(receivePrivateKey("XMR", raw))).toBe(spend);
  });
  test("a key from another pocket, or Ledger-style secp256k1 bytes, is refused", () => {
    const other = pocketsFromMnemonic(ABANDON, { account: 1107, coins: ["XMR"] });
    expect(pocketKeysMatch("XMR", other.xprvs.XMR!, bundle.xpubs.XMR!)).toBe(false);
    const ledgerish = HDKey.fromMasterSeed(mnemonicToSeedSync(ABANDON)).derive("m/44'/128'/1106'/0/0").privateKey!;
    expect(pocketKeysMatch("XMR", hex.encode(ledgerish), bundle.xpubs.XMR!)).toBe(false);
    expect(() => parseExtKey("XMR", "4AbadAddress")).toThrow();
  });
});

describe("Cardano uses CIP-1852 Icarus", () => {
  test("matches the CIP-19 payment key and an independent base address", () => {
    const e = mnemonicToEntropy("test walk nut penalty hip pave soap entry language right filter choice", wordlist);
    const addr = cardanoBaseAddress(xprvToXpub(cardanoAccountXprv(e, 0)));
    expect(addr.startsWith("addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3")).toBe(true); // CIP-19 payment part
    expect(addr).toBe("addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3jcu5d8ps7zex2k2xt3uqxgjqnnj83ws8lhrn648jjxtwqfjkjv7");
  });
  test("Seeds derives exactly the public key HME Wallet sends", () => {
    expect(accountPath("ADA", 1106)).toBe("m/1852'/1815'/1106'");
    expect(bundle.xpubs.ADA).toBe(HME_ADA_PUB);
    expect(pocketKeysMatch("ADA", bundle.xprvs.ADA!, HME_ADA_PUB)).toBe(true);
    expect(pocketReceiveAddress("ADA", HME_ADA_PUB)).toBe(bundle.addresses.ADA!);
    expect(bundle.addresses.ADA!.startsWith("addr1q")).toBe(true);
  });
  test("a wrong private half is refused", () => {
    const other = pocketsFromMnemonic(ABANDON, { account: 1107, coins: ["ADA"] });
    expect(pocketKeysMatch("ADA", other.xprvs.ADA!, HME_ADA_PUB)).toBe(false);
    expect(pocketKeysMatch("ADA", "00".repeat(96), HME_ADA_PUB)).toBe(false);
  });
  test("from a bare seed (no words) Cardano is skipped, never derived the wrong way", () => {
    const b = pocketsFromSeed(mnemonicToSeedSync(ABANDON), 1106, ["ADA", "DASH"]);
    expect(b.xpubs.ADA).toBeUndefined();
    expect(b.paths).toEqual(["m/44'/5'/1106'"]);
  });
});

describe("Dash, Cosmos and THORChain", () => {
  test("address encoders match the well-known account-0 addresses", () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(ABANDON));
    expect(addressFor("DASH", root.derive("m/44'/5'/0'/0/0").publicKey!)).toBe("XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5");
    expect(addressFor("ATOM", root.derive("m/44'/118'/0'/0/0").publicKey!)).toBe("cosmos19rl4cm2hmr8afy4kldpxz3fka4jguq0auqdal4");
    expect(addressFor("RUNE", root.derive("m/44'/931'/0'/0/0").publicKey!)).toBe("thor1gm00vwsfcp48enm4uv9e5dhm37jtd0ye27wrx0");
  });
  test("Seeds derives exactly the xpubs HME Wallet sends", () => {
    expect(bundle.xpubs.DASH).toBe(HME_DASH_XPUB);
    expect(bundle.xpubs.ATOM).toBe(HME_ATOM_XPUB);
    expect(bundle.xpubs.RUNE).toBe(HME_RUNE_XPUB);
    for (const c of ["DASH", "ATOM", "RUNE"] as const) expect(pocketKeysMatch(c, bundle.xprvs[c]!, bundle.xpubs[c]!)).toBe(true);
  });
});

describe("link manifest", () => {
  test("lists all 11 optional coins with their exact key method", () => {
    expect([...OPTIONAL_CHAINS]).toEqual(["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL", "DASH", "ATOM", "RUNE", "ADA", "XMR"]);
    const byChain = Object.fromEntries(optionalRequest().map((r) => [r.chain, r]));
    expect(byChain.ADA).toEqual({ chain: "ADA", path: "m/1852'/1815'/1106'", curve: "ed25519-bip32", format: "cip1852-icarus" });
    expect(byChain.XMR).toEqual({ chain: "XMR", path: "m/44'/128'/1106'", curve: "ed25519", format: "slip10-ed25519-monero-trezor" });
    expect(byChain.DASH.format).toBe("bip32");
  });
});

describe("revoke recovery notes", () => {
  test("Monero says Trezor's method, not Ledger's; ordinary coins keep their path", () => {
    const lines = recoveryLines(1106, { XMR: bundle.addresses.XMR, DASH: bundle.addresses.DASH });
    expect(lines.find((l) => l.startsWith("XMR"))).toContain("Trezor");
    expect(lines.find((l) => l.startsWith("XMR"))).toContain("not Ledger");
    expect(lines.find((l) => l.startsWith("DASH"))).toContain("recovery path m/44'/5'/1106'/0/0");
  });
});
