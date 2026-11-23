/**
 * "Prove it's you" (auditor H1/H1b) — server side. Rules in ./rules.ts (pure, tested).
 * Trust rows live in second_factor_trust; Telegram / email checks in step_up_checks (server only).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  PURPOSE_TEXT, STEP_UP_NEEDED, STEP_UP_PER_HOUR, STEP_UP_TRIES, STEP_UP_TTL_MS,
  factorCounts, freshSignIn, freshTotpAfter, makeIntent, newFactorTrust, proofUsable, readIntent, recentSignIn,
  stepUpOptions, totpCounts, trusted,
  type Claims, type StepUpOptions, type StepUpPurpose, type TrustRow,
} from "./rules";

const SITE = "https://seeds.honest.money";
const nowSec = () => Math.floor(Date.now() / 1000);

export type StepUpProof = { id: string; secret: string } | null | undefined;

const toRow = (r: { trusted_at: string | null; added_at: string } | null | undefined): TrustRow | null =>
  r ? { trustedMs: r.trusted_at ? Date.parse(r.trusted_at) : null, addedMs: Date.parse(r.added_at) } : null;

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Confirmed 2FA apps (from the sign-in service, never the browser) with their trust rows. Fails closed. */
export async function factorTrust(userId: string): Promise<Array<{ id: string; createdAt: string; name: string | null; row: TrustRow | null }>> {
  const [{ data, error }, { data: rows, error: re }] = await Promise.all([
    supabaseAdmin.auth.admin.mfa.listFactors({ userId }),
    supabaseAdmin.from("second_factor_trust").select("ref, trusted_at, added_at").eq("user_id", userId).eq("kind", "totp"),
  ]);
  if (error || re) throw new Error("Couldn't check your two-factor apps. Try again.");
  const byRef = new Map((rows ?? []).map((r) => [r.ref, r]));
  return (data?.factors ?? []).filter((f) => f.status === "verified").map((f) => ({ id: f.id, createdAt: f.created_at, name: f.friendly_name || null, row: toRow(byRef.get(f.id)) }));
}

/** The member's connected Telegram chat and its trust row. */
export async function telegramTrust(userId: string): Promise<{ chatId: string | null; row: TrustRow | null }> {
  const { data: p } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", userId).maybeSingle();
  const chatId = p?.telegram_verified && p.telegram_chat_id ? String(p.telegram_chat_id) : null;
  if (!chatId) return { chatId: null, row: null };
  const { data: r } = await supabaseAdmin.from("second_factor_trust").select("trusted_at, added_at")
    .eq("user_id", userId).eq("kind", "telegram").eq("ref", chatId).maybeSingle();
  return { chatId, row: toRow(r) };
}

/** May this chat approve sends / AI buys? Trusted (any age). Never throws: unreadable = not trusted. */
export async function chatTrusted(userId: string, chatId: string | null | undefined): Promise<boolean> {
  if (!chatId) return false;
  const { data, error } = await supabaseAdmin.from("second_factor_trust").select("trusted_at, added_at")
    .eq("user_id", userId).eq("kind", "telegram").eq("ref", String(chatId)).maybeSingle();
  return !error && trusted(toRow(data));
}

/**
 * What the fresh sign-in has to come after (auditor S1), resolved on the server only:
 * - key_link: when this browser claimed the held key (key_signin_requests.claimed_at);
 * - confirm_factor: when that 2FA app was added (sign-in service) or when the chat was connected;
 * - telegram_unlink (unlink or replace): a server-signed "screen opened at" stamp.
 */
export type StepUpSubject =
  | { kind: "link"; id: string; secret: string }
  | { kind: "totp"; factorId: string }
  | { kind: "telegram" }
  | { kind: "intent"; token?: string | null };

const intentKey = () => process.env.EMAIL_LINK_SECRET ?? "";

export async function newIntent(userId: string, purpose: StepUpPurpose): Promise<string | null> {
  const key = intentKey();
  return key ? makeIntent(key, userId, purpose, Date.now()) : null;
}

