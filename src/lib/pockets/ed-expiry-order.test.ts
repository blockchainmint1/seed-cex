import { describe, expect, test } from "bun:test";
import { stellarNotFoundExpired } from "./ed-confirm-rules";

// Audit EF1: a stale "not found" must never mark a paid Stellar withdrawal expired.
describe("stellarNotFoundExpired", () => {
  const expiresAt = 1_000;
  const head = { sequence: 500, closed_at: new Date(2_000 * 1000).toISOString() };
  test("fresh 404 after expiry is conclusive", () => expect(stellarNotFoundExpired(expiresAt, head, "500")).toBe(true));
  test("404 from a lagging backend is not", () => expect(stellarNotFoundExpired(expiresAt, head, "499")).toBe(false));
  test("missing or bad header is not", () => {
    expect(stellarNotFoundExpired(expiresAt, head, null)).toBe(false);
    expect(stellarNotFoundExpired(expiresAt, head, "abc")).toBe(false);
  });
  test("head not yet past expiry is not", () =>
    expect(stellarNotFoundExpired(expiresAt, { sequence: 500, closed_at: new Date(1_010 * 1000).toISOString() }, "501")).toBe(false));
});
