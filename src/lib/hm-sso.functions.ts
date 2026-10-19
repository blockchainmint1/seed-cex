import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Verified, single-use HME tickets identify accounts by permanent member UUID, never email. */
export const redeemHonestMoneyToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(4000), ref: z.string().max(64).optional() }).parse(d))
  .handler(async ({ data }) => {
    const { sendHubEvent } = await import("./hme-hub.server");
    const { ecosystemKey, verifyHmeTicket } = await import("./hme-auth.server");
    const p = await verifyHmeTicket(data.token, ecosystemKey());

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: nonceErr } = await supabaseAdmin.from("sso_nonces").insert({ nonce: p.nonce });
    if (nonceErr) throw new Error("That sign-in ticket was already used.");

    const ticketEmail = p.email.toLowerCase();
    // The permanent UUID finds the existing account even after a contact-email change.
    const { data: linked, error: lookupError } = await supabaseAdmin.from("profiles").select("id, hm_status").eq("hm_member_id", p.minerId).maybeSingle();
    if (lookupError) throw new Error("Could not check your Honest.Money account. Try again.");
    if (linked && linked.hm_status !== "active" && linked.hm_status !== "oceanfront")
      throw new Error("This Honest.Money membership is not active. Contact support@honest.money.");

    let userId = linked?.id ?? null;
    const email = ticketEmail;
    let isNew = false;
    if (userId) {
      const u = await supabaseAdmin.auth.admin.getUserById(userId);
      if (u.error || !u.data.user) throw new Error("Could not find your linked Seeds account. Contact support@honest.money.");
      // The signed UUID selects the account; email is only its current contact detail.
      if (u.data.user.email?.toLowerCase() !== email) {
        const changed = await supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true });
        if (changed.error) throw new Error("Your new email conflicts with another Seeds account. Contact support@honest.money; your existing account is unchanged.");
      }
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { hm_member_id: p.minerId, sso: "honest.money" },
      });
      // An email match alone is not proof that a pre-existing local account is theirs.
      if (created.error || !created.data.user) throw new Error("That email already has a Seeds account or could not be registered. Contact support@honest.money to verify ownership; accounts are never merged automatically.");
      userId = created.data.user.id;
      isNew = true;
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
      const { error: attachError } = await supabaseAdmin.from("profiles").upsert({ id: userId, hm_member_id: p.minerId }, { onConflict: "id" });
      if (attachError) throw new Error("Could not link your permanent Honest.Money identity. Contact support@honest.money.");
    }

    if (userId) {
      const { alertSignIn } = await import("./alerts.server");
      await alertSignIn({ userId, email });
    }

    await sendHubEvent({ event: isNew ? "signup" : "service_used", member_id: p.minerId, ref: data.ref, metadata: { via: "sso" } });
    return { tokenHash: link.data.properties.hashed_token };
  });
