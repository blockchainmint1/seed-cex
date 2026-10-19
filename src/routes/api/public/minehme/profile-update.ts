import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// honest.money pushes member profile changes here (honest.money/api "Profile changes").
const Body = z.object({
  minerId: z.string().uuid(),
  status: z.enum(["active", "blocked", "ban", "oceanfront"]).optional(),
  fullName: z.string().max(200).optional(),
  mobile: z.string().max(50).optional(),
  newEmail: z.string().email().max(255).optional(),
});

export const Route = createFileRoute("/api/public/minehme/profile-update")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizedHmeRequest } = await import("@/lib/hme-auth.server");
        if (!authorizedHmeRequest(request)) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ ok: false, error: "bad request" }, { status: 400 });
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: prof, error: lookupError } = await supabaseAdmin.from("profiles").select("id").eq("hm_member_id", b.minerId).maybeSingle();
        if (lookupError) return Response.json({ ok: false, error: "lookup failed" }, { status: 500 });
        if (!prof) return Response.json({ ok: false, error: "member not found" }, { status: 404 });

        const updated: Record<string, unknown> = {};
        const patch: { hm_status?: string; display_name?: string } = {};
        if (b.status) patch.hm_status = updated.status = b.status;
        if (b.fullName !== undefined) patch.display_name = updated.fullName = b.fullName;
        if (Object.keys(patch).length) {
          const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", prof.id);
          if (error) return Response.json({ ok: false, error: "profile update failed" }, { status: 500 });
        }

        if (b.newEmail) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(prof.id, { email: b.newEmail, email_confirm: true });
          if (error) return Response.json({ ok: false, error: "email update requires review" }, { status: 409 });
          updated.newEmail = b.newEmail;
        }
        if (b.status) {
          const blocked = b.status === "blocked" || b.status === "ban";
          // Ban immediately cuts off sign-in and token refresh; also revoke trading authorizations.
          const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(prof.id, { ban_duration: blocked ? "876000h" : "none" });
          if (banError) return Response.json({ ok: false, error: "access update failed" }, { status: 500 });
          if (blocked) {
            const { error } = await supabaseAdmin.from("wallet_delegations").update({ revoked_at: new Date().toISOString() }).eq("user_id", prof.id).is("revoked_at", null);
            if (error) return Response.json({ ok: false, error: "authorization revocation failed" }, { status: 500 });
          }
        }
        return Response.json({ ok: true, minerId: b.minerId, updated });
      },
    },
  },
});
