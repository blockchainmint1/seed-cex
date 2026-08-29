import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { PAIR_IDS } from "@/lib/chains";

const placeOrderInput = (input: unknown) =>
  z
    .object({
      pair: z.enum(PAIR_IDS).default("TSD_TXC"),
      side: z.enum(["buy", "sell"]),
      price: z.number().positive().max(1_000_000),
      amount: z.number().positive().max(100_000_000),
    })
    .parse(input);

/* ------------------------------ wallet vault ------------------------------ */

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("wallets")
      .select("vault_ciphertext, kdf_salt, kdf_iterations, txc_address, evm_address, ltc_address, isk_address, backed_up, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveMyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        vaultCiphertext: z.string().min(20).max(20_000),
        kdfSalt: z.string().min(8).max(256),
        kdfIterations: z.number().int().min(100_000).max(2_000_000),
        txcAddress: z.string().trim().min(20).max(120),
        evmAddress: z.string().trim().max(120).optional(),
        ltcAddress: z.string().trim().max(120).optional(),
        iskAddress: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("wallets").upsert(
      {
        user_id: context.userId,
        vault_ciphertext: data.vaultCiphertext,
        kdf_salt: data.kdfSalt,
        kdf_iterations: data.kdfIterations,
        txc_address: data.txcAddress,
        evm_address: data.evmAddress ?? null,
        ltc_address: data.ltcAddress ?? null,
        isk_address: data.iskAddress ?? null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Backfill derived addresses on an existing vault (older vaults predate the
 * LTC/ISK branches). Never touches the ciphertext.
 */
export const updateMyWalletAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        evmAddress: z.string().trim().max(120).optional(),
        ltcAddress: z.string().trim().max(120).optional(),
        iskAddress: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      evm_address?: string;
      ltc_address?: string;
      isk_address?: string;
    } = {};
    if (data.evmAddress) patch.evm_address = data.evmAddress;
    if (data.ltcAddress) patch.ltc_address = data.ltcAddress;
    if (data.iskAddress) patch.isk_address = data.iskAddress;
    if (Object.keys(patch).length === 0) return { ok: true, updated: false };
    const { error } = await context.supabase
      .from("wallets")
      .update(patch)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, updated: true };
  });

export const markWalletBackedUp = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("wallets")
      .update({ backed_up: true })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- orders --------------------------------- */

export const getMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("orders")
      .select("id, pair, side, price, amount, filled, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(placeOrderInput)
  .handler(async ({ data, context }) => {
    const { matchOrder } = await import("./trading.server");
    const { pair, ...order } = data;
    const result = await matchOrder(context.userId, pair, order);

    // Instant settlement: crossed fills are delivered straight away, wallet to
    // wallet. Nothing is ever parked in an escrow address.
    let settlements: Awaited<ReturnType<typeof import("./autosettle.server").autoSettleTrades>> = [];
    if (result.tradeIds.length > 0) {
      const { autoSettleTrades } = await import("./autosettle.server");
      settlements = await autoSettleTrades(result.tradeIds);
    }

    return { ...result, settlements };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .in("status", ["open", "partial"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- escrow ---------------------------------- */

export const getMyTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadMyTrades } = await import("./trading.server");
    return loadMyTrades(context.userId);
  });

export const advanceEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        tradeId: z.string().uuid(),
        action: z.enum(["fund", "release", "dispute"]),
        leg: z.enum(["txc", "usdc", "tsd"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { advance } = await import("./trading.server");
    return advance(context.userId, data);
  });
