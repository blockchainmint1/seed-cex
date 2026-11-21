/**
 * Held pocket-key changes (auditor follow-up on key sign-in).
 *
 * A coin / wallet sign-in that brings DIFFERENT pocket keys than the member's active link is never applied
 * by the submit endpoint. It is parked on the sign-in request, the member is told on Telegram and by email
 * first, and the swap only happens when the screen that started the sign-in approves it — with a fresh
 * authenticator code when the member uses two-factor. Identical keys (a normal re-sign-in) never get here.
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { IDENTITY_LABEL, REPLACE_CODE_TRIES, replaceConfirmProblem } from "./rules";

const SITE = "https://seeds.honest.money";

type Pending = { account: number; paths: string[]; xpubs: Record<string, string>; identity: string; key_ciphertext: string };

async function telegramTo(userId: string, text: string, linkId?: string): Promise<void> {
  const { sendTelegram, telegramConfigured, telegramActionKey } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return;
  const { data } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", userId).maybeSingle();
  if (!data?.telegram_chat_id || data.telegram_verified !== true) return;
  let markup: Parameters<typeof sendTelegram>[2];
  if (linkId) {
    const key = await telegramActionKey();
    const { revokeButtonData } = await import("@/lib/telegram-actions");
    if (key) markup = { inline_keyboard: [[{ text: "🚫 Revoke Seeds' access (stops this change)", callback_data: await revokeButtonData(key, "ask", linkId, userId) }], [{ text: "Open Security", url: `${SITE}/account/security` }]] };
  }
  await sendTelegram(String(data.telegram_chat_id), text, markup);
}

/** Tell the member BEFORE anything changes (Telegram whatever their alert settings, plus email when they have one). */
export async function warnKeyReplaceHeld(i: { userId: string; linkId: string; kind: string }): Promise<void> {
  const { hasTwoFactor } = await import("../two-factor.server");
  const twoFactor = await hasTwoFactor(i.userId).catch(() => true);
  const what = (IDENTITY_LABEL[i.kind] ?? "key").toLowerCase();
  const gate = twoFactor
    ? "It only goes through if they also enter the code from your authenticator app."
    : "It goes through as soon as they confirm on their screen, because two-factor sign-in is off on your account.";
  await telegramTo(
    i.userId,
    `⚠️ <b>Seeds security</b>\nSomeone just signed in with your ${what} and is asking Seeds to <b>replace your trading-pocket keys</b> with different ones. Your own coin or wallet always brings the same keys, so this is not a normal sign-in.\n${gate}\nIf this wasn't you, tap Revoke below right now and contact support@honest.money. Your signature may have been taken by a fake site; only ever sign on key.seeds.honest.money.`,
    i.linkId,
  ).catch((e) => console.error("[key-replace] telegram warn failed", e));
  const { emailAccountChange } = await import("@/lib/email/send.server");
  await emailAccountChange(i.userId, "Trading pocket keys", [
    `Someone signed in with your ${what} and asked Seeds to replace your trading-pocket keys with different ones`,
    twoFactor ? "It only goes through with a code from your authenticator app" : "It goes through as soon as they confirm on their screen",
  ], "revoke Seeds' access in Account → Security (or from Telegram) right away and contact support@honest.money.").catch(() => undefined);
}

