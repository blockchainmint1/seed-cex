import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Honest.Money single sign-on (honest.money/api §1). Ticket =
 * `<b64url(json)>.<hex HMAC-SHA256>` keyed with HME_HMAC_SECRET, 120s expiry,
 * one-time nonce. Members are matched by their permanent minerId first, email second.
 */
export const redeemHonestMoneyToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(4000), ref: z.string().max(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { sendHubEvent, safeEqual } = await import("./hme-hub.server");
    const secret = process.env.HME_HMAC_SECRET;
    if (!secret) throw new Error("Honest.Money sign-in isn't configured yet.");
    const [enc, sig] = data.token.split(".");
    if (!enc || !sig || !/^[0-9a-f]{64}$/i.test(sig)) throw new Error("Malformed sign-in ticket.");

    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(enc)));
    const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (!safeEqual(hex, sig.toLowerCase())) throw new Error("Sign-in ticket signature is invalid.");

    const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0)));
    const p = z
      .object({
        minerId: z.string().min(1).max(100),
        email: z.string().email().max(255),
        nonce: z.string().min(8).max(200),
        exp: z.number(),
        redirect: z.string().optional(),
      })
      .parse(JSON.parse(json));
    if (p.exp * 1000 < Date.now()) throw new Error("That sign-in ticket expired. Try again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: nonceErr } = await supabaseAdmin.from("sso_nonces").insert({ nonce: p.nonce });
    if (nonceErr) throw new Error("That sign-in ticket was already used.");

    const ticketEmail = p.email.toLowerCase();
    // 1) Existing Seeds account linked to this member? Use its email (member may have changed theirs).
    const { data: linked } = await supabaseAdmin.from("profiles").select("id, hm_status").eq("hm_member_id", p.minerId).maybeSingle();
    if (linked && linked.hm_status !== "active" && linked.hm_status !== "oceanfront")
      throw new Error("This Honest.Money membership is not active. Contact support@honest.money.");

    let userId = linked?.id ?? null;
    let email = ticketEmail;
    let isNew = false;
    if (userId) {
      const u = await supabaseAdmin.auth.admin.getUserById(userId);
      if (u.data.user?.email) email = u.data.user.email;
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { hm_member_id: p.minerId, sso: "honest.money" },
      });
      if (created.error && !/already/i.test(created.error.message)) throw new Error(created.error.message);
      isNew = !!created.data.user;
    }

    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties?.hashed_token) throw new Error("Could not start a session.");
    userId = userId ?? link.data.user?.id ?? null;
    if (userId && !linked) {
      // One HME wallet = one Seeds account. If this email already belongs to an
      // account linked to a different member, refuse rather than re-link it.
      const { data: prof } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", userId).maybeSingle();
      if (prof?.hm_member_id && prof.hm_member_id !== p.minerId)
        throw new Error("That email belongs to a Seeds account linked to a different Honest.Money wallet. Sign in with that wallet.");
      await supabaseAdmin.from("profiles").update({ hm_member_id: p.minerId }).eq("id", userId);
    }

    if (userId) {
      const { alertSignIn } = await import("./alerts.server");
      await alertSignIn({ userId, email });
    }

    await sendHubEvent({ event: isNew ? "signup" : "service_used", member_id: p.minerId, ref: data.ref, metadata: { via: "sso" } });
    return { tokenHash: link.data.properties.hashed_token };
  });