/** Milliseconds, or null = nothing to compare against (the fresh sign-in option then never passes; proofs still do). */
export async function stepUpSince(userId: string, purpose: StepUpPurpose, subject: StepUpSubject | null | undefined): Promise<number | null> {
  if (!subject) return null;
  if (purpose === "key_link" && subject.kind === "link") {
    if (!/^[a-f0-9]{32}$/.test(subject.id) || !/^[a-f0-9]{64}$/.test(subject.secret)) return null;
    const { sameDigest, sha256Hex: h } = await import("../key-signin/signin.server");
    const { data: r } = await supabaseAdmin.from("key_signin_requests").select("browser_secret_hash, link_user_id, claimed_at")
      .eq("challenge_id", subject.id).maybeSingle();
    if (!r || r.link_user_id !== userId || !r.claimed_at || !sameDigest(r.browser_secret_hash, h(subject.secret))) return null;
    return Date.parse(r.claimed_at);
  }
  if (purpose === "confirm_factor" && subject.kind === "totp") {
    const f = (await factorTrust(userId)).find((x) => x.id === subject.factorId);
    return f ? Date.parse(f.createdAt) : null;
  }
  if (purpose === "confirm_factor" && subject.kind === "telegram") {
    const tg = await telegramTrust(userId);
    return tg.row ? tg.row.addedMs : null;
  }
  if (purpose === "telegram_unlink" && subject.kind === "intent") {
    return readIntent(intentKey(), subject.token, userId, purpose, Date.now());
  }
  return null;
}

/**
 * Has this session proven it's the member AFTER `sinceMs` (S1)? A sign-in, or a code from 2FA apps that are all
 * trusted and a day old, made at or after that moment and within the last 10 minutes.
 */
export async function provenAfter(userId: string, claims: unknown, sinceMs: number | null): Promise<boolean> {
  if (sinceMs == null || !Number.isFinite(sinceMs)) return false;
  const sinceSec = Math.floor(sinceMs / 1000);
  if (freshSignIn(claims as Claims, nowSec(), sinceSec)) return true;
  if (!freshTotpAfter(claims as Claims, nowSec(), sinceSec)) return false;
  const factors = await factorTrust(userId).catch(() => []);
  return totpCounts(factors.map((f) => f.row), Date.now());
}

export async function stepUpState(userId: string, claims: unknown, purpose: StepUpPurpose, subject: StepUpSubject | null): Promise<StepUpOptions & { intent: string | null }> {
  // Unlink / replace: keep a still-valid "screen opened at" stamp (it survives the sign-in round trip), else issue one.
  let intent: string | null = null;
  let s: StepUpSubject | null = subject;
  if (purpose === "telegram_unlink") {
    const token = subject?.kind === "intent" ? subject.token : null;
    intent = token && (await readIntent(intentKey(), token, userId, purpose, Date.now())) != null ? token : await newIntent(userId, purpose);
    s = { kind: "intent", token: intent };
  }
  const [{ data: p }, factors, tg, since] = await Promise.all([
    supabaseAdmin.from("profiles").select("hm_member_id").eq("id", userId).maybeSingle(),
    factorTrust(userId),
    telegramTrust(userId),
    stepUpSince(userId, purpose, s),
  ]);
  return {
    ...stepUpOptions({
      hmeMember: Boolean(p?.hm_member_id),
      fresh: await provenAfter(userId, claims, since),
      factors: factors.map((f) => f.row),
      telegram: { connected: Boolean(tg.chatId), row: tg.row },
      nowMs: Date.now(),
    }),
    intent,
  };
}

/**
 * Gate for a sensitive step. Passes on a sign-in (or counted 2FA code) made after `sinceMs`, or an approved
 * Telegram / email check for this purpose — which is spent (single use, compare-and-set).
 */
export async function requireStepUp(userId: string, claims: unknown, purpose: StepUpPurpose, proof: StepUpProof, sinceMs: number | null): Promise<"fresh_sign_in" | "step_up"> {
  if (await provenAfter(userId, claims, sinceMs)) return "fresh_sign_in";
  if (proof && /^[0-9a-f-]{36}$/.test(proof.id) && /^[0-9a-f]{64}$/.test(proof.secret)) {
    const { data: r } = await supabaseAdmin.from("step_up_checks").select("id, user_id, purpose, status, expires_at, browser_secret_hash")
      .eq("id", proof.id).maybeSingle();
    const ok = r && r.user_id === userId && r.browser_secret_hash === (await sha256Hex(proof.secret))
      && proofUsable({ status: r.status, purpose: r.purpose, expiresMs: Date.parse(r.expires_at) }, purpose, Date.now());
    if (ok) {
      const { data: spent } = await supabaseAdmin.from("step_up_checks").update({ status: "used", used_at: new Date().toISOString() })
        .eq("id", proof.id).eq("status", "approved").select("id");
      if (spent?.length) return "step_up";
    }
  }
  throw new Error(STEP_UP_NEEDED);
}

