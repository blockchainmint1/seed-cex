import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function tester(context: unknown): Promise<boolean> {
  const { pilotTesterAccess } = await import("@/lib/admin-guard");
  return pilotTesterAccess(context as never);
}

/** Can Seeds send this coin for me, the rules that apply, and my recent withdrawals. */
export const getWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ key: z.string().max(40).nullable() }).parse(input ?? { key: null }))
  .handler(async ({ data, context }) => {
    const { withdrawContext } = await import("./withdraw.server");
    return withdrawContext(context.userId, await tester(context), data.key);
  });

const base = z.object({
  symbol: z.string().trim().min(2).max(6),
  network: z.string().trim().min(2).max(16),
  amount: z.string().trim().min(1).max(64),
  to: z.string().trim().min(20).max(2048),
  tag: z.string().trim().max(10).optional(),
  comment: z.string().max(120).optional(),
});

/** Step 1: email me a code for exactly this withdrawal. Nothing is reserved or signed. */
export const sendWithdrawalCodeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => base.parse(input))
  .handler(async ({ data, context }) => {
    const { sendWithdrawalEmailCode } = await import("./withdraw.server");
    return sendWithdrawalEmailCode(context.userId, await tester(context), data);
  });

/** Step 2: email code + fresh authenticator code → reserved, then a Telegram Approve for this exact send. */
export const requestWithdrawalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => base.extend({ emailCode: z.string().trim().min(6).max(9) }).parse(input))
  .handler(async ({ data, context }) => {
    const { requestWithdrawal } = await import("./withdraw.server");
    return requestWithdrawal(context.userId, await tester(context), data, context.claims as never);
  });

/** Cancel one of my withdrawals while it waits for my tap or during the hold. */
export const cancelWithdrawalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { cancelWithdrawal } = await import("./withdraw.server");
    return cancelWithdrawal(context.userId, data.id);
  });
