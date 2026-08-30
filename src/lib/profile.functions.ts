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
  default_auth_cap: number | null;
  default_auth_hours: number;
  confirm_before_order: boolean;
  default_pair: string | null;
  created_at: string;
};

const COLS =
  "id, display_name, timezone, telegram_chat_id, telegram_verified, notify_order_filled, notify_settlement, notify_settlement_failed, notify_auth_expiring, notify_deposit, notify_login, notify_weekly_digest, default_auth_cap, default_auth_hours, confirm_before_order, default_pair, created_at";

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
        default_auth_cap: z.number().nonnegative().nullable().optional(),
        default_auth_hours: z.number().int().min(1).max(720).optional(),
        confirm_before_order: z.boolean().optional(),
        default_pair: z.string().trim().max(24).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<Profile> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: context.userId, ...data }, { onConflict: "id" })
      .select(COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as Profile;
  });

/** Step 1 of Telegram linking: send a 6-digit code to the chat id the user gave us. */
export const startTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ chatId: z.string().trim().min(2).max(32) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTelegram, telegramConfigured } = await import("./telegram.server");

    if (!telegramConfigured()) {
      throw new Error(
        "Telegram alerts are not connected yet on this deployment. Ask an admin to link the Seeds Telegram bot.",
      );
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60_000).toISOString();

    await sendTelegram(
      data.chatId,
      `<b>Seeds</b>\nYour verification code is <b>${code}</b>.\nEnter it on your account page to switch on alerts. It expires in 10 minutes.`,
    );

    const { error } = await supabaseAdmin.from("profiles").upsert(
      {
        id: context.userId,
        telegram_chat_id: data.chatId,
        telegram_verified: false,
        telegram_code: code,
        telegram_code_expires_at: expires,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { sent: true as const };
  });

export const confirmTelegramLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().trim().length(6) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTelegram } = await import("./telegram.server");

    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id, telegram_code, telegram_code_expires_at")
      .eq("id", context.userId)
      .maybeSingle();

    if (!row?.telegram_code || !row.telegram_chat_id) throw new Error("Start the link first.");
    if (row.telegram_code_expires_at && new Date(row.telegram_code_expires_at) < new Date()) {
      throw new Error("That code expired. Send a new one.");
    }
    if (row.telegram_code !== data.code) throw new Error("Wrong code.");

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ telegram_verified: true, telegram_code: null, telegram_code_expires_at: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);

    await sendTelegram(
      String(row.telegram_chat_id),
      "<b>Seeds</b>\nAlerts are on. You'll hear from us when your orders fill and settle.",
    );
    return { verified: true as const };
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
