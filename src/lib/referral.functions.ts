import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Signed-in: my short Seeds invite link (backed by my Honest.Money referral code). */
export const getMyInvite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", context.userId).maybeSingle();
    const { hmeReferralCode } = await import("./hme-hub.server");
    const { inviteUrl } = await import("./ignite-registration");
    const code = await hmeReferralCode(data?.hm_member_id ?? null);
    // Admin → Affiliates: remember whose code this is.
    const { rememberOwnCode } = await import("./affiliates.server");
    await rememberOwnCode(context.userId, code);
    return { url: code ? inviteUrl(code) : null, code };
  });
