/**
 * Pure rules for giving or removing Seeds admin access (no I/O). The database
 * function set_admin_role enforces the same rules atomically; the admin page
 * uses these to explain why a button is off before anyone presses it.
 */
export type AdminChange = {
  actorId: string;
  targetId: string;
  grant: boolean;
  targetIsAdmin: boolean;
  targetHasHme: boolean;
  adminCount: number;
};

export type AdminResult = "ok" | "not_admin" | "no_hme" | "unchanged" | "self" | "last_admin";

export const ADMIN_RESULT_MESSAGES: Record<AdminResult, string> = {
  ok: "Done.",
  not_admin: "Only admins can change who has admin access.",
  no_hme: "Only Honest.Money members can be admins. They need to sign in to Seeds with Honest.Money first.",
  unchanged: "Nothing to change. That's already how it is.",
  self: "You can't remove your own admin access. Ask another admin to do it.",
  last_admin: "Seeds needs at least one admin. Give someone else access first.",
};

/** The reason a change would be refused, or null when it's allowed. Mirrors set_admin_role. */
export function adminChangeProblem(c: AdminChange & { actorIsAdmin?: boolean }): Exclude<AdminResult, "ok"> | null {
  if (c.actorIsAdmin === false) return "not_admin";
  if (c.grant) {
    if (!c.targetHasHme) return "no_hme";
    if (c.targetIsAdmin) return "unchanged";
    return null;
  }
  if (c.targetId === c.actorId) return "self";
  if (!c.targetIsAdmin) return "unchanged";
  if (c.adminCount <= 1) return "last_admin";
  return null;
}

export function adminResultMessage(code: string): string {
  return ADMIN_RESULT_MESSAGES[code as AdminResult] ?? "Couldn't change admin access. Try again.";
}

export type UserRowLike = { name: string; email: string | null; hmMemberId: string | null };

/** Case-insensitive match on name, email or HME member id. */
export function matchesUserSearch(row: UserRowLike, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [row.name, row.email ?? "", row.hmMemberId ?? ""].some((v) => v.toLowerCase().includes(s));
}