/** S1 exception for a chat about to be connected: first chat on the account + signed in within 10 minutes. */
export function firstChatTrusted(hadChat: boolean, claims: unknown): boolean {
  return newFactorTrust({ firstOfKind: !hadChat, recentSignIn: recentSignIn(claims as Claims, nowSec()) }) != null;
}

const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => x.toString(16).padStart(2, "0")).join("");

/** Start a Telegram tap or email code check. The browser keeps `secret`. */
export async function startStepUp(userId: string, purpose: StepUpPurpose, method: "telegram" | "email"): Promise<{ id: string; secret: string; sentTo: string }> {
  const { count } = await supabaseAdmin.from("step_up_checks").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= STEP_UP_PER_HOUR) throw new Error("Too many checks this hour. Wait a bit, or sign in again instead.");
  const secret = rnd(32);
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS).toISOString();

  if (method === "telegram") {
    const tg = await telegramTrust(userId);
    if (!tg.chatId || !factorCounts(tg.row, Date.now())) throw new Error("Your Telegram chat can't confirm this yet (it must be confirmed and connected for at least a day). Sign in again instead.");
    const { telegramConfigured, telegramActionKey, telegramCall } = await import("@/lib/telegram.server");
    if (!telegramConfigured()) throw new Error("Telegram isn't available right now. Sign in again instead.");
    const { data: row, error } = await supabaseAdmin.from("step_up_checks").insert({
      user_id: userId, purpose, method, browser_secret_hash: await sha256Hex(secret), expires_at: expiresAt, telegram_chat_id: tg.chatId,
    }).select("id").single();
    if (error || !row) throw new Error("Couldn't start the check. Try again.");
    const key = await telegramActionKey();
    const { stepUpButtonData } = await import("./rules");
    const sent = (await telegramCall("sendMessage", {
      chat_id: tg.chatId, parse_mode: "HTML",
      text: `🔐 <b>Seeds security</b>\nSomeone signed in to your Seeds account is asking to <b>${PURPOSE_TEXT[purpose]}</b>.\nApprove only if you're doing this right now. If it wasn't you, tap Decline, then sign out of Honest.Money everywhere and contact support@honest.money.\n\nExpires in 10 minutes.`,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Yes, it's me", callback_data: await stepUpButtonData(key, "yes", row.id, userId) },
        { text: "Decline", callback_data: await stepUpButtonData(key, "no", row.id, userId) },
      ]] },
    }).catch(() => null)) as { message_id?: number } | null;
    if (!sent?.message_id) {
      await supabaseAdmin.from("step_up_checks").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", row.id);
      throw new Error("We couldn't reach your Telegram. Sign in again instead.");
    }
    await supabaseAdmin.from("step_up_checks").update({ telegram_message_id: sent.message_id }).eq("id", row.id);
    return { id: row.id, secret, sentTo: "your Telegram" };
  }

  // Email: Honest.Money members only — that address changes only through a signed Honest.Money ticket.
  const { data: p } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", userId).maybeSingle();
  if (!p?.hm_member_id) throw new Error("Email codes are for Honest.Money members. Sign in again with your coin or wallet instead.");
  const u = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = u.data.user?.email;
  const { isPlaceholderEmail } = await import("../key-signin/rules");
  if (!email || isPlaceholderEmail(email)) throw new Error("Your account has no email to send a code to. Sign in again instead.");
  const { sesConfigured } = await import("../email/ses.server");
  const linkSecret = process.env.EMAIL_LINK_SECRET ?? "";
  if (!sesConfigured() || !linkSecret) throw new Error("Seeds can't send email right now. Sign in again instead.");
  const { newEmailCode } = await import("../withdraw/rules");
  const code = newEmailCode();
  const id = crypto.randomUUID();
  const { error } = await supabaseAdmin.from("step_up_checks").insert({
    id, user_id: userId, purpose, method, browser_secret_hash: await sha256Hex(secret), expires_at: expiresAt,
    code_hash: await sha256Hex(`stepup|${id}|${userId}|${code}|${linkSecret}`),
  });
  if (error) throw new Error("Couldn't start the check. Try again.");
  const { deliver } = await import("../email/send.server");
  await deliver(email, "account-change", {
    name: "there", thing: "Security check", at: new Date().toISOString(), timezone: "UTC",
    changes: [`Your Seeds code is ${code}`, `It lets someone signed in to your account ${PURPOSE_TEXT[purpose]}`, "It works once, for 10 minutes"],
    ifNotYou: "don't share the code. Sign out of Honest.Money everywhere and contact support@honest.money.",
  });
  const [name, host] = email.split("@");
  return { id, secret, sentTo: `${(name ?? "").slice(0, 2)}…@${host ?? ""}` };
}

