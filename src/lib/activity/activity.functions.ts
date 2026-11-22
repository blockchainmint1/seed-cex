import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in: everything I've done on Seeds, newest first (read-only). */
export const getMyActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadActivity } = await import("./activity.server");
    return loadActivity(context.userId);
  });

/** Signed-in: look for new deposits to my pocket now (at most every 2 minutes; read-only on every chain). */
export const refreshMyDeposits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncDeposits } = await import("./deposits.server");
    return syncDeposits(context.userId);
  });
