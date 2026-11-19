import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";
import { SEAT_CAPACITY } from "./ignite-registration";
import type { BusinessPlan, PlanLive } from "./business-plan";

/** Admin-only: the business plan text plus today's real numbers. */
export const getBusinessPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ plan: BusinessPlan; live: PlanLive; generatedAt: string }> => {
    await requireAdmin(context as never);
    const [{ BUSINESS_PLAN }, { supabaseAdmin }] = await Promise.all([
      import("./business-plan.server"),
      import("@/integrations/supabase/client.server"),
    ]);
    const head = { count: "exact" as const, head: true };
    const [members, hme, links, seats, apps, live] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", head),
      supabaseAdmin.from("profiles").select("id", head).not("hm_member_id", "is", null),
      supabaseAdmin.from("hme_links").select("user_id").eq("status", "active").limit(5000),
      supabaseAdmin.from("ignite_registrations").select("id", head).eq("status", "confirmed"),
      supabaseAdmin.from("listing_applications").select("id", head),
      supabaseAdmin.from("listing_applications").select("id", head).eq("status", "live"),
    ]);
    return {
      plan: BUSINESS_PLAN,
      generatedAt: new Date().toISOString(),
      live: {
        members: members.count ?? 0,
        hmeMembers: hme.count ?? 0,
        linkedWallets: new Set((links.data ?? []).map((r) => r.user_id)).size,
        igniteSeats: seats.count ?? 0,
        igniteCapacity: SEAT_CAPACITY,
        listingApplications: apps.count ?? 0,
        listingsLive: live.count ?? 0,
      },
    };
  });
