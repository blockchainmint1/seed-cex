// The one place a member's active HME Wallet link is revoked from the Seeds side (Account → Security or Telegram).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SeedsRevokeSource = "seeds" | "telegram";

/** Deletes Seeds' trading key for the member's active link(s), expires pending proposals and emails the member.
 *  With `linkId`, only that link is touched (an old Telegram button can never revoke a newer link). */
export async function revokeActiveHmeLinks(userId: string, by: SeedsRevokeSource, linkId?: string): Promise<{ revoked: number }> {
  let q = supabaseAdmin.from("hme_links")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: by, key_ciphertext: null })
    .eq("user_id", userId).eq("status", "active");
  if (linkId) q = q.eq("id", linkId);
  const { data, error } = await q.select("id, account, paths, xpubs");
  if (error) throw new Error("Could not revoke the link. Try again.");
  for (const l of data ?? []) {
    await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", l.id).eq("status", "pending");
  }
  if (data?.length) {
    const { emailAccountChange } = await import("@/lib/email/send.server");
    const { extraPocketAddresses } = await import("@/lib/pockets/extra-addresses.server");
    const { recoveryLines } = await import("@/lib/pockets/hme-support");
    const recovery = data.flatMap((l) => recoveryLines(l.account, extraPocketAddresses(l)));
    await emailAccountChange(userId, "HME Wallet link", [
      by === "telegram"
        ? "Revoked from Telegram. Seeds deleted its access to your trading pocket."
        : "Revoked on Seeds. Seeds deleted its access to your trading pocket.",
      ...(recovery.length
        ? ["HME Wallet can't hold or move these coins. If you left any in them, import your recovery phrase into a wallet that supports that coin and use the path shown:", ...recovery]
        : []),
    ],
      "link your HME Wallet again from your profile only if you trust the device you're using, and contact support@honest.money.");
  }
  return { revoked: data?.length ?? 0 };
}
