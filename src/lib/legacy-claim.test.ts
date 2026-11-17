import { describe, expect, test } from "bun:test";
import { CLAIM_MINUTES, CLAIMS_PER_HOUR, canSendClaim, claimErrorMessage, claimExpiry, claimTokenHash, maskEmail } from "./legacy-claim";

const NOW = Date.parse("2026-11-17T20:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("legacy account link rules", () => {
  test("a link lasts 30 minutes", () => {
    expect(CLAIM_MINUTES).toBe(30);
    expect(claimExpiry(new Date(NOW)).toISOString()).toBe("2026-11-17T20:30:00.000Z");
  });
  test("at most 3 link emails per old account per hour", () => {
    expect(CLAIMS_PER_HOUR).toBe(3);
    expect(canSendClaim([ago(5), ago(20)], NOW)).toBe(true);
    expect(canSendClaim([ago(5), ago(20), ago(50)], NOW)).toBe(false);
  });
  test("sends older than an hour no longer count", () => {
    expect(canSendClaim([ago(61), ago(70), ago(90)], NOW)).toBe(true);
  });
  test("the stored fingerprint differs from the emailed code", () => {
    const token = "a".repeat(64);
    expect(claimTokenHash(token)).not.toBe(token);
    expect(claimTokenHash(token)).toBe(claimTokenHash(token));
  });
  test("emails are masked on screen", () => {
    expect(maskEmail("chuck_giddens@yahoo.com")).toBe("ch•••@yahoo.com");
  });
  test("an expired or reused link asks the member to sign in again", () => {
    expect(claimErrorMessage("ERROR: claim_invalid")).toContain("expired or was already used");
  });
});
