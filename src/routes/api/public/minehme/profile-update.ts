import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// honest.money pushes member profile changes here (honest.money/api "Profile changes").
const Body = z.object({
  minerId: z.string().min(1).max(100),
  status: z.enum(["active", "blocked", "ban", "oceanfront"]).optional(),
  fullName: z.string().max(200).optional(),
  mobile: z.string().max(50).optional(),
  newEmail: z.string().email().max(255).optional(),
});

export const Route = createFileRoute("/api/public/minehme/profile-update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { safeEqual } = await import("@/lib/hme-hub.server");
        const secret = process.env.HME_HMAC_SECRET;
        const given =
          request.headers.get("x-minehme-secret") ??
          request.headers.get("x-minetxc-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (!secret || !safeEqual(given, secret)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false, error: "bad request" }, { status: 400 });
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("hm_member_id", b.minerId).maybeSingle();
        if (!prof) return Response.json({ ok: false, error: "member not found" }, { status: 404 });

        const updated: Record<string, unknown> = {};
        const patch: { hm_status?: string; display_name?: string } = {};
        if (b.status) patch.hm_status = updated.status = b.status;
        if (b.fullName) patch.display_name = updated.fullName = b.fullName;
        if (Object.keys(patch).length) await supabaseAdmin.from("profiles").update(patch).eq("id", prof.id);

        if (b.newEmail) {
          await supabaseAdmin.auth.admin.updateUserById(prof.id, { email: b.newEmail, email_confirm: true });
          updated.newEmail = b.newEmail;
        }
        if (b.status) {
          const blocked = b.status === "blocked" || b.status === "ban";
          // Ban immediately cuts off sign-in and token refresh; also revoke trading authorizations.
          await supabaseAdmin.auth.admin.updateUserById(prof.id, { ban_duration: blocked ? "876000h" : "none" });
          if (blocked)
            await supabaseAdmin.from("wallet_delegations").update({ revoked_at: new Date().toISOString() }).eq("user_id", prof.id).is("revoked_at", null);
        }
        return Response.json({ ok: true, minerId: b.minerId, updated });
      },
    },
  },
});
