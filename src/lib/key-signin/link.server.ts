/**
 * Link mode for POST /api/public/key-signin/submit (Bobby, Nov 22 2026): a member signed in with
 * Honest.Money links a Cold Storage Coin, HME Vault or outside wallet as the trading pocket of the
 * account they're already in. The request was started by that signed-in member (key_signin_requests.link_user_id).
 *
 * - Never creates, merges or signs into another account (keyLinkProblem).
 * - A new key never becomes the pocket on its own: it is held on the request and only the member's
 *   signed-in screen applies it (confirmKeyLink → confirmHeldReplace), with a fresh authenticator code
 *   when two-factor is on. That screen shows the key's short name, so a hijacked QR can't slip in other keys.
 * - The same key as the active link is a refresh (same as signing in again): no approval needed.
 */
import type { LinkChain } from "../hme-link.server";
import { checkXprvMatches, openSealed } from "../hme-link.server";
import { replaceProblem } from "../hme-link-rules";
import { decryptDelegatedKey, encryptDelegatedKey } from "../delegation.server";
import { keepExistingLink, keyLinkOutcome, keyLinkProblem, keysDiffer, pocketFor, type KeyKind } from "./rules";
import { REQUEST_UNLOCK_FAILED, corsJson } from "./signin.server";

export async function submitKeyLink(p: {
  token: string;
  linkUserId: string;
  recipientPrivCiphertext: string;
  recipientPubkey: string;
  kind: KeyKind;
  identity: string;
  account: number;
  paths: string[];
  chains: LinkChain[];
  xpubs: Record<string, string>;
  payload: string;
}): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const userId = p.linkUserId;
  const [{ data: member }, { data: keyAccount }, { data: history }, { data: active }] = await Promise.all([
    supabaseAdmin.from("profiles").select("identity_kind, hm_status").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("profiles").select("id").eq("identity_kind", p.kind).eq("identity_address", p.identity).maybeSingle(),
    supabaseAdmin.from("hme_links").select("user_id, account, status").eq("identity_address", p.identity),
    supabaseAdmin.from("hme_links").select("id, account, paths, mode, key_ciphertext, xpubs, created_at")
      .eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  if (!member) return corsJson({ error: "expired" }, 410);
  if (member.hm_status && member.hm_status !== "active" && member.hm_status !== "oceanfront")
    return corsJson({ error: "This account is not active. Contact support@honest.money." }, 403);

  const memberActive = active
    ? { sameKeys: !keysDiffer({ account: active.account, xpubs: active.xpubs as Record<string, string> }, { account: p.account, xpubs: p.xpubs }) }
    : null;
  const problem = keyLinkProblem({
    memberKind: member.identity_kind ?? "hme",
    keyAccountId: keyAccount?.id ?? null,
    memberId: userId,
    activeElsewhere: (history ?? []).some((h) => h.status === "active" && h.user_id !== userId),
    memberActive,
  });
  if (problem) return corsJson({ error: problem }, 409);
  const want = pocketFor((history ?? []).map((h) => ({ account: h.account, active: h.status === "active" })));
  if (p.account !== want) return corsJson({ error: "use_pocket", account: want }, 409);
  const dropped = replaceProblem(
    active ? { account: active.account, paths: active.paths as string[], mode: active.mode, hasKey: Boolean(active.key_ciphertext) } : null,
    { account: p.account, chains: p.chains, mode: "access" },
  );
  if (dropped) return corsJson({ error: dropped }, 409);

  let recipientPriv: string;
  try { recipientPriv = await decryptDelegatedKey(p.recipientPrivCiphertext, `signin-request:${p.token}`); }
  catch { return corsJson({ error: REQUEST_UNLOCK_FAILED }, 503); }
  let keep: Record<string, string>;
  try {
    const xprvs = JSON.parse(openSealed(p.payload, recipientPriv, p.recipientPubkey)) as Record<string, string>;
    keep = {};
    for (const c of p.chains) {
      if (!xprvs[c] || !checkXprvMatches(c, xprvs[c], p.xpubs[c]!)) return corsJson({ error: `key mismatch ${c}` }, 400);
      keep[c] = xprvs[c];
    }
  } catch { return corsJson({ error: "cannot open payload" }, 400); }

  // Single use: burn the challenge before changing anything.
  const { data: burned } = await supabaseAdmin.from("key_signin_requests")
    .update({ consumed_at: new Date().toISOString() }).eq("challenge_id", p.token).is("consumed_at", null).select("challenge_id");
  if (!burned?.length) return corsJson({ error: "already used" }, 409);

  if (keyLinkOutcome(memberActive) === "hold") {
    // Sealed for the link id it will get, so the KMS context matches when the screen applies it.
    const pendingId = crypto.randomUUID();
    const pending = {
      link_id: pendingId, account: p.account, paths: p.paths, xpubs: p.xpubs, identity: p.identity, kind: p.kind,
      key_ciphertext: await encryptDelegatedKey(JSON.stringify(keep), `link:${pendingId}`),
    };
    const { error } = await supabaseAdmin.from("key_signin_requests")
      .update({ user_id: userId, identity_kind: p.kind, created_account: false, replace_link_id: active?.id ?? null, pending_link: pending })
      .eq("challenge_id", p.token);
    if (error) return corsJson({ error: "store failed" }, 500);
    // H2: warn before the member's screen can apply it.
    const { warnKeyLinkHeld } = await import("./replace.server");
    await warnKeyLinkHeld({ userId, kind: p.kind, activeLinkId: active?.id ?? null }).catch(() => undefined);
    return corsJson({ linked_to: "Seeds Exchange", signed_in: false, needs_confirm: true, new_account: false, pocket: p.account });
  }

  // Same key as the active link: a refresh, exactly like signing in again.
  const { twoFactorSinceMs } = await import("../two-factor.server");
  const { data: tg } = await supabaseAdmin.from("profiles").select("telegram_verified_at").eq("id", userId).maybeSingle();
  const stays = active!.key_ciphertext && keepExistingLink({
    active: { account: active!.account, xpubs: active!.xpubs as Record<string, string>, createdMs: Date.parse(active!.created_at) },
    incoming: { account: p.account, xpubs: p.xpubs },
    twoFactorSinceMs: await twoFactorSinceMs(userId).catch(() => null),
    telegramSinceMs: tg?.telegram_verified_at ? Date.parse(tg.telegram_verified_at) : null,
  });
  if (!stays) {
    const { data: revoked } = await supabaseAdmin.from("hme_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "replaced", key_ciphertext: null })
      .eq("id", active!.id).eq("status", "active").select("id");
    if (!revoked?.length) return corsJson({ error: "Your trading pocket changed in the meantime. Start again." }, 409);
    await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", active!.id).eq("status", "pending");
    const newLinkId = crypto.randomUUID();
    const { error: le } = await supabaseAdmin.from("hme_links").insert({
      id: newLinkId, user_id: userId, mode: "access", account: p.account, paths: p.paths, identity_address: p.identity,
      xpubs: p.xpubs, key_ciphertext: await encryptDelegatedKey(JSON.stringify(keep), `link:${newLinkId}`), source: "seeds_key", key_kind: p.kind,
    });
    if (le) return corsJson({ error: "store failed" }, 500);
  }
  await supabaseAdmin.from("key_signin_requests")
    .update({ user_id: userId, identity_kind: p.kind, created_account: false, replaced_at: new Date().toISOString() })
    .eq("challenge_id", p.token);
  return corsJson({ linked_to: "Seeds Exchange", signed_in: true, new_account: false, pocket: p.account });
}
