/**
 * Withdrawal history (read-only).
 *
 * The old instant withdrawal from a browser-vault authorization was removed in
 * audit #2 (2026-11-19, H3): it skipped withdrawal levels, two-factor, the hold
 * and Telegram. Coins now leave a pocket only through the guarded paths
 * (PulseChain withdrawals, pocket-send approvals, swaps).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ChainId, LegId } from "@/lib/chains";

export type WithdrawalRow = {
  id: string;
  leg: LegId;
  chain: ChainId;
  asset: string;
  amount: number;
  to_address: string;
  txid: string;
  status: string;
  created_at: string;
};

export async function listWithdrawals(userId: string): Promise<WithdrawalRow[]> {
  const { data, error } = await supabaseAdmin
    .from("withdrawals")
    .select("id, leg, chain, asset, amount, to_address, txid, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);
  return (data ?? []) as WithdrawalRow[];
}
