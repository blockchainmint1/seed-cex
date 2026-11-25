import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { HmeIdentityInput } from "./hme-identity";

/**
 * The caller's own Honest.Money identity for the account header: their username (their HME
 * user ID) and member number, with the permanent UUID so the UI can reveal it on hover.
 *
 * The username is already stored for most members in referral_codes (their invite code is
 * their HME username, matched by the affiliate sync). When it isn't there yet, we ask
 * Honest.Money once, read-only, best effort — a hub that is down must never blank the header.
 */
export const getMyHmeIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HmeIdentityInput> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", context.userId).maybeSingle();
    const memberId = prof?.hm_member_id ?? null;
    if (!memberId) return { memberId: null, username: null, memberNo: null };

    const { data: own } = await supabaseAdmin.from("referral_codes").select("code").eq("user_id", context.userId).limit(1);
    const stored = own?.[0]?.code ?? null;
    if (stored) return { memberId, username: stored, memberNo: null };

    const { hmeMemberIdentity } = await import("./hme-hub.server");
    const live = await hmeMemberIdentity(memberId);
    return { memberId, username: live?.username ?? null, memberNo: live?.memberNo ?? null };
  });
