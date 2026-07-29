import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const tradeIdInput = (input: unknown) => z.object({ tradeId: z.string().uuid() }).parse(input);

/** Dry run of the TXC leg — every gate, no decryption, no broadcast. */
export const previewTxcLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { previewTxcSettlement } = await import("./settlement.server");
    return previewTxcSettlement(context.userId, data.tradeId);
  });

/** Build, sign, and broadcast the TXC leg on the live chain. */
export const settleTxc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { settleTxcLeg } = await import("./settlement.server");
    return settleTxcLeg(context.userId, data.tradeId);
  });

/** Confirmation depth for a broadcast TXC leg. */
export const watchTxc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { watchTxcLeg } = await import("./settlement.server");
    return watchTxcLeg(context.userId, data.tradeId);
  });

/* ---------------------------------- usdc ---------------------------------- */

/** Dry run of the USDC (EVM) leg — every gate, no decryption, no broadcast. */
export const previewUsdcLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { previewUsdcSettlement } = await import("./evm-settlement.server");
    return previewUsdcSettlement(context.userId, data.tradeId);
  });

/** Build, sign, and broadcast the USDC ERC-20 transfer on the live chain. */
export const settleUsdc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { settleUsdcLeg } = await import("./evm-settlement.server");
    return settleUsdcLeg(context.userId, data.tradeId);
  });

/** Confirmation depth for a broadcast USDC leg. */
export const watchUsdc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { watchUsdcLeg } = await import("./evm-settlement.server");
    return watchUsdcLeg(context.userId, data.tradeId);
  });
