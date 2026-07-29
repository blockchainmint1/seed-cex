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
