/** Reads a member's open top-level swaps as lanes (rules in lanes.ts) and refuses an overlapping new one. Call inside withPocketSpendLock. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { swapCoin } from "@/lib/xchain/assets";
import { assetLane, TSD_PASSES, hypeChainPasses, dexLanes, hypeChainLanes, laneBlocker, relayLanes, stonLanes, twoStepLanes, type OpenSwap } from "./lanes";

const coinLane = (id: string | null | undefined) => (id && id !== "TSD" ? assetLane(swapCoin(id)?.asset ?? id) : null);
const FAIL = "Couldn't check your other swaps. Nothing was sent. Try again in a minute.";

export async function loadOpenSwaps(userId: string): Promise<OpenSwap[]> {
  const [tsd, sends, dex, two, relay, ston, chains] = await Promise.all([
    supabaseAdmin.from("tsd_routes").select("coin_asset, swap_send_id").eq("user_id", userId).is("parent_id", null).not("stage", "in", "(done,refunded,kept_usdc,failed)"),
    supabaseAdmin.from("swap_sends").select("id, from_asset, to_asset").eq("user_id", userId).is("parent_id", null).in("status", ["signing", "sent", "unknown"]),
    supabaseAdmin.from("dex_swaps").select("network, token_in, token_out").eq("user_id", userId).is("two_step_id", null).is("tsd_route_id", null)
      .not("status", "in", "(done,failed,declined,expired,cancelled,kept_usdc)"),
    supabaseAdmin.from("two_step_swaps").select("network, token_address, coin_id, mid_id").eq("user_id", userId)
      .not("status", "in", "(done,failed,refunded,kept_mid,declined,expired,cancelled)"),
    supabaseAdmin.from("relay_swaps").select("direction").eq("user_id", userId).is("parent_id", null).not("status", "in", "(done,refunded,failed,declined,expired,cancelled)"),
    supabaseAdmin.from("ton_swaps").select("id").eq("user_id", userId).is("parent_id", null).in("status", ["signing", "sent", "unknown"]),
    supabaseAdmin.from("hype_chains").select("direction, status, coin_id").eq("user_id", userId).not("status", "in", "(done,failed,kept_mid,declined,expired,cancelled)"),
  ]);
  if (tsd.error || sends.error || dex.error || two.error || relay.error || ston.error || chains.error) throw new Error(FAIL);
  const tsdLegs = new Set((tsd.data ?? []).map((r) => r.swap_send_id).filter(Boolean));
  const out: OpenSwap[] = [];
  for (const r of tsd.data ?? []) out.push({ kind: "tsd", lanes: [assetLane(r.coin_asset)].filter((x): x is string => !!x), passes: TSD_PASSES });
  for (const r of sends.data ?? []) if (!tsdLegs.has(r.id)) out.push({ kind: "send", lanes: [assetLane(r.from_asset), assetLane(r.to_asset)].filter((x): x is string => !!x) });
  for (const r of dex.data ?? []) out.push({ kind: "dex", lanes: dexLanes(r.network, r.token_in, r.token_out) });
  for (const r of two.data ?? []) out.push({ kind: "two_step", lanes: twoStepLanes(r.network, r.token_address, coinLane(r.coin_id), coinLane(r.mid_id)) });
  for (const r of relay.data ?? []) out.push({ kind: "relay", lanes: relayLanes(r.direction) });
  for (const _ of ston.data ?? []) out.push({ kind: "ston", lanes: stonLanes() });
  for (const r of chains.data ?? []) out.push({ kind: "hype_chain", lanes: hypeChainLanes(r.direction, r.status, coinLane(r.coin_id)), passes: hypeChainPasses(r.status) });
  return out;
}

export async function assertSwapLaneFree(userId: string, next: OpenSwap): Promise<void> {
  const why = laneBlocker(next, await loadOpenSwaps(userId));
  if (why) throw new Error(why);
}

export { coinLane };
