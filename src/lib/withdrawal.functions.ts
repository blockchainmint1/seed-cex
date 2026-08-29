import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const withdrawInput = (input: unknown) =>
  z
    .object({
      leg: z.enum(["txc", "tsd", "usdc", "usdt", "ltc", "isk", "zcu"]),
      to: z.string().trim().min(20).max(120),
      amount: z.number().positive().max(1e12),
    })
    .parse(input);

/** Dry run of a withdrawal — every gate, no decryption, no broadcast. */
export const previewWithdrawalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(withdrawInput)
  .handler(async ({ data, context }) => {
    const { previewWithdrawal } = await import("./withdrawal.server");
    return previewWithdrawal(context.userId, data.leg, data.to, data.amount);
  });

/** Build, sign, and broadcast a withdrawal from the authorized branch. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(withdrawInput)
  .handler(async ({ data, context }) => {
    const { withdrawAsset } = await import("./withdrawal.server");
    return withdrawAsset(context.userId, data.leg, data.to, data.amount);
  });

/** The caller's recent withdrawals, newest first. */
export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listWithdrawals } = await import("./withdrawal.server");
    return listWithdrawals(context.userId);
  });