async function myCheck(userId: string, id: string, secret: string) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f]{64}$/.test(secret)) return null;
  const { data: r } = await supabaseAdmin.from("step_up_checks").select("id, user_id, purpose, method, status, expires_at, tries, code_hash, browser_secret_hash")
    .eq("id", id).maybeSingle();
  if (!r || r.user_id !== userId || r.browser_secret_hash !== (await sha256Hex(secret))) return null;
  return r;
}

export async function stepUpStatus(userId: string, id: string, secret: string): Promise<"pending" | "approved" | "declined" | "expired" | "used"> {
  const r = await myCheck(userId, id, secret);
  if (!r) return "expired";
  if (r.status === "pending" && Date.parse(r.expires_at) <= Date.now()) return "expired";
  return r.status as "pending" | "approved" | "declined" | "used";
}

export async function verifyStepUpEmail(userId: string, id: string, secret: string, code: string): Promise<void> {
  const r = await myCheck(userId, id, secret);
  if (!r || r.method !== "email" || r.status !== "pending" || Date.parse(r.expires_at) <= Date.now()) throw new Error("That code expired. Send a new one.");
  if (r.tries >= STEP_UP_TRIES) throw new Error("Too many wrong tries. Send a new code.");
  const { data: counted } = await supabaseAdmin.from("step_up_checks").update({ tries: r.tries + 1 }).eq("id", id).eq("tries", r.tries).select("id");
  if (!counted?.length) throw new Error("Try the code again.");
  const linkSecret = process.env.EMAIL_LINK_SECRET ?? "";
  if (!linkSecret || r.code_hash !== (await sha256Hex(`stepup|${id}|${userId}|${code}|${linkSecret}`))) throw new Error("That code doesn't match.");
  const { data: ok } = await supabaseAdmin.from("step_up_checks").update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending").select("id");
  if (!ok?.length) throw new Error("That code was already used.");
}

type CallbackQuery = { id?: string; data?: string; message?: { message_id?: number; chat?: { id?: number; type?: string } } };

