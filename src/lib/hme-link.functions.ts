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
      recipient_priv_ciphertext: encryptDelegatedKey(kp.priv), recipient_pubkey: kp.pub, expires_at: expires,
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
      .select("id, mode, account, paths, xpubs, created_at")
      .eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (error) throw new Error("Could not read your HME Wallet link. Try again.");
    const addresses: Record<string, string> = {};
    if (data) {
      const { pocketAddress } = await import("./hme-pocket");
      const { chainForPath } = await import("./hme-link.server");
      const xpubs = data.xpubs as Record<string, string>;
      for (const path of data.paths as string[]) {
        const info = chainForPath(path);
        if (!info || info.account !== data.account || !xpubs[info.chain]) continue;
        addresses[info.chain] = pocketAddress(info.chain, xpubs[info.chain]);
      }
    }
    let pending = 0;
    if (data) {
      const { count } = await supabaseAdmin.from("hme_trade_proposals").select("id", { count: "exact", head: true })
        .eq("link_id", data.id).eq("status", "pending");
      pending = count ?? 0;
    }
    return data ? { id: data.id, mode: data.mode, account: data.account, paths: data.paths as string[], created_at: data.created_at, addresses, pending } : null;
  });

export const revokeMyHmeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("hme_links")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "seeds", key_ciphertext: null })
      .eq("user_id", context.userId).eq("status", "active").select("id");
    for (const l of data ?? []) {
      await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", l.id).eq("status", "pending");
    }
    return { ok: true };
  });
