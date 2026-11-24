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

/**
 * Signed-in: totals for my own invite link (clicks, sign-ups, set-ups, class seats, listings).
 * Same attribution as Admin → Affiliates, filtered to codes this member owns; no details about
 * the people they referred.
 */
export const getMyReferralStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { myReferralStats } = await import("./affiliates");
    const { data: own } = await supabaseAdmin.from("referral_codes").select("code_lc").eq("user_id", context.userId);
    if (!own?.length) return myReferralStats([], context.userId);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data, error } = await supabaseAdmin.rpc("admin_affiliates", { _since: since });
    if (error) throw new Error("Couldn't load your referral results.");
    type Raw = { code: string; owner_id: string | null; clicks_all: number; clicks_since: number; signups_all: number; signups_since: number; active_members: number; ignite_paid: number; ignite_usd: number | string; setup_linked: number; setup_done: number; listings_paid: number; listing_usd: number | string };
    const rows = ((data ?? []) as Raw[]).filter((r) => r.owner_id === context.userId).map((r) => ({
      code: r.code, ownerId: r.owner_id, ownerName: null, linkSeenAt: null,
      clicksAll: Number(r.clicks_all), clicksPeriod: Number(r.clicks_since), signupsAll: Number(r.signups_all), signupsPeriod: Number(r.signups_since),
      activeMembers: Number(r.active_members), trades: 0, tradedValue: 0, swaps: 0, swapUsd: 0,
      ignitePaid: Number(r.ignite_paid), igniteStarted: 0, igniteUsd: Number(r.ignite_usd),
      setupLinked: Number(r.setup_linked), setupDone: Number(r.setup_done),
      listingsPaid: Number(r.listings_paid), listingsStarted: 0, listingUsd: Number(r.listing_usd),
    }));
    return myReferralStats(rows, context.userId);
  });
