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
    const on = await syncTwoFactor(context.userId);
    // H1b: a new authenticator is trusted only when added right after a fresh sign-in; otherwise "Not confirmed yet".
    const { syncFactorTrust } = await import("./step-up/step-up.server");
    const trust = await syncFactorTrust(context.userId, context.claims).catch(() => null);
    if (trust?.added) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: p } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", context.userId).maybeSingle();
      if (p?.telegram_verified && p.telegram_chat_id) {
        const { sendTelegram } = await import("./telegram.server");
        await sendTelegram(String(p.telegram_chat_id), trust.unconfirmed
          ? "🔐 <b>Seeds</b>\nA new two-factor app was added to your Seeds account. It shows as \"Not confirmed yet\" until you confirm it in Account → Security. If this wasn't you, sign out of Honest.Money everywhere and contact support@honest.money."
          : "🔐 <b>Seeds</b>\nA new two-factor app was added to your Seeds account. If this wasn't you, sign out of Honest.Money everywhere and contact support@honest.money.").catch(() => undefined);
      }
    }
    return { on, unconfirmed: trust?.unconfirmed ?? 0 };
  });
