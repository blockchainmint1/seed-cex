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
    // Audit Y2: now and then drop records older than 14 days (no waiting transaction lives that long).
    if (Math.random() < 0.02) await supabaseAdmin.from("seeds_broadcasts").delete().lt("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
    await supabaseAdmin.from("seeds_broadcasts").upsert({ chain, txid: txid.toLowerCase() }, { onConflict: "chain,txid", ignoreDuplicates: true });
  } catch { /* change from it just waits for a block */ }
}

/** Which of these txids Seeds made. Any read problem → empty set (only confirmed coins count). */
export async function seedsMadeAmong(chain: string, txids: string[]): Promise<Set<string>> {
  const ids = [...new Set(txids.filter((t) => TXID.test(t)).map((t) => t.toLowerCase()))];
  if (!ids.length) return new Set();
  try {
    // Audit Y2: ask in batches of 100 instead of silently dropping ids past 200.
    const out = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabaseAdmin.from("seeds_broadcasts").select("txid").eq("chain", chain).in("txid", ids.slice(i, i + 100));
      if (error || !data) return new Set();
      for (const r of data) out.add(r.txid);
    }
    return out;
  } catch {
    return new Set();
  }
}
