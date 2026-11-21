/**
 * Seeds' own market history: every 5 minutes, write what THORChain is saying
 * right now into market_snapshots_5min, chain_snapshots and network_snapshots,
 * then keep it tidy (hourly rollup, old rows pruned).
 *
 * Called only by the scheduled job (cron-authenticated). Market figures come
 * from fetchThorMarketsLive() — a fresh THORChain reading, deliberately not the
 * stored-preferring fetchThorMarkets() the pages use, or this job would store
 * its own last slice again every 5 minutes and the history would never move.
 * The rest comes straight from THORNode. Row shapes and unit conversion are
 * decided by snapshot-rules.ts (tested).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchThorMarketsLive, rawNodePools, thornode } from "./thor-markets.server";
import {
  chainRows,
  marketRows,
  networkRow,
  snapshotBucket,
  type ChainSnapshotRow,
  type MarketSnapshotRow,
  type NetworkSnapshotRow,
  type RawConstants,
  type RawInbound,
  type RawNode,
} from "./snapshot-rules";

export type SnapshotResult = {
  bucket: string;
  markets: number;
  chains: number;
  network: boolean;
  rolledUp: number;
  prunedRaw: number;
  prunedHourly: number;
  notes: string[];
};

/** The 1.5 MB node list is only worth reading once an hour. */
function onTheHour(bucket: string): boolean {
  const m = new Date(bucket).getUTCMinutes();
  return Number.isFinite(m) ? m === 0 : false;
}

/** One 5-minute slice of history. Safe to run twice in the same window. */
export async function recordMarketSnapshot(): Promise<SnapshotResult> {
  const bucket = snapshotBucket();
  const notes: string[] = [];
  let markets = 0;
  let chains = 0;
  let network = false;
  let rolledUp = 0;
  let prunedRaw = 0;
  let prunedHourly = 0;

  /* ------------------------------ markets ------------------------------- */
  try {
    const [live, pools] = await Promise.all([
      fetchThorMarketsLive(),
      rawNodePools().catch((e) => {
        notes.push(`pool detail unread: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
        return [];
      }),
    ]);
    const rows: MarketSnapshotRow[] = marketRows(live, pools, bucket);
    markets = rows.length;
    if (!rows.length) notes.push("no priced markets — nothing stored");
    else {
      const { error } = await supabaseAdmin.from("market_snapshots_5min").upsert(rows, { onConflict: "bucket,slug" });
      if (error) notes.push(`market_snapshots_5min: ${error.message}`.slice(0, 300));
    }
  } catch (e) {
    notes.push(`markets unread: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }

  /* ------------------------------- chains ------------------------------- */
  try {
    const inbound = await thornode<RawInbound[]>("/thorchain/inbound_addresses");
    const rows: ChainSnapshotRow[] = chainRows(Array.isArray(inbound) ? inbound : [], bucket);
    chains = rows.length;
    if (rows.length) {
      const { error } = await supabaseAdmin.from("chain_snapshots").upsert(rows, { onConflict: "bucket,chain" });
      if (error) notes.push(`chain_snapshots: ${error.message}`.slice(0, 300));
    }
  } catch (e) {
    notes.push(`chains unread: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }

  /* ------------------------------ network ------------------------------- */
  try {
    const [queue, constants, nodes] = await Promise.all([
      thornode<unknown[]>("/thorchain/queue/scheduled").then((q) => (Array.isArray(q) ? q.length : null)).catch(() => null),
      thornode<RawConstants>("/thorchain/constants").catch(() => null),
      onTheHour(bucket) ? thornode<RawNode[]>("/thorchain/nodes").catch(() => null) : Promise.resolve(null),
    ]);
    const row: NetworkSnapshotRow = networkRow(queue, constants, Array.isArray(nodes) ? nodes : null, bucket);
    const { error } = await supabaseAdmin.from("network_snapshots").upsert([row], { onConflict: "bucket" });
    if (error) notes.push(`network_snapshots: ${error.message}`.slice(0, 300));
    else network = true;
  } catch (e) {
    notes.push(`network unread: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
  }

  /* --------------------- rollup + prune, once an hour ------------------- */
  if (onTheHour(bucket)) {
    const { data: roll, error: rollErr } = await supabaseAdmin.rpc("market_snapshots_rollup");
    if (rollErr) notes.push(`rollup: ${rollErr.message}`.slice(0, 200));
    else rolledUp = Number(roll) || 0;

    const { data: prune, error: pruneErr } = await supabaseAdmin.rpc("market_snapshots_prune");
    if (pruneErr) notes.push(`prune: ${pruneErr.message}`.slice(0, 200));
    else {
      const p = Array.isArray(prune) ? prune[0] : prune;
      prunedRaw = Number((p as { raw_removed?: number } | null)?.raw_removed) || 0;
      prunedHourly = Number((p as { hourly_removed?: number } | null)?.hourly_removed) || 0;
    }

    // Week-old shared display copies (mostly balances of members who stopped visiting).
    const { error: cacheErr } = await supabaseAdmin.rpc("shared_cache_prune");
    if (cacheErr) notes.push(`cache prune: ${cacheErr.message}`.slice(0, 200));

    // Day-old coin/wallet sign-in requests (each holds a sealed one-time key; auditor K5).
    const { KEY_REQUEST_KEEP_MS } = await import("@/lib/key-signin/rules");
    const { error: keyErr } = await supabaseAdmin.from("key_signin_requests").delete()
      .lt("expires_at", new Date(Date.now() - KEY_REQUEST_KEEP_MS).toISOString());
    if (keyErr) notes.push(`key request prune: ${keyErr.message}`.slice(0, 200));
  }

  return { bucket, markets, chains, network, rolledUp, prunedRaw, prunedHourly, notes };
}
