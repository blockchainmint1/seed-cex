import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { base64urlnopad } from "@scure/base";
import { readSignedVaultRequest } from "./vault-protocol";
import { VAULT_KMS_SIGNING_KEY_ID } from "./vault-request";

// The public record people check before pinning must agree with itself (Bobby, Nov 23 2026: AWS KMS key).
const doc = readFileSync(new URL("../../../docs/vault-request-signer.md", import.meta.url), "utf8");
const PUB = "6_06ZOHGeDeGX7O1ToRTAmdiGs0_AOSSX70VbTd9IjA";
const FP = "0556577f852b0cf2a05a1c75ecbf806e6657ce193393d9e800137b6537c86d4d";

describe("published Vault signer record", () => {
  it("pins the AWS KMS key id with the published public key", () => {
    expect(VAULT_KMS_SIGNING_KEY_ID).toBe("seeds-vault-kms-2026-11");
    expect(doc).toContain(`"seeds-vault-kms-2026-11": "${PUB}"`);
  });
  it("fingerprint is the SHA-256 of the 32 public-key bytes", () => {
    const bytes = base64urlnopad.decode(PUB);
    expect(bytes.length).toBe(32);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FP);
    expect(doc).toContain(FP);
  });
  it("the signed example verifies with the pinned key and is refused today", () => {
    const m = doc.match(/```json\n([\s\S]*?)\n```/);
    const ex = JSON.parse(m![1]!);
    expect(ex.signing_key_id).toBe("seeds-vault-kms-2026-11");
    const trust = { "seeds-vault-kms-2026-11": PUB };
    expect(readSignedVaultRequest(ex, trust as never, Date.parse("2026-01-01T00:05:00.000Z"))).toBeTruthy();
    expect(() => readSignedVaultRequest(ex, trust as never, Date.parse("2026-11-23T00:00:00.000Z"))).toThrow();
    expect(() => readSignedVaultRequest(ex, { "seeds-vault-2026-11": "KuDdTWX-bDwxkSff2lULKVwvUS_Dfa0tZLy_iWefuxc" } as never, Date.parse("2026-01-01T00:05:00.000Z"))).toThrow();
  });
});
