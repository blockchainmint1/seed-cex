/**
 * Shared money-movement guards (security audit C2, H2, H6).
 *
 * - `spendWithin` reserves the amount against an authorization's cumulative
 *   cap in one SQL statement before any key is decrypted, and gives it back if
 *   the send fails.
 * - `claimLeg` atomically claims a settlement leg so two callers can never
 *   both broadcast it; the claim is dropped again if the send fails.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function spendWithin<T>(
  userId: string,
  chain: string,
  asset: string,
  amount: number,
  send: () => Promise<T>,
): Promise<T> {
  const { data: id, error } = await supabaseAdmin.rpc("reserve_delegation_spend", {
    _user_id: userId,
    _chain: chain,
    _asset: asset,
    _amount: amount,
  });
  if (error) throw new Error(error.message);
  if (!id) {
    throw new Error(
      `This would take the ${asset} authorization past its total limit. Authorize a higher amount to continue.`,
    );
  }
  try {
    return await send();
  } catch (e) {
    await supabaseAdmin.rpc("release_delegation_spend", { _id: id as string, _amount: amount });
    throw e;
  }
}

/** Claim a leg for broadcasting. Throws when another caller already holds it. */
export async function claimLeg(escrowId: string): Promise<() => Promise<void>> {
  // Claims older than 10 minutes are considered abandoned (crashed worker).
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("escrows")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", escrowId)
    .is("release_txid", null)
    .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("This leg is already being sent");
  return async () => {
    await supabaseAdmin.from("escrows").update({ claimed_at: null }).eq("id", escrowId).is("release_txid", null);
  };
}

export { assertDeliverer } from "./leg-roles";
