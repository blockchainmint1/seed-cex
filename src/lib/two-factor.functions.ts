import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * After turning two-factor on or off in the browser, re-read the real state
 * from the sign-in service, store it and email the member if it changed.
 * The browser's word is never used: only the sign-in service's own records.
 */
export const syncMyTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { syncTwoFactor } = await import("./two-factor.server");
    return { on: await syncTwoFactor(context.userId) };
  });
