import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function callerIsAdmin(supabase: { from: (t: string) => any }, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "beta"]).limit(1);
  return Boolean(data?.length);
}

/** Can Seeds send PulseChain coins for me, the rules, and my recent PulseChain withdrawals. */
export const getPulseWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await callerIsAdmin(context.supabase as never, context.userId);
    const { pulseWithdrawContext } = await import("./withdraw.server");
    return pulseWithdrawContext(context.userId, isAdmin);
  });

const requestInput = z.object({
  coin: z.enum(["PLS", "pHEX"]),
  amount: z.string().trim().min(1).max(64),
  to: z.string().trim().min(42).max(42),
});

/** Ask Seeds to send PLS or pHEX out after the hold. Nothing is signed now. */
export const requestPulseWithdrawalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const { PULSE_WITHDRAW_PILOT_ADMIN_ONLY } = await import("./withdraw-rules");
    const isAdmin = await pilotTesterAccess(context as never);
    const { requestPulseWithdrawal } = await import("./withdraw.server");
    return requestPulseWithdrawal(context.userId, isAdmin, data, context.claims as never);
  });

/** Cancel one of my withdrawals while it is still on hold. */
export const cancelPulseWithdrawalFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { cancelPulseWithdrawal } = await import("./withdraw.server");
    return cancelPulseWithdrawal(context.userId, data.id);
  });
