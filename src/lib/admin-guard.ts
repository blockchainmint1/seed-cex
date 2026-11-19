/**
 * Admin console lock (pure rules + one role lookup; no server-only imports).
 *
 * Honest.Money sign-in tells Seeds who someone is, but not whether they used
 * a second step, so Seeds checks admins itself: every admin power needs the
 * Seeds admin role AND an authenticator code entered on this session within
 * ADMIN_CODE_MAX_AGE_SEC. The proof comes from the signed session token
 * (aal2 + amr), which the browser can't fake.
 */
import { codeAgeSec, type SessionClaims } from "./two-factor";

/** An admin enters a fresh code at least once every 12 hours. */
export const ADMIN_CODE_MAX_AGE_SEC = 12 * 60 * 60;

/** Error text the admin console recognises to show its unlock box. */
export const ADMIN_LOCKED = "Admin console locked: enter the code from your authenticator app to unlock it.";
export const NOT_ADMIN = "Forbidden: admin role required";

export type AdminGate = "not_admin" | "needs_setup" | "needs_code" | "ok";

/** Where this person stands with the admin console right now. */
export function adminGate(input: { isAdmin: boolean; twoFactorOn: boolean; claims: SessionClaims | null | undefined; nowSec: number }): AdminGate {
  if (!input.isAdmin) return "not_admin";
  if (adminCodeFresh(input.claims, input.nowSec)) return "ok";
  return input.twoFactorOn ? "needs_code" : "needs_setup";
}

/** True when this session entered an authenticator code in the last 12 hours. */
export function adminCodeFresh(claims: SessionClaims | null | undefined, nowSec: number): boolean {
  const age = codeAgeSec(claims, nowSec);
  return age != null && age <= ADMIN_CODE_MAX_AGE_SEC;
}

/** Unix seconds when the current unlock runs out, or null when locked. */
export function adminUnlockedUntil(claims: SessionClaims | null | undefined, nowSec: number): number | null {
  const age = codeAgeSec(claims, nowSec);
  return age != null && age <= ADMIN_CODE_MAX_AGE_SEC ? nowSec - age + ADMIN_CODE_MAX_AGE_SEC : null;
}

type RoleCtx = { supabase: { from: (t: "user_roles") => any }; userId: string; claims?: unknown };

/** Does this account hold the Seeds admin role? (Read as the caller, through their own session.) */
export async function hasAdminRole(ctx: RoleCtx): Promise<boolean> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  return Boolean(data);
}

/** Admin role and unlocked with a recent code: may use admin powers. */
export async function adminUnlocked(ctx: RoleCtx): Promise<boolean> {
  if (!adminCodeFresh(ctx.claims as SessionClaims, Math.floor(Date.now() / 1000))) return false;
  return hasAdminRole(ctx);
}

/** Throws unless the caller is an admin who entered a code in the last 12 hours. */
export async function requireAdmin(ctx: RoleCtx): Promise<void> {
  if (!(await hasAdminRole(ctx))) throw new Error(NOT_ADMIN);
  if (!adminCodeFresh(ctx.claims as SessionClaims, Math.floor(Date.now() / 1000))) throw new Error(ADMIN_LOCKED);
}

/** Shown when an admin tries a pilot money action with the console locked. */
export const PILOT_ADMIN_LOCKED =
  "This is in a test with the Seeds team, and your admin console is locked. Open Admin, enter the code from your authenticator app, then try again.";

/**
 * Audit 2026-11-19 M1: pilot money paths (swaps, TSD swaps, PulseChain sends) count someone
 * as an admin only with the role AND a code in the last 12 hours, like every other admin power.
 * A locked admin gets PILOT_ADMIN_LOCKED while the pilot is admin-only; otherwise they're a member.
 */
export async function pilotAdminAccess(ctx: RoleCtx, pilotAdminOnly: boolean): Promise<boolean> {
  if (!(await hasAdminRole(ctx))) return false;
  if (adminCodeFresh(ctx.claims as SessionClaims, Math.floor(Date.now() / 1000))) return true;
  if (pilotAdminOnly) throw new Error(PILOT_ADMIN_LOCKED);
  return false;
}
