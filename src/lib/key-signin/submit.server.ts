/**
 * POST /api/public/key-signin/submit — the Seeds Key page hands over a
 * signed sign-in plus one sealed trading pocket. Same checks as an HME Wallet
 * link (paths, key matches, single-use challenge, never fewer coins), plus:
 * the signer's identity picks (or creates) the Seeds account.
 */
import { ACCEPTED_CHAINS, ALLOWED_CHAINS, type LinkChain, chainForPath, checkXprvMatches, linkDomainFor, openSealed, parseExtKey, payloadSha256 } from "../hme-link.server";
import { replaceProblem } from "../hme-link-rules";
import { decryptDelegatedKey, encryptDelegatedKey } from "../delegation.server";
import { NEW_ACCOUNTS_PER_IP_HOUR, NEW_KEY_ACCOUNTS_ALARM_GAP_MS, NEW_KEY_ACCOUNTS_ALARM_PER_HOUR, secondAccountProblem, shouldAlarmNewAccounts, isKeyKind, keepExistingLink, keyHostOf, keySigninMessage, keysDiffer, normalizeIdentity, placeholderEmail, pocketFor, startingName, type KeyKind } from "./rules";
import { corsJson, ipHash, sha256Hex, verifyKeySignature } from "./signin.server";
import { requestIp } from "../ip-rate.server";

type Body = {
  token?: string; kind?: string; identity_address?: string; account?: number; paths?: string[];
  xpubs?: Record<string, string>; payload?: string; message?: string; signature?: string;
};

