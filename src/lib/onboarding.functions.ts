import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Has this member finished or skipped the setup guide? */
export const getMyOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ status: "done" | "skipped" | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("profiles").select("onboarding_status").eq("id", context.userId).maybeSingle();
    if (error) throw new Error("Couldn't check your setup guide.");
    const s = data?.onboarding_status;
    return { status: s === "done" || s === "skipped" ? s : null };
  });

/** Record that this member finished or skipped the setup guide (the only change members can make here). */
export const setMyOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ status: z.enum(["done", "skipped"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Update only: an account's profile row is created at sign-in, never here (audit 2026-11-19 L5).
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .update({ onboarding_status: data.status, onboarding_at: new Date().toISOString() })
      .eq("id", context.userId)
      .select("id");
    if (error || !rows?.length) throw new Error("Couldn't save. Try again.");
    return { status: data.status };
  });