/** Publishable-key client for a throwaway session (used only to check an authenticator code). */
function throwawayClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Check a fresh authenticator code for a member who isn't signed in on this screen yet. */
async function codeMatches(email: string, userId: string, code: string): Promise<boolean> {
  const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link.data.properties?.hashed_token;
  if (link.error || !hashed || link.data.user?.id !== userId) throw new Error("Couldn't check the code. Try again.");
  const c = throwawayClient();
  const { data: s, error } = await c.auth.verifyOtp({ type: "magiclink", token_hash: hashed });
  if (error || !s.session) throw new Error("Couldn't check the code. Try again.");
  try {
    const { data: f } = await c.auth.mfa.listFactors();
    const factor = (f?.totp ?? []).find((x) => x.status === "verified");
    if (!factor) return false;
    const { error: ve } = await c.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    return !ve;
  } finally {
    await c.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}

/**
 * The starting screen approves a held key change. Returns null when nothing is held (normal sign-in),
 * otherwise applies the swap (compare-and-set on the old link) or throws why it can't.
 */
export async function confirmHeldReplace(i: { challengeId: string; code: string | null }): Promise<void> {
  const { data: r } = await supabaseAdmin.from("key_signin_requests")
    .select("user_id, claimed_at, replace_link_id, pending_link, replace_tries, replaced_at").eq("challenge_id", i.challengeId).maybeSingle();
  if (!r?.user_id || !r.replace_link_id || !r.pending_link || r.replaced_at) throw new Error("That sign-in ran out. Start again.");
  const { hasTwoFactor } = await import("../two-factor.server");
  const twoFactorOn = await hasTwoFactor(r.user_id);
  const problem = replaceConfirmProblem({
    claimedMs: r.claimed_at ? Date.parse(r.claimed_at) : null, nowMs: Date.now(), tries: r.replace_tries, twoFactorOn, code: i.code,
  });
  if (problem) {
    if (r.replace_tries >= REPLACE_CODE_TRIES) await dropHeldReplace(i.challengeId);
    throw new Error(problem);
  }
  if (twoFactorOn) {
    const u = await supabaseAdmin.auth.admin.getUserById(r.user_id);
    const email = u.data.user?.email;
    if (!email) throw new Error("Couldn't check the code. Try again.");
    // Count the try before checking, so parallel guesses can't skip the limit.
    const { data: counted } = await supabaseAdmin.from("key_signin_requests").update({ replace_tries: r.replace_tries + 1 })
      .eq("challenge_id", i.challengeId).eq("replace_tries", r.replace_tries).select("challenge_id");
    if (!counted?.length) throw new Error("Try the code again.");
    if (!(await codeMatches(email, r.user_id, i.code!))) {
      if (r.replace_tries + 1 >= REPLACE_CODE_TRIES) await dropHeldReplace(i.challengeId);
      throw new Error("That code doesn't match.");
    }
  }
  // Single use: take the held keys off the request before applying them.
  const { data: took } = await supabaseAdmin.from("key_signin_requests").update({ pending_link: null, replaced_at: new Date().toISOString() })
    .eq("challenge_id", i.challengeId).is("replaced_at", null).not("pending_link", "is", null).select("challenge_id");
  if (!took?.length) throw new Error("That sign-in was already used. Start again.");
  const p = r.pending_link as unknown as Pending;
  const { data: revoked } = await supabaseAdmin.from("hme_links")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "replaced", key_ciphertext: null })
    .eq("id", r.replace_link_id).eq("user_id", r.user_id).eq("status", "active").select("id");
  if (!revoked?.length) throw new Error("Your trading pocket link changed in the meantime, so nothing was replaced. Start again.");
  await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", r.replace_link_id).eq("status", "pending");
  const { error: le } = await supabaseAdmin.from("hme_links").insert({
    user_id: r.user_id, mode: "access", account: p.account, paths: p.paths, identity_address: p.identity,
    xpubs: p.xpubs, key_ciphertext: p.key_ciphertext, source: "seeds_key",
  });
  if (le) throw new Error("Couldn't save the new pocket link. Start again.");
  await telegramTo(r.user_id, `🔑 <b>Seeds security</b>\nYour trading-pocket keys were just replaced after a sign-in on another screen${twoFactorOn ? " with your authenticator code" : ""}. If this wasn't you, revoke Seeds' access in Security now and contact support@honest.money.\n\n<a href="${SITE}/account/security">Open Security</a>`).catch(() => undefined);
  const { emailAccountChange } = await import("@/lib/email/send.server");
  await emailAccountChange(r.user_id, "Trading pocket keys", ["Your trading-pocket keys were replaced after a sign-in on another screen"],
    "revoke Seeds' access in Account → Security right away and contact support@honest.money.").catch(() => undefined);
}

/** The screen said "not mine" (or ran out of tries): throw the held keys away. */
export async function dropHeldReplace(challengeId: string): Promise<void> {
  await supabaseAdmin.from("key_signin_requests").update({ pending_link: null }).eq("challenge_id", challengeId).is("replaced_at", null);
}
