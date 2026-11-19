import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import {
  p2pkhAddressFromPubkey,
  p2wpkhAddressFromPubkey,
  evmAddressFromPubkey,
} from "@/lib/wallet/vault";
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
 * Retired (audit #2, 2026-11-19, H3). Browser-vault authorizations handed Seeds a key that
 * could send without withdrawal levels, two-factor or a Telegram tap. Nobody ever held one,
 * and the database now refuses new rows too. Trading uses the HME Wallet link instead.
 */
export const grantAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(grantInput)
  .handler(async (): Promise<{ ok: true; expiresAt: string }> => {
    throw new Error("Old trading authorizations are retired. Link your HME Wallet from Account → Security instead.");
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
