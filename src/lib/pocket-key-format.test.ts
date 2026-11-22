import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { aesOpen, aesSeal, canRewrap, formatKmsSealed, isKmsSealed, parseKmsSealed } from "./pocket-key-format";

const key = new Uint8Array(randomBytes(32));

describe("pocket key storage format", () => {
  test("a sealed key opens with the same data key", () => {
    expect(aesOpen(aesSeal('{"TXC":"xprv-test"}', key), key)).toBe('{"TXC":"xprv-test"}');
  });

  test("a different data key cannot open it", () => {
    const sealed = aesSeal("secret", key);
    expect(() => aesOpen(sealed, new Uint8Array(randomBytes(32)))).toThrow();
  });

  test("a tampered value is refused", () => {
    const buf = Buffer.from(aesSeal("secret", key), "base64");
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 1;
    expect(() => aesOpen(buf.toString("base64"), key)).toThrow();
  });

  test("KMS format round-trips the wrapped data key and body", () => {
    const wrapped = new Uint8Array([1, 2, 3, 250]);
    const body = aesSeal("secret", key);
    const stored = formatKmsSealed(wrapped, body);
    expect(isKmsSealed(stored)).toBe(true);
    const p = parseKmsSealed(stored);
    expect(Array.from(p.wrappedDataKey)).toEqual([1, 2, 3, 250]);
    expect(aesOpen(p.body, key)).toBe("secret");
  });

  test("old-format values are not mistaken for KMS ones", () => {
    expect(isKmsSealed(aesSeal("secret", key))).toBe(false);
    expect(isKmsSealed(null)).toBe(false);
  });

  test("malformed KMS values are refused", () => {
    expect(() => parseKmsSealed("kms1.")).toThrow();
    expect(() => parseKmsSealed("kms1.abc")).toThrow();
    expect(() => parseKmsSealed("kms1.a.b.c")).toThrow();
  });

  test("re-locking only goes from the old format to KMS", () => {
    const legacy = aesSeal("x", key);
    const kms = formatKmsSealed(new Uint8Array([9]), aesSeal("x", key));
    expect(canRewrap(legacy, kms)).toBe(true);
    expect(canRewrap(kms, formatKmsSealed(new Uint8Array([8]), aesSeal("x", key)))).toBe(false);
    expect(canRewrap(legacy, aesSeal("x", key))).toBe(false);
    expect(canRewrap(null, kms)).toBe(false);
  });
});
