import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "./admin-guard";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminUserRow = {
  id: string;
  name: string;
  email: string | null;
  hmMemberId: string | null;
  hmStatus: string;
  isAdmin: boolean;
  adminSince: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export type AdminRoleEvent = { at: string; action: "grant" | "revoke"; targetName: string; actorName: string };

/** Everyone who has signed in to Seeds, who's an admin, and the last 50 admin changes. Admins only. */
export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const authUsers: { id: string; email: string | null; lastSignInAt: string | null }[] = [];
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error("Couldn't load accounts.");
      for (const u of data.users) authUsers.push({ id: u.id, email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null });
      if (data.users.length < 1000) break;
    }
    const [{ data: profiles }, { data: roles }, { data: events }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, display_name, hm_member_id, hm_status, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, created_at").eq("role", "admin"),
      supabaseAdmin.from("admin_role_events").select("target_id, actor_id, action, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    const authById = new Map(authUsers.map((u) => [u.id, u]));
    const adminSince = new Map((roles ?? []).map((r) => [r.user_id, r.created_at]));
    const users: AdminUserRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || authById.get(p.id)?.email?.split("@")[0] || "Unnamed",
      email: authById.get(p.id)?.email ?? null,
      hmMemberId: p.hm_member_id,
      hmStatus: p.hm_status,
      isAdmin: adminSince.has(p.id),
      adminSince: adminSince.get(p.id) ?? null,
      createdAt: p.created_at,
      lastSignInAt: authById.get(p.id)?.lastSignInAt ?? null,
    })).sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name));
    const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "Deleted account";
    const history: AdminRoleEvent[] = (events ?? []).map((e) => ({
      at: e.created_at, action: e.action as "grant" | "revoke", targetName: nameOf(e.target_id), actorName: nameOf(e.actor_id),
    }));
    return { me: context.userId, adminCount: adminSince.size, users, history };
  });

/**
 * Give or remove admin access. The database function checks every rule in one
 * locked step (caller is admin, new admin has an HME membership, no removing
 * yourself or the last admin) and records the change. The person and the other
 * admins are emailed; email never blocks the change.
 */
export const setAdminAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; grant: boolean }) => {
    if (!UUID_RE.test(String(d?.userId ?? ""))) throw new Error("Bad account id");
    return { userId: d.userId, grant: d.grant === true };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { adminResultMessage } = await import("./admin-users-rules");
    const { data: code, error } = await supabaseAdmin.rpc("set_admin_role", { _actor: context.userId, _target: data.userId, _grant: data.grant });
    if (error) {
      console.error("[admin-users] set_admin_role failed", error);
      return { ok: false, message: "Couldn't change admin access. Try again." };
    }
    if (code !== "ok") return { ok: false, message: adminResultMessage(String(code)) };
    console.info("[admin-users] admin access changed", { target: data.userId, grant: data.grant, by: context.userId });

    const { emailUser } = await import("./email/send.server");
    const { data: names } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", [context.userId, data.userId]);
    const actorName = names?.find((n) => n.id === context.userId)?.display_name || "another admin";
    const targetName = names?.find((n) => n.id === data.userId)?.display_name || "A member";
    const at = new Date().toISOString();
    await emailUser(data.userId, "account-change", (r) => ({
      name: r.name, thing: "Seeds admin access", at, timezone: r.timezone,
      headline: data.grant ? "You now have Seeds admin access." : "Your Seeds admin access was removed.",
      changes: [data.grant
        ? `Given by ${actorName}. You can now open the admin console at seeds.honest.money/admin.`
        : `Removed by ${actorName}. You can no longer open the admin console.`],
      ifNotYou: "tell the Seeds team at support@honest.money.",
    }));
    if (data.grant) {
      // Every other admin hears about a new admin, so nobody can be added quietly.
      const { data: others } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
      for (const o of others ?? []) {
        if (o.user_id === data.userId || o.user_id === context.userId) continue;
        await emailUser(o.user_id, "account-change", (r) => ({
          name: r.name, thing: "Seeds admin team", at, timezone: r.timezone,
          headline: `${targetName} was given Seeds admin access.`,
          changes: [`Given by ${actorName}.`],
          ifNotYou: "if nobody on the team expected this, remove their access at seeds.honest.money/admin/users and contact support@honest.money.",
        }));
      }
    }
    return { ok: true, message: data.grant ? `${targetName} now has admin access.` : `${targetName} no longer has admin access.` };
  });
