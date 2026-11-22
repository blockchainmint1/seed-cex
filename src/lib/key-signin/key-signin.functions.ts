import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const kindSchema = z.enum(["coin", "wallet"]);

/**
 * Start "Start with a coin" / "Use another wallet": a single-use request the
 * Seeds Key page reads. The browser keeps `secret`; only it can collect the session.
 */
export const startKeySignin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ origin: z.string().url().max(200), kind: kindSchema }).parse(d))
  .handler(async ({ data }) => {
    const { requireIpAllowance, requestIp } = await import("../ip-rate.server");
    const { KEY_START_PER_MINUTE, KEY_REQUEST_TTL_MS, pairingCode } = await import("./rules");
    await requireIpAllowance("key-signin-start", KEY_START_PER_MINUTE);
    const { getRequest } = await import("@tanstack/react-start/server");
    const { newRecipientKeypair } = await import("../hme-link.server");
    const { encryptDelegatedKey } = await import("../delegation.server");
    const { ipHash, sha256Hex } = await import("./signin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => x.toString(16).padStart(2, "0")).join("");
    const kp = newRecipientKeypair();
    const id = rnd(16);
    const secret = rnd(32);
    const challenge = rnd(24);
    // Issued (created_at) and expiry from one clock reading: exactly the request lifetime,
    // which the signed HME Vault request needs (≤ 10 minutes, canonical times).
    const { keyRequestWindow } = await import("./vault-request");
    const { createdAt, expiresAt } = keyRequestWindow(Date.now(), KEY_REQUEST_TTL_MS);
    const { error } = await supabaseAdmin.from("key_signin_requests").insert({
      created_at: createdAt, challenge_id: id, challenge, browser_secret_hash: sha256Hex(secret),
      recipient_priv_ciphertext: encryptDelegatedKey(kp.priv), recipient_pubkey: kp.pub,
      ip_hash: ipHash(requestIp(getRequest().headers)), expires_at: expiresAt,
    });
    if (error) throw new Error("Couldn't start sign-in. Try again.");
    const origin = new URL(data.origin).origin;
    const manifestUrl = `${origin}/api/public/key-signin/manifest/${id}`;
    const base = (process.env.SEEDS_KEY_URL ?? "").trim().replace(/\/+$/, "");
    const keyPageUrl = /^https:\/\/[a-z0-9.-]+(:\d+)?(\/.*)?$/i.test(base)
      ? `${base}/?kind=${data.kind}&r=${encodeURIComponent(manifestUrl)}`
      : null;
    // Shown here and on the Seeds Key page; the member continues only when they match (auditor K2).
    return { id, secret, manifestUrl, keyPageUrl, expiresAt, pairCode: pairingCode(challenge) };
  });

/** The browser that started the request asks whether the Seeds Key page finished; once, it gets a session. */
export const claimKeySignin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), secret: z.string().regex(/^[a-f0-9]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { sameDigest, sha256Hex } = await import("./signin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("key_signin_requests")
      .select("browser_secret_hash, expires_at, consumed_at, user_id, created_account, claimed_at, replace_link_id, pending_link").eq("challenge_id", data.id).maybeSingle();
    if (!r || !sameDigest(r.browser_secret_hash, sha256Hex(data.secret))) return { status: "expired" as const };
    if (r.claimed_at) return { status: "used" as const };
    if (!r.consumed_at || !r.user_id) return { status: new Date(r.expires_at) < new Date() ? ("expired" as const) : ("waiting" as const) };
    const { data: won } = await supabaseAdmin.from("key_signin_requests").update({ claimed_at: new Date().toISOString() })
      .eq("challenge_id", data.id).is("claimed_at", null).select("challenge_id");
    if (!won?.length) return { status: "used" as const };
    const { isKeyKind, shortKeyName } = await import("./rules");
    const { data: p } = await supabaseAdmin.from("profiles").select("identity_kind, identity_address").eq("id", r.user_id).maybeSingle();
    const who = p && isKeyKind(p.identity_kind) && p.identity_address ? shortKeyName(p.identity_kind, p.identity_address) : "this key";
    // Different pocket keys than the active link: nothing is applied or signed in until this screen approves
    // (with a fresh authenticator code when the member uses one) — see replace.server.ts.
    if (r.replace_link_id && r.pending_link) {
      const { hasTwoFactor } = await import("../two-factor.server");
      return { status: "replace" as const, who, needsCode: await hasTwoFactor(r.user_id) };
    }
    const u = await supabaseAdmin.auth.admin.getUserById(r.user_id);
    const email = u.data.user?.email;
    if (!email) throw new Error("Couldn't open your Seeds account. Try again.");
    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties?.hashed_token || link.data.user?.id !== r.user_id) throw new Error("Couldn't start a session. Try again.");
    const { alertSignIn } = await import("../alerts.server");
    await alertSignIn({ userId: r.user_id }).catch(() => undefined);
    // Who signed in, so the tab can ask "is this your coin?" before opening the account (auditor K2).
    return { status: "ready" as const, tokenHash: link.data.properties.hashed_token, isNew: r.created_account, who };
  });

