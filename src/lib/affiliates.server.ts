// Server-only: recording referrals and invite-link clicks for Admin → Affiliates.
import { cleanCode, isAutomatedVisit, referralProblem } from "./affiliates";

/**
 * Records the invite code a new member arrived with. First code wins, only for
 * accounts that joined within the referral window, never their own code. Never throws.
 */
export async function recordReferral(userId: string, rawCode: unknown, source: "sso" | "attach" | "after_signup"): Promise<string> {
  try {
    const code = cleanCode(rawCode);
    if (!code) return "no_code";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prof }, { data: existing }, { data: own }] = await Promise.all([
      supabaseAdmin.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("referrals").select("user_id").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("referral_codes").select("code").eq("user_id", userId).maybeSingle(),
    ]);
    const problem = referralProblem({ code, accountCreatedAt: prof?.created_at ?? null, alreadyRecorded: !!existing, ownCode: own?.code ?? null });
    if (problem) return problem;
    const { error } = await supabaseAdmin.from("referrals").insert({ user_id: userId, code, source });
    return error ? (error.code === "23505" ? "already_recorded" : "error") : "recorded";
  } catch (e) {
    console.warn("[affiliates] couldn't record referral", e instanceof Error ? e.message : e);
    return "error";
  }
}

/** Remembers which member owns a code (when they open their own invite link). Never throws. */
export async function rememberOwnCode(userId: string, code: string | null) {
  const c = cleanCode(code);
  if (!c) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    // A member's code can change on Honest.Money: drop their old row first so user_id stays unique.
    await supabaseAdmin.from("referral_codes").delete().eq("user_id", userId).neq("code_lc", c.toLowerCase());
    await supabaseAdmin.from("referral_codes").upsert({ code_lc: c.toLowerCase(), code: c, user_id: userId, last_seen_at: now }, { onConflict: "code_lc" });
  } catch (e) {
    console.warn("[affiliates] couldn't remember own code", e instanceof Error ? e.message : e);
  }
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b).slice(0, 12), (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * Counts one click on /invite/{code}: people only (no link previews or crawlers), at most
 * 30 per minute per connection, and a repeat from the same connection within 10 minutes
 * counts once. The connection address is hashed and kept only by the 10-minute rate counter.
 */
export async function countInviteClick(headers: Headers, rawCode: string) {
  try {
    const code = cleanCode(rawCode);
    if (!code || isAutomatedVisit(headers.get("user-agent"))) return;
    const { ipAllowed, requestIp } = await import("./ip-rate.server");
    if (!(await ipAllowed("invite", headers, 30))) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const win = new Date(Math.floor(Date.now() / 600_000) * 600_000).toISOString();
    const key = `invite-seen:${hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`seeds-invite|${requestIp(headers)}|${code.toLowerCase()}`)))}`;
    const { data: seen } = await supabaseAdmin.rpc("api_bump_rate", { _key: key, _weight: 1, _window: win });
    if (Number(seen) > 1) return;
    await supabaseAdmin.rpc("bump_referral_click", { _code: code });
  } catch (e) {
    console.warn("[affiliates] click not counted", e instanceof Error ? e.message : e);
  }
}
