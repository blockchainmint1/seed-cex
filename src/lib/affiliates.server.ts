// Server-only: recording referrals and invite-link clicks for Admin → Affiliates.
//
// WARNING (review P2): the `referrals` sign-up count is for watching who shares links,
// never a basis for paying anyone. Coin/wallet accounts cost nothing to create, so anyone
// can stamp a code onto a stream of empty accounts. If affiliate rewards ever come to
// Seeds, base them on real activity (trades, swaps, TSD held) or Honest.Money's own credit.
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
    await supabaseAdmin.from("referral_codes").upsert({ code_lc: c.toLowerCase(), code: c, user_id: userId, last_seen_at: now, viewed_at: now }, { onConflict: "code_lc" });
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

/**
 * Matches invite codes to their Seeds owners without waiting for each member to open their own
 * invite link: asks Honest.Money (by permanent member id, read-only) for the codes of members
 * not checked in the last day, a batch at a time. Never throws.
 */
export async function syncReferralOwners(limit = 200): Promise<{ checked: number; matched: number } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: due, error } = await supabaseAdmin.rpc("members_due_for_code_check", { _limit: limit });
    if (error) throw error;
    const rows = (due ?? []).filter((r): r is { user_id: string; hm_member_id: string } => !!r.user_id && !!r.hm_member_id);
    if (!rows.length) return { checked: 0, matched: 0 };
    const { CODE_CHECK_BATCH } = await import("./affiliates");
    const { hmeReferralCodes } = await import("./hme-hub.server");
    let checked = 0; let matched = 0;
    for (let i = 0; i < rows.length; i += CODE_CHECK_BATCH) {
      const batch = rows.slice(i, i + CODE_CHECK_BATCH);
      const codes = await hmeReferralCodes(batch.map((r) => r.hm_member_id));
      if (!codes) break; // hub unreachable: try again next run, mark nobody checked
      const now = new Date().toISOString();
      const pairs = batch.flatMap((r) => { const code = codes.get(r.hm_member_id); return code ? [{ user_id: r.user_id, code, code_lc: code.toLowerCase() }] : []; });
      if (pairs.length) {
        // A member's code can change on Honest.Money: drop their old row first so user_id stays unique.
        const { data: existing } = await supabaseAdmin.from("referral_codes").select("code_lc, user_id").in("user_id", pairs.map((p) => p.user_id));
        const want = new Map(pairs.map((p) => [p.user_id, p.code_lc]));
        const stale = (existing ?? []).filter((e) => want.get(e.user_id) !== e.code_lc).map((e) => e.user_id);
        if (stale.length) await supabaseAdmin.from("referral_codes").delete().in("user_id", stale);
        // viewed_at is left alone: it means the owner opened their own invite link, which this isn't.
        const { error: upErr } = await supabaseAdmin.from("referral_codes")
          .upsert(pairs.map((p) => ({ code_lc: p.code_lc, code: p.code, user_id: p.user_id, last_seen_at: now })), { onConflict: "code_lc" });
        if (upErr) throw upErr;
        matched += pairs.length;
      }
      await supabaseAdmin.from("referral_code_checks").upsert(batch.map((r) => ({ user_id: r.user_id, checked_at: now })), { onConflict: "user_id" });
      checked += batch.length;
    }
    return { checked, matched };
  } catch (e) {
    console.warn("[affiliates] couldn't match invite codes", e instanceof Error ? e.message : e);
    return null;
  }
}