const replaceInput = (d: unknown) =>
  z.object({ id: z.string().regex(/^[a-f0-9]{32}$/), secret: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().regex(/^\d{6}$/).nullable().default(null) }).parse(d);

async function startingScreen(id: string, secret: string) {
  const { sameDigest, sha256Hex } = await import("./signin.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: r } = await supabaseAdmin.from("key_signin_requests").select("browser_secret_hash, claimed_at, user_id").eq("challenge_id", id).maybeSingle();
  if (!r || !r.claimed_at || !r.user_id || !sameDigest(r.browser_secret_hash, sha256Hex(secret))) throw new Error("That sign-in ran out. Start again.");
  return r.user_id;
}

/** The starting screen approves a held pocket-key change; on success it gets the session like a normal sign-in. */
export const confirmKeyReplace = createServerFn({ method: "POST" })
  .inputValidator(replaceInput)
  .handler(async ({ data }) => {
    const userId = await startingScreen(data.id, data.secret);
    const { confirmHeldReplace } = await import("./replace.server");
    await confirmHeldReplace({ challengeId: data.id, code: data.code });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const u = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = u.data.user?.email;
    if (!email) throw new Error("Couldn't open your Seeds account. Try again.");
    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties?.hashed_token || link.data.user?.id !== userId) throw new Error("Couldn't start a session. Try again.");
    const { alertSignIn } = await import("../alerts.server");
    await alertSignIn({ userId }).catch(() => undefined);
    return { tokenHash: link.data.properties.hashed_token };
  });

/** The starting screen said "not mine": throw the held pocket keys away. */
export const dropKeyReplace = createServerFn({ method: "POST" })
  .inputValidator(replaceInput)
  .handler(async ({ data }) => {
    await startingScreen(data.id, data.secret);
    const { dropHeldReplace } = await import("./replace.server");
    await dropHeldReplace(data.id);
    return { ok: true };
  });

/** How this account signs in, and whether it still needs a real email. */
export const getMyIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isPlaceholderEmail } = await import("./rules");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: p }, u] = await Promise.all([
      supabaseAdmin.from("profiles").select("identity_kind, identity_address, hm_member_id").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(context.userId),
    ]);
    const email = u.data.user?.email ?? null;
    return {
      kind: (p?.identity_kind ?? "hme") as "hme" | "coin" | "evm" | "sol",
      identityAddress: p?.identity_address ?? null,
      hmeMember: Boolean(p?.hm_member_id),
      email: isPlaceholderEmail(email) ? null : email,
    };
  });

function codeDigest(secret: string, userId: string, email: string, code: string): string {
  // Imported lazily by callers inside handlers only.
  return `${userId}|${email}|${code}|${secret}`;
}

