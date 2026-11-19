import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in: the member's own ETH for network fees on Ethereum and Base, and the way to top it up. */
export const getMyFeePrep = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    const { feePrepFor } = await import("./fee-prep.server");
    return feePrepFor(context.userId, Boolean(data));
  });
