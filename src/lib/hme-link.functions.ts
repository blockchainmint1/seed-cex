import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Starts a link: mints a single-use challenge + X25519 recipient key. Returns the manifest URL the wallet scans. */
export const startHmeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { origin: string }) => d)
  .handler(async ({ data, context }) => {
    const { newRecipientKeypair } = await import("./hme-link.server");
    const { encryptDelegatedKey } = await import("./delegation.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => x.toString(16).padStart(2, "0")).join("");
    const kp = newRecipientKeypair();
    const challengeId = rnd(16);
    const expires = new Date(Date.now() + 10 * 60_000).toISOString();
    const { error } = await supabaseAdmin.from("hme_link_requests").insert({
      challenge_id: challengeId, challenge: rnd(24), user_id: context.userId,
      recipient_priv_ciphertext: await encryptDelegatedKey(kp.priv, `link-request:${challengeId}`), recipient_pubkey: kp.pub, expires_at: expires,
    });
    if (error) throw new Error("Could not start link");
    const origin = new URL(data.origin).origin;
    return { manifestUrl: `${origin}/api/public/hme-link/manifest/${challengeId}`, expiresAt: expires };
  });

export const getMyHmeLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("hme_links")
      .select("id, mode, account, paths, xpubs, created_at, identity_address, key_ciphertext, vault_fingerprint")
      .eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (error) throw new Error("Could not read your HME Wallet link. Try again.");
    // Most recent retired link, so the user can tell which wallet/pocket used to hold their funds.
    const { data: prior } = await supabaseAdmin.from("hme_links")
      .select("identity_address, account, revoked_at, created_at")
      .eq("user_id", context.userId).eq("status", "revoked")
      .order("revoked_at", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    // "Add new coins" just went through: the link it replaced, if that happened in the last 15 minutes.
    let justUpdated: { at: string; added: string[] } | null = null;
    if (data) {
      const { data: replaced } = await supabaseAdmin.from("hme_links")
        .select("account, paths, revoked_at, revoked_by").eq("user_id", context.userId).eq("status", "revoked")
        .gte("revoked_at", new Date(Date.now() - 15 * 60_000).toISOString())
        .order("revoked_at", { ascending: false }).limit(1).maybeSingle();
      // Only the link this one replaced (retired in the same submit), not an older revoke-and-relink.
      const sameSubmit = replaced && Math.abs(new Date(replaced.revoked_at as string).getTime() - new Date(data.created_at).getTime()) < 60_000;
      if (replaced && replaced.revoked_by === "replaced" && sameSubmit && replaced.account === data.account) {
        const { linkCoins } = await import("./hme-link-rules");
        const before = linkCoins({ account: replaced.account, paths: replaced.paths as string[] });
        justUpdated = { at: replaced.revoked_at as string, added: linkCoins({ account: data.account, paths: data.paths as string[] }).filter((c) => !before.includes(c)) };
      }
    }
    const addresses: Record<string, string> = {};
    if (data) {
      const { pocketReceiveAddress } = await import("./pockets/derive");
      const { chainForPath } = await import("./hme-link.server");
      const xpubs = data.xpubs as Record<string, string>;
      for (const path of data.paths as string[]) {
        const info = chainForPath(path);
        if (!info || info.account !== data.account || !xpubs[info.chain]) continue;
        try { addresses[info.chain] = pocketReceiveAddress(info.chain, xpubs[info.chain]); } catch { /* skip malformed legacy row */ }
      }
    }
    // Withdrawals only go out from a link made after two-factor was turned on.
    let withdrawals: "ready" | "needs_2fa" | "needs_relink" | "unknown" = "unknown";
    if (data) {
      try {
        const { twoFactorSinceMs } = await import("./two-factor.server");
        const { withdrawLinkState } = await import("./two-factor");
        withdrawals = withdrawLinkState({ twoFactorSinceMs: await twoFactorSinceMs(context.userId), linkCreatedMs: Date.parse(data.created_at) });
      } catch { /* shown as unknown; withdrawals re-check on the server anyway */ }
    }
    let pending = 0;
    if (data) {
      const { count } = await supabaseAdmin.from("hme_trade_proposals").select("id", { count: "exact", head: true })
        .eq("link_id", data.id).eq("status", "pending");
      pending = count ?? 0;
    }
    return data
      ? {
          id: data.id, mode: data.mode, account: data.account, paths: data.paths as string[],
          created_at: data.created_at, addresses, pending,
          identityAddress: data.identity_address as string,
          /** HME Vault seed ID this pocket was linked with ("Vault 73c5da0a"), display only. */
          vaultName: data.vault_fingerprint ? `Vault ${data.vault_fingerprint}` : null,
          keyHeld: Boolean(data.key_ciphertext),
          justUpdated,
          withdrawals,
          previous: prior && prior.identity_address !== data.identity_address
            ? { identityAddress: prior.identity_address as string, account: prior.account, revokedAt: prior.revoked_at as string, createdAt: prior.created_at as string }
            : null,
        }
      : null;
  });

export const revokeMyHmeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeActiveHmeLinks } = await import("./hme-link-revoke.server");
    await revokeActiveHmeLinks(context.userId, "seeds");
    return { ok: true };
  });

/** The member's own wallet-link history: every link, update and revoke (no keys, no xpubs). */
export const getMyHmeLinkHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("hme_links")
      .select("id, mode, account, paths, identity_address, status, created_at, revoked_at, revoked_by")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error("Could not read your wallet link history. Try again.");
    const { buildLinkHistory } = await import("./hme-link-history");
    return buildLinkHistory((data ?? []).map((r) => ({ ...r, paths: r.paths as string[] })));
  });
