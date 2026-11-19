import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** The caller's recent withdrawals, newest first. (Sending moved to the guarded pocket paths; audit #2 H3.) */
export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listWithdrawals } = await import("./withdrawal.server");
    return listWithdrawals(context.userId);
  });
