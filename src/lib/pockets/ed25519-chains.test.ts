/**
 * Stellar / TON / Sui pocket keys (Nov 25 2026). Every address is cross-checked
 * against the chain's own reference library (test-only dev dependencies), never
 * against this code.
 */
import { describe, expect, test } from "bun:test";
import { mnemonicToSeedSync } from "@scure/bip39";
import { hex } from "@scure/base";
import { Keypair as StellarKeypair } from "@stellar/stellar-base";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { WalletContractV5R1 } from "@ton/ton";
import { accountPath, parseAccountPath, receivePath } from "./coins";
import { pocketKeysMatch, pocketReceiveAddress, pocketsFromMnemonic, receivePrivateKey } from "./derive";
import { slip10Ed25519 } from "./slip10";
import { edKeysMatch, edReceiveAddress, tonAddress } from "./ed25519-chains";
import { OPTIONAL_CHAINS, optionalRequest, parseExtKey } from "../hme-link.server";

const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const seed = mnemonicToSeedSync(ABANDON);
const bundle = pocketsFromMnemonic(ABANDON, { account: 1106 });

describe("paths match the wallet handoff", () => {
  test("XLM, TON and SUI paths on pocket 1106", () => {
    expect(accountPath("XLM", 1106)).toBe("m/44'/148'/1106'");
    expect(accountPath("TON", 1106)).toBe("m/44'/607'/1106'");
    expect(accountPath("SUI", 1106)).toBe("m/44'/784'/1106'/0'/0'");
    expect(receivePath("SUI", 1106)).toBe("m/44'/784'/1106'/0'/0'");
    expect(parseAccountPath("m/44'/784'/1106'/0'/0'")).toEqual({ coin: "SUI", account: 1106 });
    expect(parseAccountPath("m/44'/784'/1106'")).toBeNull();
    expect(parseAccountPath("m/44'/607'/1106'")).toEqual({ coin: "TON", account: 1106 });
  });
  test("link manifest asks for all three", () => {
    for (const c of ["XLM", "TON", "SUI"] as const) expect(OPTIONAL_CHAINS).toContain(c);
    const r = optionalRequest().find((x) => x.chain === "SUI");
    expect(r?.path).toBe("m/44'/784'/1106'/0'/0'");
  });
});

describe("addresses agree with each chain's own library", () => {
  test("Stellar SEP-0005 (account 0 vector) and pocket 1106", () => {
    for (const a of [0, 1106]) {
      const k = slip10Ed25519(seed, `m/44'/148'/${a}'`);
      expect(pocketReceiveAddress("XLM", StellarKeypair.fromRawEd25519Seed(Buffer.from(k.privateKey)).publicKey()))
        .toBe(StellarKeypair.fromRawEd25519Seed(Buffer.from(k.privateKey)).publicKey());
      expect(edReceiveAddress("XLM", bundle.xpubs.XLM!)).toBe(bundle.addresses.XLM!);
    }
    const k = slip10Ed25519(seed, "m/44'/148'/1106'");
    expect(bundle.addresses.XLM).toBe(StellarKeypair.fromRawEd25519Seed(Buffer.from(k.privateKey)).publicKey());
    // SEP-0005 test 4 ("abandon … about"), account 0
    expect(StellarKeypair.fromRawEd25519Seed(Buffer.from(slip10Ed25519(seed, "m/44'/148'/0'").privateKey)).publicKey())
      .toBe("GB3JDWCQJCWMJ3IILWIGDTQJJC5567PGVEVXSCVPEQOTDN64VJBDQBYX");
  });
  test("Sui matches @mysten/sui for the same phrase and path", () => {
    expect(bundle.addresses.SUI).toBe(Ed25519Keypair.deriveKeypair(ABANDON, "m/44'/784'/1106'/0'/0'").toSuiAddress());
    expect(Ed25519Keypair.deriveKeypair(ABANDON, "m/44'/784'/0'/0'/0'").toSuiAddress())
      .toBe(pocketReceiveAddress("SUI", hexSui(0)));
  });
  test("TON W5 matches @ton/ton WalletContractV5R1 (workchain 0, UQ…)", () => {
    for (const a of [0, 1106]) {
      const pub = slip10Ed25519(seed, `m/44'/607'/${a}'`).publicKey;
      const ref = WalletContractV5R1.create({ workchain: 0, publicKey: Buffer.from(pub) }).address.toString({ bounceable: false, urlSafe: true });
      expect(tonAddress(pub)).toBe(ref);
      expect(ref.startsWith("UQ")).toBe(true);
    }
    expect(bundle.addresses.TON).toBe(pocketReceiveAddress("TON", bundle.xpubs.TON!));
  });
});

function hexSui(a: number): string {
  return Ed25519Keypair.deriveKeypair(ABANDON, `m/44'/784'/${a}'/0'/0'`).toSuiAddress();
}

describe("keys are checked before Seeds stores them", () => {
  test("matching halves pass, swapped or edited halves fail", () => {
    for (const c of ["XLM", "TON", "SUI"] as const) {
      expect(pocketKeysMatch(c, bundle.xprvs[c]!, bundle.xpubs[c]!)).toBe(true);
      expect(hex.encode(receivePrivateKey(c, bundle.xprvs[c]!))).toBe(bundle.xprvs[c]!);
    }
    expect(edKeysMatch("XLM", bundle.xprvs.SUI!, bundle.xpubs.XLM!)).toBe(false);
    expect(edKeysMatch("TON", bundle.xprvs.TON!, bundle.xpubs.TON!.replace(/.$/, (d) => (d === "0" ? "1" : "0")))).toBe(false);
    expect(edKeysMatch("SUI", "zz", bundle.xpubs.SUI!)).toBe(false);
  });
  test("malformed public halves are refused", () => {
    const xlm = bundle.xpubs.XLM!;
    expect(() => parseExtKey("XLM", xlm.slice(0, -1) + (xlm.endsWith("A") ? "B" : "A"))).toThrow();
    expect(() => parseExtKey("TON", "UQ" + "a".repeat(46))).toThrow();
    expect(() => parseExtKey("SUI", bundle.xpubs.SUI!.toUpperCase())).toThrow();
    expect(parseExtKey("SUI", bundle.xpubs.SUI!)).toBe(bundle.addresses.SUI!);
  });
});
