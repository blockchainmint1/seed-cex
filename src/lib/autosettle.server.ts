/**
 * Instant settlement — no escrow hold, no manual Fund/Release step.
 *
 * The moment two orders cross, both legs are delivered directly from each
 * seller's authorized trading branch to the buyer's own receiving address.
 * Funds never rest in an intermediate address: the "escrow" rows are only
 * bookkeeping for the two legs of the fill.
 *
 * Each leg is attempted independently. A leg that cannot settle (no live
 * authorization, cap exceeded, insufficient balance, node offline) is recorded
 * as a `*_autosettle_failed` trade event and left for a manual retry from the
 * trade panel — the other leg is not blocked by it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LegId } from "@/lib/chains";

export type AutoLegResult = {
  leg: LegId;
  ok: boolean;
  txid?: string;
  amount?: number;
  to?: string;
  error?: string;
};

async function settleOne(actorId: string, tradeId: string, leg: LegId): Promise<AutoLegResult> {
  if (leg === "tsd") {
    const { settleTsdLeg } = await import("./tsd-settlement.server");
    const r = await settleTsdLeg(actorId, tradeId);
    return { leg, ok: true, txid: r.txid, amount: r.amount, to: r.to };
  }
  if (leg === "txc" || leg === "ltc" || leg === "isk") {
    const { settleUtxoLeg } = await import("./settlement.server");
    const r = await settleUtxoLeg(actorId, tradeId, leg);
    return { leg, ok: true, txid: r.txid, amount: r.amount, to: r.to };
  }
  const { settleEvmLeg } = await import("./evm-settlement.server");
  const r = await settleEvmLeg(actorId, tradeId, leg);
  return { leg, ok: true, txid: r.hash, amount: r.amount, to: r.to };
}

/** Deliver every leg of a freshly matched trade, immediately. */
export async function autoSettleTrade(tradeId: string): Promise<AutoLegResult[]> {
  const { data: trade } = await supabaseAdmin
    .from("trades")
    .select("id, maker_id, status")
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) return [];
  if (trade.status === "settled" || trade.status === "disputed") return [];
  const actor = trade.maker_id;
  if (!actor) return [];

  const { data: legs } = await supabaseAdmin
    .from("escrows")
    .select("leg, release_txid")
    .eq("trade_id", tradeId);

  const results: AutoLegResult[] = [];
  for (const row of legs ?? []) {
    const leg = row.leg as LegId;
    // Already broadcast? Never send twice.
    if (row.release_txid && !row.release_txid.startsWith("sim-")) continue;
    try {
      results.push(await settleOne(actor, tradeId, leg));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Settlement failed";
      results.push({ leg, ok: false, error: message });
      await supabaseAdmin.from("trade_events").insert({
        trade_id: tradeId,
        actor_id: actor,
        event: `${leg}_autosettle_failed`,
        detail: { error: message },
      });
    }
  }
  return results;
}

/** Auto-settle a batch of fills; never throws into the order path. */
export async function autoSettleTrades(tradeIds: string[]) {
  const out: Array<{ tradeId: string; legs: AutoLegResult[] }> = [];
  for (const id of tradeIds) {
    try {
      out.push({ tradeId: id, legs: await autoSettleTrade(id) });
    } catch {
      out.push({ tradeId: id, legs: [] });
    }
  }
  return out;
}
