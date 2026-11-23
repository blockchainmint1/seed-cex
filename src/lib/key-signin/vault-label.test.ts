import { describe, expect, test } from "bun:test";
import { coinIdentityKey, signTxcMessage } from "./seeds-key-reference";
import { verifyKeySignature } from "./signin.server";
import { readVaultLabel, vaultLabelMessage } from "./vault-label";
import { keyName, shortKeyName, startingName, vaultName, vaultRename } from "./rules";

// Public BIP39 test seed; its master fingerprint is 73c5da0a (the ID HME Vault shows beside the seed name).
const WORDS = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const KEY = coinIdentityKey(WORDS);
const IDENTITY = signTxcMessage(KEY, "x").address;
const HANDOFF = "Seeds - Sign in with your key\n\nDomain: seeds.honest.money\nKind: coin\nChallenge: c1";
const verify = (i: string, m: string, s: string) => verifyKeySignature("coin", i, m, s);
const signed = (message: string, fp: string) => ({ vault_fingerprint: fp, vault_label_signature: signTxcMessage(KEY, vaultLabelMessage(message, fp)).signature });

describe("HME Vault seed ID label (Bobby, Nov 23: name Vault accounts by the ID Vault shows)", () => {
  test("the signed text is the fixed JSON tuple Seeds Key and Vault use", () => {
    expect(vaultLabelMessage("M", "73c5da0a")).toBe('["HME Vault seed label",1,"M","73c5da0a"]');
  });
  test("an older Vault (neither field) keeps today's coin sign-in", () => {
    expect(readVaultLabel({}, HANDOFF, IDENTITY, verify)).toBeUndefined();
    expect(keyName("coin", IDENTITY, null)).toBe(startingName("coin", IDENTITY));
  });
  test("a label signed by the same coin over this handoff is accepted, leading zeros included", () => {
    expect(readVaultLabel(signed(HANDOFF, "73c5da0a"), HANDOFF, IDENTITY, verify)?.vault_fingerprint).toBe("73c5da0a");
    expect(readVaultLabel(signed(HANDOFF, "00a1b2c3"), HANDOFF, IDENTITY, verify)?.vault_fingerprint).toBe("00a1b2c3");
  });
  test("only one field, uppercase, the wrong length or a null is refused, never ignored", () => {
    const good = signed(HANDOFF, "73c5da0a");
    expect(() => readVaultLabel({ vault_fingerprint: "73c5da0a" }, HANDOFF, IDENTITY, verify)).toThrow();
    expect(() => readVaultLabel({ vault_label_signature: good.vault_label_signature }, HANDOFF, IDENTITY, verify)).toThrow();
    expect(() => readVaultLabel({ ...good, vault_fingerprint: "73C5DA0A" }, HANDOFF, IDENTITY, verify)).toThrow();
    expect(() => readVaultLabel({ ...good, vault_fingerprint: "73c5da0" }, HANDOFF, IDENTITY, verify)).toThrow();
    expect(() => readVaultLabel({ vault_fingerprint: null, vault_label_signature: null }, HANDOFF, IDENTITY, verify)).toThrow();
  });
  test("a relabelled ID, a label from another handoff or another coin's signature is refused", () => {
    const good = signed(HANDOFF, "73c5da0a");
    expect(() => readVaultLabel({ ...good, vault_fingerprint: "deadbeef" }, HANDOFF, IDENTITY, verify)).toThrow();
    expect(() => readVaultLabel(signed(`${HANDOFF}\nChallenge: c2`, "73c5da0a"), HANDOFF, IDENTITY, verify)).toThrow();
    const other = coinIdentityKey(WORDS, "TREZOR");
    const forged = { vault_fingerprint: "73c5da0a", vault_label_signature: signTxcMessage(other, vaultLabelMessage(HANDOFF, "73c5da0a")).signature };
    expect(() => readVaultLabel(forged, HANDOFF, IDENTITY, verify)).toThrow();
  });
  test("the name on both screens is 'Vault <ID>' for a Vault coin, unchanged for wallets", () => {
    expect(vaultName("73c5da0a")).toBe("Vault 73c5da0a");
    expect(keyName("coin", IDENTITY, "73c5da0a")).toBe("Vault 73c5da0a");
    expect(keyName("coin", IDENTITY, "NOT-HEX!")).toBe(startingName("coin", IDENTITY));
    const evm = "0xabcdef0123456789abcdef0123456789abcdef01";
    expect(keyName("evm", evm, "73c5da0a")).toBe(shortKeyName("evm", evm));
  });
  test("an existing account's starting coin name becomes 'Vault <ID>'; a name the member chose stays", () => {
    expect(vaultRename(startingName("coin", IDENTITY), IDENTITY, "73c5da0a")).toBe("Vault 73c5da0a");
    expect(vaultRename(null, IDENTITY, "73c5da0a")).toBe("Vault 73c5da0a");
    expect(vaultRename("Bobby's coin", IDENTITY, "73c5da0a")).toBeNull();
    expect(vaultRename("Vault 73c5da0a", IDENTITY, "73c5da0a")).toBeNull();
    expect(vaultRename(startingName("coin", IDENTITY), IDENTITY, null)).toBeNull();
  });
});
