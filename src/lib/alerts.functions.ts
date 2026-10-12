import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Best-effort Telegram sweep for the signed-in user: deposits that arrived and
 * authorizations about to be wiped. Never throws into the page — a failed
 * notification must not break the wallet.
 */
export const runWalletAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sweepWalletAlerts } = await import("./alerts.server");
    return sweepWalletAlerts(context.userId);
  });
