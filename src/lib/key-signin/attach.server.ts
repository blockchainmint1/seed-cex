/**
 * Attach an Honest.Money membership to a coin / outside-wallet account.
 * Both sides are proven: the member's signed HME ticket, and the account's
 * own live session token. Never by email match alone.
 */
export async function attachMembership(p: { accessToken: string; minerId: string; email: string }): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: who, error } = await supabaseAdmin.auth.getUser(p.accessToken);
  if (error || !who.user) throw new Error("Your Seeds sign-in expired. Sign in with your coin or wallet again, then join.");
  const userId = who.user.id;
  const { data: prof } = await supabaseAdmin.from("profiles").select("identity_kind, hm_member_id").eq("id", userId).maybeSingle();
  if (!prof || prof.identity_kind === "hme") throw new Error("This account already signs in with Honest.Money.");
  if (prof.hm_member_id) {
    if (prof.hm_member_id !== p.minerId) throw new Error("This Seeds account is already joined to a different Honest.Money membership.");
  } else {
    const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("hm_member_id", p.minerId).maybeSingle();
    if (taken && taken.id !== userId)
      throw new Error("That Honest.Money membership already has its own Seeds account. Sign in with Honest.Money to use it; accounts are never merged automatically.");
  }
  if (who.user.email?.toLowerCase() !== p.email) {
    const changed = await supabaseAdmin.auth.admin.updateUserById(userId, { email: p.email, email_confirm: true });
    if (changed.error) throw new Error("Your Honest.Money email already belongs to another Seeds account. Contact support@honest.money; nothing was changed.");
  }
  const { data: attached, error: ae } = await supabaseAdmin.from("profiles").update({ hm_member_id: p.minerId }).eq("id", userId).select("id");
  if (ae || !attached?.length) throw new Error("Couldn't join your Honest.Money membership. Contact support@honest.money.");
  const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email: p.email });
  if (link.error || !link.data.properties?.hashed_token || link.data.user?.id !== userId) throw new Error("Couldn't refresh your session. Sign in again.");
  const { emailAccountChange } = await import("../email/send.server");
  await emailAccountChange(userId, "Honest.Money membership", ["Joined your Honest.Money membership to this Seeds account", `Account email is now ${p.email}`]);
  return link.data.properties.hashed_token;
}
