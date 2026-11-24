/**
 * Transactions Seeds itself broadcast (audit X1). A pocket's unconfirmed change may be re-spent
 * only when its parent is one of these: a member can't cancel or replace a Seeds-made parent
 * from their own wallet without Seeds noticing, because Seeds holds and can rebroadcast it.
 * Recording is best-effort after a broadcast: a missing row only means that change waits for a block.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TXID = /^[0-9a-f]{64}$/i;

export async function recordSeedsBroadcast(chain: string, txid: string | null | undefined): Promise<void> {
  if (!txid || !TXID.test(txid)) return;
  try {
    await supabaseAdmin.from("seeds_broadcasts").upsert({ chain, txid: txid.toLowerCase() }, { onConflict: "chain,txid", ignoreDuplicates: true });
  } catch { /* change from it just waits for a block */ }
}

/** Which of these txids Seeds made. Any read problem → empty set (only confirmed coins count). */
export async function seedsMadeAmong(chain: string, txids: string[]): Promise<Set<string>> {
  const ids = [...new Set(txids.filter((t) => TXID.test(t)).map((t) => t.toLowerCase()))];
  if (!ids.length) return new Set();
  try {
    const { data, error } = await supabaseAdmin.from("seeds_broadcasts").select("txid").eq("chain", chain).in("txid", ids.slice(0, 200));
    if (error || !data) return new Set();
    return new Set(data.map((r) => r.txid));
  } catch {
    return new Set();
  }
}