export async function handleKeySubmit(request: Request): Promise<Response> {
  let b: Body;
  try { b = (await request.json()) as Body; } catch { return corsJson({ error: "bad json" }, 400); }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (!b.token || !/^[A-Za-z0-9_-]{8,64}$/.test(b.token)) return corsJson({ error: "bad token" }, 400);
  if (!isKeyKind(b.kind)) return corsJson({ error: "bad kind" }, 400);
  const kind: KeyKind = b.kind;
  const identity = normalizeIdentity(kind, b.identity_address ?? "");
  if (!identity) return corsJson({ error: "bad identity" }, 400);
  if (!Number.isInteger(b.account)) return corsJson({ error: "bad account" }, 400);
  if (!Array.isArray(b.paths) || !b.paths.length || b.paths.length > ACCEPTED_CHAINS.length) return corsJson({ error: "bad paths" }, 400);
  if (typeof b.signature !== "string" || typeof b.message !== "string" || b.message.length > 4000) return corsJson({ error: "missing signature" }, 400);
  if (typeof b.payload !== "string" || b.payload.length > 20000) return corsJson({ error: "missing payload" }, 400);

  const { data: req } = await supabaseAdmin.from("key_signin_requests").select("*").eq("challenge_id", b.token).maybeSingle();
  if (!req || req.consumed_at || new Date(req.expires_at) < new Date()) return corsJson({ error: "expired" }, 410);

  const chains: LinkChain[] = [];
  for (const p of b.paths) {
    const c = chainForPath(p);
    if (!c || c.account !== b.account || chains.includes(c.chain)) return corsJson({ error: `refused path ${p}` }, 400);
    chains.push(c.chain);
  }
  for (const c of ALLOWED_CHAINS) if (!chains.includes(c)) return corsJson({ error: `missing ${c} pocket` }, 400);
  const xpubs: Record<string, string> = {};
  for (const c of chains) {
    const x = b.xpubs?.[c];
    if (!x) return corsJson({ error: `missing xpub ${c}` }, 400);
    try { parseExtKey(c, x); } catch { return corsJson({ error: `bad xpub ${c}` }, 400); }
    xpubs[c] = x;
  }

  const payloadSha = payloadSha256(b.payload);
  // Wallet sign-ins use the Sign-In with Ethereum / Solana layout bound to the Seeds Key host.
  const keyHost = keyHostOf(process.env.SEEDS_KEY_URL);
  if (kind !== "coin" && !keyHost) return corsJson({ error: "Wallet sign-in isn't switched on yet." }, 503);
  const expected = keySigninMessage({
    domain: linkDomainFor(request), challenge: req.challenge, kind, identity: b.identity_address!.trim(), account: b.account!, paths: b.paths, payloadSha,
    keyHost: keyHost ?? undefined, issuedAt: new Date(req.created_at).toISOString(), expiresAt: new Date(req.expires_at).toISOString(),
  });
  if (b.message !== expected) return corsJson({ error: "message mismatch", expected }, 400);
  if (!verifyKeySignature(kind, b.identity_address!.trim(), b.message, b.signature)) return corsJson({ error: "bad signature" }, 401);

  // Started by a signed-in Honest.Money member: the key joins THAT account as its trading pocket (link.server.ts).
  if (req.link_user_id) {
    const { submitKeyLink } = await import("./link.server");
    return submitKeyLink({
      token: b.token, linkUserId: req.link_user_id, recipientPrivCiphertext: req.recipient_priv_ciphertext, recipientPubkey: req.recipient_pubkey,
      kind, identity, account: b.account!, paths: b.paths, chains, xpubs, payload: b.payload,
    });
  }

  // Who is this? A coin/wallet account is found by its identity, never by email.
  const { data: prof } = await supabaseAdmin.from("profiles").select("id, hm_status")
    .eq("identity_kind", kind).eq("identity_address", identity).maybeSingle();
  if (prof && prof.hm_status && prof.hm_status !== "active" && prof.hm_status !== "oceanfront")
    return corsJson({ error: "This account is not active. Contact support@honest.money." }, 403);

  // Every pocket this identity ever linked, on any account (a phrase may also sit in someone's HME Wallet).
  const { data: history } = await supabaseAdmin.from("hme_links").select("user_id, account, status").eq("identity_address", identity);
  const activeElsewhere = (history ?? []).find((h) => h.status === "active" && h.user_id !== prof?.id);
  if (activeElsewhere) return corsJson({ error: "This key is already linked to an Honest.Money account on Seeds. Sign in with Honest.Money instead." }, 409);
  const second = secondAccountProblem({ keyAccountId: prof?.id ?? null, linkedOnAccounts: (history ?? []).map((h) => h.user_id).filter((u) => u !== prof?.id) });
  if (second) return corsJson({ error: second }, 409);
  const want = pocketFor((history ?? []).map((h) => ({ account: h.account, active: h.status === "active" })));
  if (b.account !== want) return corsJson({ error: "use_pocket", account: want }, 409);

  let keep: Record<string, string>;
  try {
    const xprvs = JSON.parse(openSealed(b.payload, await decryptDelegatedKey(req.recipient_priv_ciphertext, `signin-request:${b.token}`), req.recipient_pubkey)) as Record<string, string>;
    keep = {};
    for (const c of chains) {
      if (!xprvs[c] || !checkXprvMatches(c, xprvs[c], xpubs[c])) return corsJson({ error: `key mismatch ${c}` }, 400);
      keep[c] = xprvs[c];
    }
  } catch { return corsJson({ error: "cannot open payload" }, 400); }

  // Single use: burn the challenge before creating or changing anything.
  const { data: burned } = await supabaseAdmin.from("key_signin_requests")
    .update({ consumed_at: new Date().toISOString() }).eq("challenge_id", b.token).is("consumed_at", null).select("challenge_id");
  if (!burned?.length) return corsJson({ error: "already used" }, 409);

  let userId = prof?.id ?? null;
  let created = false;
  if (!userId) {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabaseAdmin.from("key_signin_requests").select("challenge_id", { count: "exact", head: true })
      .eq("ip_hash", ipHash(requestIp(request.headers))).eq("created_account", true).gte("created_at", since);
    if ((count ?? 0) >= NEW_ACCOUNTS_PER_IP_HOUR) return corsJson({ error: "Too many new accounts from this network. Try again in an hour." }, 429);
    const email = placeholderEmail(kind, sha256Hex(`${kind}|${identity}`));
    const u = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { identity_kind: kind, sso: "seeds-key" } });
    if (u.error || !u.data.user) return corsJson({ error: "Could not create your Seeds account. Try again." }, 500);
    userId = u.data.user.id;
    const { error: pe } = await supabaseAdmin.from("profiles").upsert({ id: userId, identity_kind: kind, identity_address: identity, display_name: startingName(kind, identity) }, { onConflict: "id" });
    if (pe) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return corsJson({ error: "This key already has a Seeds account. Try again." }, 409);
    }
    created = true;
    // Botnet alarm (auditor K6): page the admins when coin/wallet sign-ups across all of Seeds spike. Never blocks.
    const { count: hour } = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true })
      .in("identity_kind", ["coin", "evm", "sol"]).gte("created_at", since);
    // At or above the level, at most once every ten minutes: claim the single alarm row so only one caller pages.
    const { data: claimed } = shouldAlarmNewAccounts(hour ?? 0, null, Date.now())
      ? await supabaseAdmin.from("key_signin_alarm").update({ sent_at: new Date().toISOString() })
          .eq("id", 1).lt("sent_at", new Date(Date.now() - NEW_KEY_ACCOUNTS_ALARM_GAP_MS).toISOString()).select("id")
      : { data: null };
    if (claimed?.length) {
      const { alertAdmins } = await import("../alerts.server");
      await alertAdmins(`⚠️ <b>Seeds admin</b>\n${hour} new coin/wallet accounts in the last hour (alarm level ${NEW_KEY_ACCOUNTS_ALARM_PER_HOUR}). If there's no event running, check Admin → Users for a burst of empty accounts.`).catch(() => undefined);
    }
  }

  const { data: active } = await supabaseAdmin.from("hme_links").select("id, account, paths, mode, key_ciphertext, xpubs, created_at")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  const problem = replaceProblem(
    active ? { account: active.account, paths: active.paths as string[], mode: active.mode, hasKey: Boolean(active.key_ciphertext) } : null,
    { account: b.account!, chains, mode: "access" },
  );
  if (problem) return corsJson({ error: problem }, 409);

  // Different keys than the active link = security event (auditor follow-up): hold the swap until the
  // member's screen approves it (with a fresh authenticator code when they use one), and tell them first.
  if (active && keysDiffer({ account: active.account, xpubs: active.xpubs as Record<string, string> }, { account: b.account!, xpubs })) {
    const pendingId = crypto.randomUUID();
    const pending = { link_id: pendingId, account: b.account!, paths: b.paths, xpubs, identity, kind, key_ciphertext: await encryptDelegatedKey(JSON.stringify(keep), `link:${pendingId}`) };
    const { error: he } = await supabaseAdmin.from("key_signin_requests")
      .update({ user_id: userId, identity_kind: kind, created_account: false, replace_link_id: active.id, pending_link: pending })
      .eq("challenge_id", b.token);
    if (he) return corsJson({ error: "store failed" }, 500);
    const { warnKeyReplaceHeld } = await import("./replace.server");
    await warnKeyReplaceHeld({ userId, linkId: active.id, kind }).catch((e) => console.error("[key-signin] replace warning failed", e));
    return corsJson({ linked_to: "Seeds Exchange", signed_in: false, needs_confirm: true, new_account: false, pocket: b.account });
  }

  if (active && active.key_ciphertext) {
    const { twoFactorSinceMs } = await import("../two-factor.server");
    const { data: tg } = await supabaseAdmin.from("profiles").select("telegram_verified_at").eq("id", userId).maybeSingle();
    const keep = keepExistingLink({
      active: { account: active.account, xpubs: active.xpubs as Record<string, string>, createdMs: Date.parse(active.created_at) },
      incoming: { account: b.account!, xpubs },
      twoFactorSinceMs: await twoFactorSinceMs(userId).catch(() => null),
      telegramSinceMs: tg?.telegram_verified_at ? Date.parse(tg.telegram_verified_at) : null,
    });
    if (keep) {
      await supabaseAdmin.from("key_signin_requests").update({ user_id: userId, identity_kind: kind, created_account: false }).eq("challenge_id", b.token);
      return corsJson({ linked_to: "Seeds Exchange", signed_in: true, new_account: false, pocket: b.account });
    }
  }
  if (active) {
    await supabaseAdmin.from("hme_links").update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "replaced", key_ciphertext: null }).eq("id", active.id);
    await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", active.id).eq("status", "pending");
  }
  const newLinkId = crypto.randomUUID();
  const { error: le } = await supabaseAdmin.from("hme_links").insert({
    id: newLinkId, user_id: userId, mode: "access", account: b.account!, paths: b.paths, identity_address: identity,
    xpubs, key_ciphertext: await encryptDelegatedKey(JSON.stringify(keep), `link:${newLinkId}`), source: "seeds_key", key_kind: kind,
  });
  if (le) return corsJson({ error: "store failed" }, 500);

  await supabaseAdmin.from("key_signin_requests").update({ user_id: userId, identity_kind: kind, created_account: created }).eq("challenge_id", b.token);
  return corsJson({ linked_to: "Seeds Exchange", signed_in: true, new_account: created, pocket: b.account });
}
