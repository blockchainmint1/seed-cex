import { describe, expect, test } from "bun:test";
import { ADMIN_CODE_MAX_AGE_SEC, ADMIN_LOCKED, NOT_ADMIN, adminCodeFresh, adminGate, adminUnlocked, adminUnlockedUntil, requireAdmin } from "./admin-guard";

const now = 1_800_000_000;
const coded = (agoSec: number) => ({ aal: "aal2", amr: [{ method: "otp", timestamp: now - 99_999 }, { method: "totp", timestamp: now - agoSec }] });

describe("admin console lock", () => {
  test("non-admins are never let in, even with a fresh code", () => {
    expect(adminGate({ isAdmin: false, twoFactorOn: true, claims: coded(5), nowSec: now })).toBe("not_admin");
  });
  test("an admin without two-factor must set it up first", () => {
    expect(adminGate({ isAdmin: true, twoFactorOn: false, claims: { aal: "aal1", amr: [{ method: "otp", timestamp: now }] }, nowSec: now })).toBe("needs_setup");
  });
  test("an admin with two-factor but no code on this session must enter one", () => {
    expect(adminGate({ isAdmin: true, twoFactorOn: true, claims: { aal: "aal1", amr: [] }, nowSec: now })).toBe("needs_code");
  });
  test("a code from 11 hours ago still unlocks", () => {
    expect(adminGate({ isAdmin: true, twoFactorOn: true, claims: coded(11 * 3600), nowSec: now })).toBe("ok");
  });
  test("a code from 13 hours ago no longer unlocks", () => {
    expect(adminGate({ isAdmin: true, twoFactorOn: true, claims: coded(13 * 3600), nowSec: now })).toBe("needs_code");
  });
  test("the window is exactly 12 hours", () => {
    expect(ADMIN_CODE_MAX_AGE_SEC).toBe(43_200);
    expect(adminCodeFresh(coded(43_200), now)).toBe(true);
    expect(adminCodeFresh(coded(43_201), now)).toBe(false);
  });
  test("a totp stamp without aal2 doesn't count", () => {
    expect(adminCodeFresh({ aal: "aal1", amr: [{ method: "totp", timestamp: now }] }, now)).toBe(false);
  });
  test("unlock ends 12 hours after the code", () => {
    expect(adminUnlockedUntil(coded(3600), now)).toBe(now - 3600 + 43_200);
    expect(adminUnlockedUntil(coded(50_000), now)).toBeNull();
  });
});

const roleDb = (isAdmin: boolean) => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: isAdmin ? { role: "admin" } : null }) }) }) }) }),
});
const nowClaims = (agoSec: number) => {
  const t = Math.floor(Date.now() / 1000) - agoSec;
  return { aal: "aal2", amr: [{ method: "totp", timestamp: t }] };
};

describe("server-side admin check", () => {
  test("an admin without a code on this session is refused with the lock message", async () => {
    await expect(requireAdmin({ supabase: roleDb(true), userId: "u", claims: { aal: "aal1", amr: [] } })).rejects.toThrow(ADMIN_LOCKED);
  });
  test("an admin with a code from 1 hour ago gets through", async () => {
    await expect(requireAdmin({ supabase: roleDb(true), userId: "u", claims: nowClaims(3600) })).resolves.toBeUndefined();
  });
  test("a non-admin with a fresh code is still refused", async () => {
    await expect(requireAdmin({ supabase: roleDb(false), userId: "u", claims: nowClaims(5) })).rejects.toThrow(NOT_ADMIN);
  });
  test("admin shortcuts (P2P arbitration) are off when the code is 13 hours old", async () => {
    expect(await adminUnlocked({ supabase: roleDb(true), userId: "u", claims: nowClaims(13 * 3600) })).toBe(false);
    expect(await adminUnlocked({ supabase: roleDb(true), userId: "u", claims: nowClaims(60) })).toBe(true);
  });
});
