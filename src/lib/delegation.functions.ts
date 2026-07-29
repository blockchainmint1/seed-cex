import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { txcAddressFromPubkey } from "@/lib/wallet/vault";

export type DelegationStatus = {
  active: boolean;
  tradingAddress: string | null;
  tradingPath: string | null;
  maxAmount: number;
  expiresAt: string | null;
  revokedAt: string | null;
};

export const getSharedAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DelegationStatus> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Expired keys are wiped, not merely hidden — sweep before reading.
    await supabaseAdmin.rpc("purge_expired_delegations");
    const { data, error } = await supabaseAdmin
      .from("wallet_delegations")
      .select("trading_txc_address, trading_path, max_amount, expires_at, revoked_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        active: false,
        tradingAddress: null,
        tradingPath: null,
        maxAmount: 0,
        expiresAt: null,
        revokedAt: null,
      };
    }
    const live = !data.revoked_at && new Date(data.expires_at).getTime() > Date.now();
    return {
      active: live,
      tradingAddress: data.trading_txc_address,
      tradingPath: data.trading_path,
      maxAmount: Number(data.max_amount),
      expiresAt: data.expires_at,
      revokedAt: data.revoked_at,
    };
  });

export const grantSharedAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      privateKeyHex: string;
      tradingAddress: string;
      tradingPath: string;
      maxAmount: number;
      days: number;
    }) => {
      if (!/^[0-9a-f]{64}$/i.test(input.privateKeyHex)) throw new Error("Malformed trading key");
      if (!input.tradingAddress || input.tradingAddress.length > 120) {
        throw new Error("Malformed trading address");
      }
      if (!input.tradingPath.startsWith("m/44'/0'/9'")) {
        throw new Error("Only the dedicated trading branch can be shared");
      }
      if (!(input.maxAmount > 0) || input.maxAmount > 1_000_000) {
        throw new Error("Set a spending cap between 0 and 1,000,000 TXC");
      }
      if (!Number.isInteger(input.days) || input.days < 1 || input.days > 365) {
        throw new Error("Choose an expiry between 1 and 365 days");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    // The key must actually belong to the address it claims — no blind trust.
    const pub = secp256k1.getPublicKey(hexToBytes(data.privateKeyHex), true);
    if (txcAddressFromPubkey(pub) !== data.tradingAddress) {
      throw new Error("The trading key does not match its address");
    }

    const { encryptDelegatedKey } = await import("@/lib/delegation.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const expires = new Date(Date.now() + data.days * 86_400_000).toISOString();
    const { error } = await supabaseAdmin.from("wallet_delegations").upsert(
      {
        user_id: context.userId,
        trading_path: data.tradingPath,
        trading_txc_address: data.tradingAddress,
        key_ciphertext: encryptDelegatedKey(data.privateKeyHex),
        max_amount: data.maxAmount,
        expires_at: expires,
        revoked_at: null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    return { ok: true, expiresAt: expires };
  });

export const revokeSharedAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wallet_delegations")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });
