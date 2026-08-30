import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** API keys can read and trade. They can never withdraw — by design. */
const SCOPES = ["read", "trade"] as const;

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("api_keys")
      .select("id, key_id, label, scopes, ip_allowlist, enabled, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        label: z.string().trim().min(1).max(60).default("Bot key"),
        scopes: z.array(z.enum(SCOPES)).min(1).default(["read"]),
        ipAllowlist: z.array(z.string().trim().max(45)).max(10).default([]),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mintKeyPair } = await import("./api/auth.server");

    const { count } = await supabaseAdmin
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) >= 10) throw new Error("Key limit reached (10). Delete an old key first.");

    const { keyId, secret } = mintKeyPair();
    const { error } = await supabaseAdmin.from("api_keys").insert({
      user_id: context.userId,
      key_id: keyId,
      secret,
      label: data.label,
      scopes: data.scopes,
      ip_allowlist: data.ipAllowlist,
    });
    if (error) throw new Error(error.message);

    // The secret is shown exactly once; it is never returned by any read path.
    return { keyId, secret, label: data.label, scopes: data.scopes };
  });

export const setApiKeyEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ enabled: data.enabled })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("api_keys")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