/** "Yes, it's me" / "Decline" taps. Null when the button isn't a step-up button. */
export async function handleStepUpTap(cq: CallbackQuery): Promise<string | null> {
  const { parseStepUpData, stepUpSignatureOk, stepUpTapDecision } = await import("./rules");
  const parsed = parseStepUpData(cq.data);
  if (!parsed) return null;
  const { telegramActionKey, telegramCall } = await import("@/lib/telegram.server");
  const answer = (text: string, alert = false) =>
    cq.id ? telegramCall("answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {}) : Promise.resolve();
  const chatId = cq.message?.chat?.id;
  const { data: r } = await supabaseAdmin.from("step_up_checks").select("id, user_id, purpose, status, expires_at, telegram_chat_id").eq("id", parsed.id).maybeSingle();
  const tg = r ? await telegramTrust(r.user_id) : { chatId: null, row: null };
  const decision = stepUpTapDecision({
    choice: parsed.choice,
    signatureOk: r ? await stepUpSignatureOk(await telegramActionKey(), parsed, r.user_id) : false,
    privateChat: cq.message?.chat?.type === "private",
    tapChatId: String(chatId ?? ""),
    sentToChatId: r?.telegram_chat_id ?? null,
    ownerChatId: tg.chatId,
    ownerChatCounts: factorCounts(tg.row, Date.now()),
    status: r?.status ?? "missing",
    expiresAtMs: r ? Date.parse(r.expires_at) : 0,
    nowMs: Date.now(),
  });
  const edit = (text: string) => cq.message?.message_id && chatId
    ? telegramCall("editMessageText", { chat_id: chatId, message_id: cq.message.message_id, text, parse_mode: "HTML" }).catch(() => {})
    : Promise.resolve();
  if (decision === "refuse" || !r) { await answer("This button isn't valid for this chat.", true); return "stepup_refused"; }
  if (decision === "already_decided") { await answer("Already answered."); return "stepup_done"; }
  if (decision === "expired") { await edit("<b>Seeds</b>\nThat check expired. Nothing changed."); await answer("Expired."); return "stepup_expired"; }
  const status = decision === "approve" ? "approved" : "declined";
  const { data: set } = await supabaseAdmin.from("step_up_checks").update({ status, decided_at: new Date().toISOString() })
    .eq("id", r.id).eq("status", "pending").select("id");
  if (!set?.length) { await answer("Already answered."); return "stepup_done"; }
  await edit(decision === "approve"
    ? `✅ <b>Seeds</b>\nConfirmed. Go back to your Seeds screen to finish (${PURPOSE_TEXT[r.purpose as StepUpPurpose] ?? "the change"}).`
    : `🚫 <b>Seeds</b>\nDeclined. Nothing changed. If someone else is in your account, sign out of Honest.Money everywhere and contact support@honest.money.\n\n<a href="${SITE}/account/security">Open Security</a>`);
  await answer(decision === "approve" ? "Confirmed." : "Declined.");
  return `stepup_${status}`;
}

/* ------------------------------ trust bookkeeping ------------------------------ */

/**
 * After 2FA changed (browser said so; we re-read the sign-in service): record new apps — trusted only if this
 * session just proved it's the member — and forget removed ones. Returns how many new apps are unconfirmed.
 */
export async function syncFactorTrust(userId: string, claims: unknown): Promise<{ added: number; unconfirmed: number }> {
  const factors = await factorTrust(userId);
  const fresh = factors.filter((f) => !f.row);
  // S1 exception: only the first 2FA app on an account with none, added within 10 minutes of signing in.
  const firstOfKind = fresh.length === 1 && factors.length === 1;
  const recent = recentSignIn(claims as Claims, nowSec());
  let added = 0;
  for (const f of factors) {
    if (f.row) continue;
    const how = newFactorTrust({ firstOfKind, recentSignIn: recent });
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("second_factor_trust").insert({
      user_id: userId, kind: "totp", ref: f.id, added_at: f.createdAt, trusted_at: how ? now : null, trusted_how: how,
    });
    if (!error) added++;
  }
  const keep = factors.map((f) => f.id);
  let del = supabaseAdmin.from("second_factor_trust").delete().eq("user_id", userId).eq("kind", "totp");
  if (keep.length) del = del.not("ref", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  await del;
  const after = await factorTrust(userId);
  return { added, unconfirmed: after.filter((f) => !trusted(f.row)).length };
}

/** A Telegram chat was just linked. Trusted straight away only if the connect started trusted (first chat right after sign-in, or a passed step-up). */
export async function recordTelegramTrust(userId: string, chatId: string, codeTrusted: boolean, how: "fresh_sign_in" | "step_up" = "fresh_sign_in"): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin.from("second_factor_trust").delete().eq("user_id", userId).eq("kind", "telegram");
  await supabaseAdmin.from("second_factor_trust").insert({
    user_id: userId, kind: "telegram", ref: chatId, added_at: now, trusted_at: codeTrusted ? now : null, trusted_how: codeTrusted ? how : null,
  });
}

export async function forgetTelegramTrust(userId: string): Promise<void> {
  await supabaseAdmin.from("second_factor_trust").delete().eq("user_id", userId).eq("kind", "telegram");
}

/**
 * Member confirms ONE "Not confirmed yet" 2FA app (by id) or the Telegram chat (auditor S2), after proving it's
 * them with a sign-in made after that app / chat was added (S1) or a Telegram / email proof.
 */
export async function confirmFactor(userId: string, claims: unknown, subject: { kind: "totp"; factorId: string } | { kind: "telegram" }, proof: StepUpProof): Promise<void> {
  const now = new Date().toISOString();
  if (subject.kind === "telegram") {
    const tg = await telegramTrust(userId);
    if (!tg.chatId) throw new Error("Connect Telegram first.");
    if (!tg.row) { await recordTelegramTrust(userId, tg.chatId, false); throw new Error(STEP_UP_NEEDED); }
    if (trusted(tg.row)) return;
    const how = await requireStepUp(userId, claims, "confirm_factor", proof, tg.row.addedMs);
    await supabaseAdmin.from("second_factor_trust").update({ trusted_at: now, trusted_how: how })
      .eq("user_id", userId).eq("kind", "telegram").eq("ref", tg.chatId).is("trusted_at", null);
  } else {
    const f = (await factorTrust(userId)).find((x) => x.id === subject.factorId);
    if (!f) throw new Error("That 2FA app isn't on your account any more. Refresh the page.");
    if (trusted(f.row)) return;
    const how = await requireStepUp(userId, claims, "confirm_factor", proof, Date.parse(f.createdAt));
    if (!f.row) await supabaseAdmin.from("second_factor_trust").insert({ user_id: userId, kind: "totp", ref: f.id, added_at: f.createdAt, trusted_at: now, trusted_how: how });
    else await supabaseAdmin.from("second_factor_trust").update({ trusted_at: now, trusted_how: how })
      .eq("user_id", userId).eq("kind", "totp").eq("ref", f.id).is("trusted_at", null);
  }
  const { emailAccountChange } = await import("@/lib/email/send.server");
  await emailAccountChange(userId, subject.kind === "telegram" ? "Telegram chat" : "Two-factor app",
    [subject.kind === "telegram" ? "Your Telegram chat is now confirmed and can approve sends" : "One of your 2FA apps is now confirmed"],
    "sign out of Honest.Money everywhere and contact support@honest.money.").catch(() => undefined);
}

/**
 * S2: remove a 2FA app that is NOT confirmed yet, with no extra check — removing an untrusted app only makes the
 * account safer. Confirmed apps are removed through the normal 2FA settings (which need a code).
 */
export async function removeUnconfirmedFactor(userId: string, factorId: string): Promise<void> {
  const f = (await factorTrust(userId)).find((x) => x.id === factorId);
  if (!f) throw new Error("That 2FA app isn't on your account any more. Refresh the page.");
  if (trusted(f.row)) throw new Error("That 2FA app is confirmed. Remove it from Two-factor settings instead.");
  const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: factorId, userId });
  if (error) throw new Error("Couldn't remove that 2FA app. Try again.");
  await supabaseAdmin.from("second_factor_trust").delete().eq("user_id", userId).eq("kind", "totp").eq("ref", factorId);
  const { emailAccountChange } = await import("@/lib/email/send.server");
  await emailAccountChange(userId, "Two-factor app", ["Removed a 2FA app that wasn't confirmed yet"],
    "sign out of Honest.Money everywhere and contact support@honest.money.").catch(() => undefined);
}

/** What Security shows: each 2FA app (when added, its name) and the chat, confirmed or not, and when it counts. */
export async function myFactorTrust(userId: string): Promise<{
  totp: Array<{ id: string; name: string | null; addedAt: string; confirmed: boolean; countsFrom: string | null }>;
  telegram: { connected: boolean; confirmed: boolean; addedAt: string | null; countsFrom: string | null };
}> {
  const { AGED_MS } = await import("./rules");
  const [factors, tg] = await Promise.all([factorTrust(userId), telegramTrust(userId)]);
  const countsFrom = (r: TrustRow | null) => (r && r.trustedMs != null ? new Date(r.addedMs + AGED_MS).toISOString() : null);
  return {
    totp: factors.map((f) => ({ id: f.id, name: f.name, addedAt: f.createdAt, confirmed: trusted(f.row), countsFrom: countsFrom(f.row) })),
    telegram: { connected: Boolean(tg.chatId), confirmed: trusted(tg.row), addedAt: tg.row ? new Date(tg.row.addedMs).toISOString() : null, countsFrom: countsFrom(tg.row) },
  };
}
