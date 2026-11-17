/**
 * Offers a pre-HME account owner a one-time link to join that account to the
 * HME membership they just signed in with. The link goes to the old account's
 * own inbox; nothing merges until it's clicked (see redeem_legacy_claim).
 */
import { SITE } from "./email/components";
import { canSendClaim, claimExpiry, claimTokenHash } from "./legacy-claim";

export type LegacyOffer = "sent" | "limited" | "failed";

export async function offerLegacyLink(a: { legacyUserId: string; hmMemberId: string; email: string }): Promise<LegacyOffer> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recent, error } = await supabaseAdmin.from("legacy_account_claims")
    .select("created_at").eq("legacy_user_id", a.legacyUserId).gte("created_at", since);
  if (error) throw new Error("Could not check your older Seeds account. Try again.");
  if (!canSendClaim((recent ?? []).map((r) => r.created_at))) return "limited";

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = claimExpiry(new Date()).toISOString();
  const { data: row, error: insErr } = await supabaseAdmin.from("legacy_account_claims")
    .insert({ legacy_user_id: a.legacyUserId, hm_member_id: a.hmMemberId, email: a.email, token_hash: claimTokenHash(token), expires_at: expiresAt })
    .select("id").single();
  if (insErr || !row) throw new Error("Could not start linking your older account. Try again.");

  const { emailUser } = await import("./email/send.server");
  const result = await emailUser(a.legacyUserId, "legacy-link", (r) => ({
    name: r.name, timezone: r.timezone, expiresAt,
    linkUrl: `${SITE}/link-account?token=${token}`,
  }), { to: a.email });
  if (result !== "sent") {
    await supabaseAdmin.from("legacy_account_claims").delete().eq("id", row.id);
    return "failed";
  }
  return "sent";
}
