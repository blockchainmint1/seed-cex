import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { p2pkhAddressFromPubkey, evmAddressFromPubkey } from "@/lib/wallet/vault";
import { CHAIN_IDS, getChain, type ChainId } from "@/lib/chains";
import { z } from "zod";

export type Authorization = {
  chain: ChainId;
  asset: string;
  address: string;
  path: string;
  maxAmount: number;
  expiresAt: string;
  createdAt: string;
  label: string | null;
};

const grantInput = (input: unknown) =>
  z
    .object({
      chain: z.enum(CHAIN_IDS),
      asset: z.string().trim().min(2).max(12),
      privateKeyHex: z.string().regex(/^[0-9a-fA-F]{64}$/, "Malformed authorized key"),
      address: z.string().trim().min(20).max(120),
      path: z.string().trim().min(6).max(64),
      maxAmount: z.number().positive().max(100_000_000),
      hours: z.number().int().min(1).max(8_760),
      label: z.string().trim().max(60).optional(),
    })
    .parse(input);

/**
 * List the caller's live authorizations.
 *
 * Reads always sweep first: an expired authorization is *deleted*, not hidden,
 * so what you see here is exactly what Seeds physically holds.
 */
export const listAuthorizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Authorization[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.rpc("purge_expired_delegations");
    const { data, error } = await supabaseAdmin
      .from("wallet_delegations")
      .select("chain, asset, trading_address, trading_path, max_amount, expires_at, created_at, label")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return (data ?? [])
      .filter((d) => new Date(d.expires_at).getTime() > Date.now())
      .map((d) => ({
        chain: d.chain as ChainId,
        asset: d.asset,
        address: d.trading_address,
        path: d.trading_path,
        maxAmount: Number(d.max_amount),
        expiresAt: d.expires_at,
        createdAt: d.created_at,
        label: d.label,
      }));
  });

/**
 * Authorize a capped, expiring slice of the caller's wallet on one chain.
 *
 * What is handed over is a *branch* key (account 9'), never the seed and never
 * the savings branch. The server proves the key matches the address it claims
 * before storing it, encrypted, under SEEDS_DELEGATION_KEY.
 */
export const grantAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(grantInput)
  .handler(async ({ data, context }) => {
    const chain = getChain(data.chain);
    if (data.path !== chain.sharedPath) {
      throw new Error("Only the dedicated trading branch can be authorized");
    }
    if (!chain.assets.some((a) => a.symbol === data.asset)) {
      throw new Error(`${data.asset} is not supported on ${chain.name}`);
    }

    // Never trust the claimed address — re-derive it from the key.
    const priv = hexToBytes(data.privateKeyHex.toLowerCase());
    const derived =
      chain.evmChainId === null
        ? p2pkhAddressFromPubkey(secp256k1.getPublicKey(priv, true), chain.p2pkhVersion ?? 66)
        : evmAddressFromPubkey(secp256k1.getPublicKey(priv, false));
    if (derived.toLowerCase() !== data.address.toLowerCase()) {
      throw new Error("The authorized key does not match its address");
    }

    const { encryptDelegatedKey } = await import("@/lib/delegation.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const expires = new Date(Date.now() + data.hours * 3_600_000).toISOString();
    const { error } = await supabaseAdmin.from("wallet_delegations").upsert(
      {
        user_id: context.userId,
        chain: data.chain,
        asset: data.asset,
        trading_path: data.path,
        trading_address: derived,
        key_ciphertext: encryptDelegatedKey(data.privateKeyHex.toLowerCase()),
        max_amount: data.maxAmount,
        expires_at: expires,
        revoked_at: null,
        label: data.label ?? null,
      },
      { onConflict: "user_id,chain,asset" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, expiresAt: expires };
  });

/** Revocation is a hard DELETE — the ciphertext stops existing. */
export const revokeAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ chain: z.enum(CHAIN_IDS), asset: z.string().trim().min(2).max(12).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("wallet_delegations")
      .delete()
      .eq("user_id", context.userId)
      .eq("chain", data.chain);
    if (data.asset) q = q.eq("asset", data.asset);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revokeAllAuthorizations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wallet_delegations")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