/** Coin / wallet accounts: email a 6-digit code to the address they want to add. */
export const requestAccountEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ email: z.string().max(254) }).parse(d))
  .handler(async ({ data, context }) => {
    const { cleanEmail, isPlaceholderEmail, accountEmailProblem, EMAIL_CODE_TTL_MS, EMAIL_CODES_PER_HOUR } = await import("./rules");
    const { newEmailCode } = await import("../withdraw/rules");
    const { sha256Hex } = await import("./signin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sesConfigured } = await import("../email/ses.server");
    const { deliver } = await import("../email/send.server");
    const email = cleanEmail(data.email);
    if (!email) throw new Error("Enter a real email address.");
    const u = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (!isPlaceholderEmail(u.data.user?.email)) throw new Error("Your account already has an email. Honest.Money members change it at Honest.Money.");
    // The email becomes a withdrawal factor, so with two-factor on it needs a fresh code (auditor K3).
    const { hasTwoFactor } = await import("../two-factor.server");
    const { freshTwoFactor } = await import("../two-factor");
    const problem = accountEmailProblem({ twoFactorOn: await hasTwoFactor(context.userId), fresh: freshTwoFactor(context.claims as never, Math.floor(Date.now() / 1000)) });
    if (problem) throw new Error(problem);
    if (!sesConfigured()) throw new Error("Seeds can't send email right now. Try again later.");
    const { count } = await supabaseAdmin.from("account_email_codes").select("id", { count: "exact", head: true })
      .eq("user_id", context.userId).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= EMAIL_CODES_PER_HOUR) throw new Error("Too many codes this hour. Wait a bit and try again.");
    const code = newEmailCode();
    const secret = process.env.EMAIL_LINK_SECRET ?? "";
    if (!secret) throw new Error("Seeds can't send email right now. Try again later.");
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();
    const { error } = await supabaseAdmin.from("account_email_codes").insert({
      user_id: context.userId, email, code_hash: sha256Hex(codeDigest(secret, context.userId, email, code)), expires_at: expiresAt,
    });
    if (error) throw new Error("Couldn't send the code. Try again.");
    await deliver(email, "account-change", {
      name: "there", thing: "Email confirmation", at: new Date().toISOString(), timezone: "UTC",
      changes: [`Your Seeds confirmation code is ${code}`, "It works once, for 10 minutes."],
      ifNotYou: "ignore this email. Nothing changes unless the code is entered on Seeds.",
    });
    return { sentTo: email, expiresAt };
  });

/** Confirm the code; the address becomes the account's email (used for withdrawal codes and notices). */
export const confirmAccountEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { isPlaceholderEmail, EMAIL_CODE_TRIES } = await import("./rules");
    const { sameDigest, sha256Hex } = await import("./signin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const u = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (!isPlaceholderEmail(u.data.user?.email)) throw new Error("Your account already has an email.");
    const { data: row } = await supabaseAdmin.from("account_email_codes").select("id, email, code_hash, tries, expires_at, used_at")
      .eq("user_id", context.userId).is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) throw new Error("That code expired. Send a new one.");
    if (row.tries >= EMAIL_CODE_TRIES) throw new Error("Too many wrong tries. Send a new code.");
    const secret = process.env.EMAIL_LINK_SECRET ?? "";
    if (!sameDigest(row.code_hash, sha256Hex(codeDigest(secret, context.userId, row.email, data.code)))) {
      await supabaseAdmin.from("account_email_codes").update({ tries: row.tries + 1 }).eq("id", row.id);
      throw new Error("That code doesn't match.");
    }
    const { data: used } = await supabaseAdmin.from("account_email_codes").update({ used_at: new Date().toISOString() })
      .eq("id", row.id).is("used_at", null).select("id");
    if (!used?.length) throw new Error("That code was already used.");
    const changed = await supabaseAdmin.auth.admin.updateUserById(context.userId, { email: row.email, email_confirm: true });
    if (changed.error) throw new Error("That email already belongs to another Seeds account.");
    const { emailAccountChange } = await import("../email/send.server");
    await emailAccountChange(context.userId, "Account email", [`Seeds will now email ${row.email} for withdrawals and account notices`]);
    // Also tell the member's Telegram: the new inbox can't be the only place that hears about it (auditor K3).
    const { alertAccountEmailAdded } = await import("../alerts.server");
    await alertAccountEmailAdded({ userId: context.userId, email: row.email }).catch(() => undefined);
    return { email: row.email };
  });
