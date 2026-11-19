/**
 * A member's own one-tap Telegram limit for Seeds AI trade days (Account → Alerts).
 * Admins set the default and the highest a member may choose (Admin → Seeds AI).
 * Lowering is always allowed; raising needs two-factor on and a code from the last
 * 10 minutes (read from the signed session, never from the browser). Every change is
 * recorded and the member's Telegram chat is told.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MyOneTap = { limit: number; own: number | null; adminDefault: number; adminMax: number; twoFactorOn: boolean };

export const getMyOneTapLimit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyOneTap> => {
    const { oneTapLimitFor } = await import("./execute.server");
    const { hasTwoFactor } = await import("@/lib/two-factor.server");
    const [l, twoFactorOn] = await Promise.all([oneTapLimitFor(context.userId), hasTwoFactor(context.userId)]);
    return { ...l, twoFactorOn };
  });

const input = z.object({ limitUsd: z.number().finite().min(0).max(100000).nullable() });

export const setMyOneTapLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    const { oneTapLimitFor } = await import("./execute.server");
    const { hasTwoFactor } = await import("@/lib/two-factor.server");
    const { freshTwoFactor } = await import("@/lib/two-factor");
    const { effectiveOneTapLimit, oneTapChangeProblem } = await import("./execute-rules");
    const cur = await oneTapLimitFor(context.userId);
    const next = data.limitUsd == null ? null : Math.round(data.limitUsd * 100) / 100;
    const twoFactorOn = await hasTwoFactor(context.userId);
    const fresh = freshTwoFactor(context.claims as never, Math.floor(Date.now() / 1000));
    const problem = oneTapChangeProblem({ next, current: cur.limit, adminDefault: cur.adminDefault, adminMax: cur.adminMax, twoFactorOn, fresh });
    if (problem) throw new Error(problem);
    const after = effectiveOneTapLimit({ adminDefault: cur.adminDefault, adminMax: cur.adminMax, member: next });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ one_tap_limit_usd: next, one_tap_limit_set_at: new Date().toISOString() }).eq("id", context.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("one_tap_limit_events").insert({ user_id: context.userId, old_limit_usd: cur.limit, new_limit_usd: after, with_code: after > cur.limit });
    // Tell the member's Telegram, so a change they didn't make is noticed.
    try {
      const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", context.userId).maybeSingle();
      const { telegramConfigured, telegramCall } = await import("@/lib/telegram.server");
      if (telegramConfigured() && prof?.telegram_verified && prof.telegram_chat_id) {
        const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
        await telegramCall("sendMessage", {
          chat_id: String(prof.telegram_chat_id), parse_mode: "HTML",
          text: `🔐 <b>One-tap limit changed</b>\nSeeds AI trade days up to <b>${usd(after)}</b> can now be approved with one tap here (was ${usd(cur.limit)}).\nDidn't do this? Change it back in Seeds → Account → Alerts and check Account → Security.`,
        });
      }
    } catch (e) { console.error("[one-tap] telegram notice failed", e); }
    return { limit: after, own: next };
  });
