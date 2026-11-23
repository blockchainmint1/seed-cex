import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  telegram_chat_id: string | null;
  telegram_verified: boolean;
  notify_order_filled: boolean;
  notify_settlement: boolean;
  notify_settlement_failed: boolean;
  notify_auth_expiring: boolean;
  notify_deposit: boolean;
  notify_login: boolean;
  notify_weekly_digest: boolean;
  email_trade_confirmations: boolean;
  email_weekly_update: boolean;
  notify_p2p: boolean;
  default_auth_cap: number | null;
  default_auth_hours: number;
  confirm_before_order: boolean;
  default_pair: string | null;
  hm_member_id: string | null;
  hm_status: string;
  created_at: string;
};

const COLS =
  "id, display_name, timezone, telegram_chat_id, telegram_verified, notify_order_filled, notify_settlement, notify_settlement_failed, notify_auth_expiring, notify_deposit, notify_login, notify_weekly_digest, notify_p2p, email_trade_confirmations, email_weekly_update, default_auth_cap, default_auth_hours, confirm_before_order, default_pair, hm_member_id, hm_status, created_at";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Profile> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select(COLS)
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as unknown as Profile;

    const { data: created, error: insErr } = await supabaseAdmin
      .from("profiles")
      .insert({ id: context.userId })
      .select(COLS)
      .single();
    if (insErr) throw new Error(insErr.message);
    return created as unknown as Profile;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        display_name: z.string().trim().max(60).nullable().optional(),
        timezone: z.string().trim().max(64).optional(),
        notify_order_filled: z.boolean().optional(),
        notify_settlement: z.boolean().optional(),
        notify_settlement_failed: z.boolean().optional(),
        notify_auth_expiring: z.boolean().optional(),
        notify_deposit: z.boolean().optional(),
        notify_login: z.boolean().optional(),
        notify_weekly_digest: z.boolean().optional(),
        notify_p2p: z.boolean().optional(),
        email_trade_confirmations: z.boolean().optional(),
        email_weekly_update: z.boolean().optional(),
        default_auth_cap: z.number().nonnegative().nullable().optional(),
        default_auth_hours: z.number().int().min(1).max(720).optional(),
        confirm_before_order: z.boolean().optional(),
        default_pair: z.string().trim().max(24).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Profile> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("profiles").select(COLS).eq("id", context.userId).maybeSingle();
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: context.userId, ...data } as never, { onConflict: "id" })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    const { describeProfileChanges } = await import("@/lib/email/profile-diff");
    const change = describeProfileChanges(before as Record<string, unknown> | null, row as unknown as Record<string, unknown>);
    if (change) {
      const { emailAccountChange } = await import("@/lib/email/send.server");
      await emailAccountChange(context.userId, change.thing, change.lines);
    }
    return row as unknown as Profile;
  });

/** Connecting or unlinking Telegram moves where send approvals go: needs a fresh code when two-factor is on. */
async function requireTelegramChangeCode(userId: string, claims: unknown) {
  const { hasTwoFactor } = await import("./two-factor.server");
  const { freshTwoFactor, telegramChangeProblem } = await import("./two-factor");
  const problem = telegramChangeProblem({ on: await hasTwoFactor(userId), fresh: freshTwoFactor(claims as never, Math.floor(Date.now() / 1000)) });
  if (problem) throw new Error(problem);
}

/** One-tap Telegram linking: returns a t.me link carrying a single-use code (stored hashed, 15 minutes). */
export const startTelegramConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireTelegramChangeCode(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { newStartCode, sha256hex, telegramConfigured } = await import("./telegram.server");
    const { connectUrl } = await import("./telegram-bot");
    if (!telegramConfigured()) throw new Error("Telegram alerts aren't switched on yet. Please try again later.");
    const code = newStartCode();
    // H1b: a chat connected from a session that just proved it's the member is trusted straight away.
    const { provenNow } = await import("./step-up/step-up.server");
    const trustedNow = await provenNow(context.userId, context.claims).catch(() => false);
    const { error } = await supabaseAdmin.from("profiles")
      .update({ telegram_code: await sha256hex(code), telegram_code_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), telegram_code_trusted: trustedNow })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { url: connectUrl(code) };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ proof: z.object({ id: z.string().uuid(), secret: z.string().regex(/^[0-9a-f]{64}$/) }).nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", context.userId).maybeSingle();
    // H1: unlinking a working chat silences the member's alarms, so it needs "prove it's you" (sign-in again,
    // a tap in that chat, a day-old confirmed 2FA code, or the Honest.Money email code).
    if (before?.telegram_verified && before.telegram_chat_id) {
      const { requireStepUp } = await import("./step-up/step-up.server");
      await requireStepUp(context.userId, context.claims, "telegram_unlink", data.proof);
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        telegram_chat_id: null,
        telegram_verified: false,
        telegram_code: null,
        telegram_code_expires_at: null,
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    const { telegramChatChanged } = await import("./telegram.server");
    const { forgetTelegramTrust } = await import("./step-up/step-up.server");
    await forgetTelegramTrust(context.userId).catch(() => undefined);
    await telegramChatChanged(context.userId, before?.telegram_verified ? before.telegram_chat_id : null, null);
    const { emailAccountChange } = await import("@/lib/email/send.server");
    await emailAccountChange(context.userId, "Telegram alerts", ["Unlinked Telegram; alerts there have stopped"]);
    return { unlinked: true as const };
  });

export const sendTestAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTelegram } = await import("./telegram.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id, telegram_verified")
      .eq("id", context.userId)
      .maybeSingle();
    if (!row?.telegram_chat_id || !row.telegram_verified) throw new Error("Link Telegram first.");
    await sendTelegram(
      String(row.telegram_chat_id),
      "<b>Seeds</b>\nTest alert — your notifications are working.",
    );
    return { sent: true as const };
  });
