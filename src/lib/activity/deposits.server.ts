/**
 * Deposit history (server-only, read-only on every chain). Rules: deposit-rules.ts.
 *
 * syncDeposits reads one member's pocket history at most every 2 minutes (claimed in
 * pocket_deposit_sync, so two tabs never read twice): full history for TXC (+ TSD on
 * Omni), ISK, Ethereum, Base and BNB Chain; a balance watch for every other coin.
 * Rows are permanent; a repeat sees the same transaction and adds nothing.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChain } from "@/lib/chains";
import { nodeEndpoints, type NodeNetwork } from "@/lib/nodes.server";
import { EXPLORER_BASE } from "@/lib/utxo/explorer-rules";
import { EVM_NATIVE, WITHDRAW_COINS, type WithdrawCoin } from "@/lib/withdraw/catalog";
import {
  FIRST_PAGES, HISTORY_NETWORKS, SYNC_EVERY_MS, alchemyDeposits, esploraDeposit, isOmniCarrier, omniDeposit, seedsLabel, watchedDeposit,
  type AlchemyTransfer, type EsploraTx, type FoundDeposit, type OmniTx, type SeedsTx,
} from "./deposit-rules";

const TSD_PROPERTY = 39;
const UA = { accept: "application/json", "User-Agent": "seeds-exchange/1.0" };
const explorerFor = (network: string) =>
  network === "txc-omni" ? WITHDRAW_COINS.find((c) => c.network === "txc")!.explorerTx : WITHDRAW_COINS.find((c) => c.network === network)?.explorerTx ?? null;

type Row = { network: string; address: string; d: FoundDeposit; source: "chain" | "watch" };

/** Transactions Seeds itself made that pay a member: swap payouts, trade and P2P releases, TSD Bridge payouts. */
async function seedsTxids(userId: string): Promise<SeedsTx> {
  const [sends, routes, dex, p2p, trades] = await Promise.all([
    supabaseAdmin.from("swap_sends").select("out_txid").eq("user_id", userId).not("out_txid", "is", null).limit(500),
    supabaseAdmin.from("tsd_routes").select("usdc_txid, bridge_out_txid").eq("user_id", userId).limit(500),
    supabaseAdmin.from("dex_swaps").select("swap_txid").eq("user_id", userId).not("swap_txid", "is", null).limit(500),
    supabaseAdmin.from("p2p_trades").select("release_txid").eq("buyer_id", userId).not("release_txid", "is", null).limit(500),
    supabaseAdmin.from("trades").select("id").or(`maker_id.eq.${userId},taker_id.eq.${userId}`).limit(500),
  ]);
  const out: SeedsTx = {};
  const put = (tx: string | null | undefined, label: string) => { if (tx) out[tx.toLowerCase()] = label; };
  for (const s of sends.data ?? []) put(s.out_txid, "Seeds swap");
  for (const r of routes.data ?? []) { put(r.usdc_txid, "TSD Bridge"); put(r.bridge_out_txid, "TSD Bridge"); }
  for (const d of dex.data ?? []) put(d.swap_txid, "Seeds swap");
  for (const p of p2p.data ?? []) put(p.release_txid, "P2P trade");
  const ids = (trades.data ?? []).map((t) => t.id);
  if (ids.length) {
    const { data: esc } = await supabaseAdmin.from("escrows").select("release_txid").in("trade_id", ids).not("release_txid", "is", null);
    for (const e of esc ?? []) put(e.release_txid, "Seeds trade");
  }
  return out;
}

async function knownTxids(userId: string, network: string): Promise<Set<string>> {
  const { data } = await supabaseAdmin.from("pocket_deposits").select("txid").eq("user_id", userId).eq("network", network).limit(5000);
  return new Set((data ?? []).map((r) => r.txid.toLowerCase()));
}

/* ------------------------------ Esplora (TXC / ISK) ------------------------------ */

async function esploraPage(chain: "txc" | "isk", address: string, after: string | null): Promise<EsploraTx[] | null> {
  const path = after ? `/api/address/${encodeURIComponent(address)}/txs/chain/${after}` : `/api/address/${encodeURIComponent(address)}/txs`;
  try {
    const res = await fetch(`${EXPLORER_BASE[chain]}${path}`, { headers: UA, signal: AbortSignal.timeout(8_000) });
    return res.ok ? ((await res.json()) as EsploraTx[]) : null;
  } catch {
    return null;
  }
}

async function readEsplora(chain: "txc" | "isk", address: string, known: Set<string>, firstTime: boolean): Promise<{ rows: Row[]; complete: boolean }> {
  const rows: Row[] = [];
  const maxPages = firstTime ? FIRST_PAGES : 2;
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const txs = await esploraPage(chain, address, after);
    if (!txs) return { rows, complete: false };
    const carriers = chain === "txc" ? txs.filter((t) => t.status?.confirmed && isOmniCarrier(t) && !known.has(t.txid.toLowerCase())) : [];
    if (carriers.length) {
      const { rpcBatch } = await import("@/lib/rpc.server");
      const replies = await rpcBatch<OmniTx>("txc", carriers.map((t) => ({ method: "omni_gettransaction", params: [t.txid] })), 8_000).catch(() => null);
      if (!replies) return { rows, complete: false };
      replies.forEach((r) => {
        if (r instanceof Error) return;
        const d = omniDeposit(r, address, { [TSD_PROPERTY]: "TSD" });
        if (d) rows.push({ network: "txc-omni", address, d, source: "chain" });
      });
    }
    let hitKnown = false;
    for (const t of txs) {
      if (known.has(t.txid.toLowerCase())) { hitKnown = true; continue; }
      if (chain === "txc" && isOmniCarrier(t)) continue; // its TXC output is only the Omni carrier's dust
      const d = esploraDeposit(t, address, chain.toUpperCase());
      if (d) rows.push({ network: chain, address, d, source: "chain" });
    }
    const confirmed = txs.filter((t) => t.status?.confirmed);
    if (hitKnown || confirmed.length < 25) return { rows, complete: true };
    after = confirmed[confirmed.length - 1]!.txid;
  }
  return { rows, complete: !firstTime };
}

/* ------------------------------ Alchemy (EVM) ------------------------------ */

function knownTokens(net: string) {
  const chain = getChain(net as never);
  const tokens: Record<string, { symbol: string; decimals: number }> = {};
  for (const c of WITHDRAW_COINS) {
    if (c.kind !== "evm" || c.evmChain !== net || c.symbol === EVM_NATIVE[net]) continue;
    const a = chain.assets.find((x) => x.symbol === c.symbol);
    if (a?.contract) tokens[a.contract.toLowerCase()] = { symbol: c.symbol, decimals: a.decimals };
  }
  return { native: EVM_NATIVE[net] ?? "ETH", tokens };
}

async function readAlchemy(net: "ethereum" | "base" | "bsc", address: string, known: Set<string>, firstTime: boolean): Promise<{ rows: Row[]; complete: boolean }> {
  const ep = nodeEndpoints(net as NodeNetwork).find((e) => e.provider === "alchemy");
  if (!ep) return { rows: [], complete: false };
  const k = knownTokens(net);
  const rows: Row[] = [];
  let pageKey: string | undefined;
  const maxPages = firstTime ? FIRST_PAGES : 1;
  for (let page = 0; page < maxPages; page++) {
    let body: { result?: { transfers?: AlchemyTransfer[]; pageKey?: string }; error?: unknown } | null = null;
    try {
      const res = await fetch(ep.url, {
        method: "POST", headers: ep.headers, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [{
          fromBlock: "0x0", toBlock: "latest", toAddress: address, category: ["external", "erc20"],
          withMetadata: true, excludeZeroValue: true, maxCount: "0x64", order: "desc", ...(pageKey ? { pageKey } : {}),
        }] }),
      });
      body = res.ok ? await res.json() : null;
    } catch {
      body = null;
    }
    // Never log ep.url: Alchemy's key is in it.
    if (!body?.result) return { rows, complete: false };
    const list = body.result.transfers ?? [];
    for (const d of alchemyDeposits(list, address, k)) if (!known.has(d.txid.toLowerCase())) rows.push({ network: net, address, d, source: "chain" });
    if (list.some((t) => known.has(t.hash.toLowerCase())) || !body.result.pageKey) return { rows, complete: true };
    pageKey = body.result.pageKey;
  }
  return { rows, complete: !firstTime };
}

/* ------------------------------ balance watch ------------------------------ */

/** What Seeds' own swaps finished delivering of this coin into the pocket since `since`. */
async function deliveredSince(userId: string, c: WithdrawCoin, since: string): Promise<number> {
  let total = 0;
  if (c.addressAsset) {
    const [sends, routes] = await Promise.all([
      supabaseAdmin.from("swap_sends").select("expected_out").eq("user_id", userId).eq("to_asset", c.addressAsset).eq("status", "done").gte("updated_at", since),
      supabaseAdmin.from("tsd_routes").select("amount_out, shown_out").eq("user_id", userId).eq("coin_asset", c.addressAsset).eq("direction", "buy").eq("stage", "done").gte("updated_at", since),
    ]);
    for (const s of sends.data ?? []) total += Number(s.expected_out) || 0;
    for (const r of routes.data ?? []) total += Number(r.amount_out ?? r.shown_out) || 0;
  }
  if (c.kind === "evm") {
    const { data } = await supabaseAdmin.from("dex_swaps").select("amount_out").eq("user_id", userId).eq("network", c.network).eq("symbol_out", c.symbol).eq("status", "done").gte("updated_at", since);
    for (const d of data ?? []) total += Number(d.amount_out) || 0;
  }
  return total;
}

async function watchCoins(userId: string, addresses: Partial<Record<string, string>>): Promise<Row[]> {
  const coins = WITHDRAW_COINS.filter((c) => !["txc-omni", "txc", "isk", ...HISTORY_NETWORKS].includes(c.network) && addresses[c.pocket]);
  if (!coins.length) return [];
  const { readBalance } = await import("@/lib/withdraw/send.server");
  const { data: prev } = await supabaseAdmin.from("pocket_deposit_watch").select("coin_key, address, amount, seen_at").eq("user_id", userId);
  const before = new Map((prev ?? []).map((p) => [p.coin_key, p]));
  const rows: Row[] = [];
  await Promise.all(coins.map(async (c) => {
    const address = addresses[c.pocket]!;
    const bal = await readBalance(c, address).catch(() => null);
    if (bal?.units == null) return; // network didn't answer: never record a zero
    const now = Number(bal.units) / 10 ** c.decimals;
    const p = before.get(c.key);
    const samePlace = p && p.address === address;
    if (samePlace) {
      const amount = watchedDeposit(Number(p.amount), now, await deliveredSince(userId, c, p.seen_at));
      if (amount) {
        const at = new Date().toISOString();
        rows.push({ network: c.network, address, source: "watch", d: { txid: `watch:${c.key}:${at}`, coin: c.symbol, amount, blockTime: at, from: null } });
      }
    }
    await supabaseAdmin.from("pocket_deposit_watch").upsert({ user_id: userId, coin_key: c.key, address, amount: now, seen_at: new Date().toISOString() }, { onConflict: "user_id,coin_key" });
  }));
  return rows;
}

/* ---------------------------------- sync ---------------------------------- */

export async function syncDeposits(userId: string): Promise<{ added: number; skipped?: boolean }> {
  const now = new Date();
  await supabaseAdmin.from("pocket_deposit_sync").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data: claimed } = await supabaseAdmin
    .from("pocket_deposit_sync")
    .update({ working_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq("user_id", userId)
    .or(`and(or(synced_at.is.null,synced_at.lt.${new Date(now.getTime() - SYNC_EVERY_MS).toISOString()}),or(working_until.is.null,working_until.lt.${now.toISOString()}))`)
    .select("backfilled")
    .maybeSingle();
  if (!claimed) return { added: 0, skipped: true };
  const backfilled = { ...((claimed.backfilled ?? {}) as Record<string, boolean>) };
  let added = 0;
  try {
    const { loadLink } = await import("@/lib/xchain/send.server");
    const link = await loadLink(userId);
    if (!link) return { added: 0 };
    const a = link.addresses as Partial<Record<string, string>>;
    const jobs: Array<Promise<{ key: string; rows: Row[]; complete: boolean }>> = [];
    const known = async (network: string) => knownTxids(userId, network);
    if (a.TXC) jobs.push((async () => {
      const k = new Set([...(await known("txc")), ...(await known("txc-omni"))]);
      return { key: "txc", ...(await readEsplora("txc", a.TXC!, k, !backfilled.txc)) };
    })());
    if (a.ISK) jobs.push((async () => ({ key: "isk", ...(await readEsplora("isk", a.ISK!, await known("isk"), !backfilled.isk)) }))());
    if (a.EVM) for (const net of ["ethereum", "base", "bsc"] as const) {
      jobs.push((async () => ({ key: net, ...(await readAlchemy(net, a.EVM!, await known(net), !backfilled[net])) }))());
    }
    const [results, watched, labels] = await Promise.all([
      Promise.all(jobs.map((j) => j.catch(() => ({ key: "", rows: [] as Row[], complete: false })))),
      watchCoins(userId, a).catch(() => [] as Row[]),
      seedsTxids(userId),
    ]);
    const all = [...results.flatMap((r) => r.rows), ...watched];
    for (const r of results) if (r.key && r.complete) backfilled[r.key] = true;
    if (all.length) {
      const insert = all.map((r) => {
        const base = explorerFor(r.network);
        return {
          user_id: userId, network: r.network, coin: r.d.coin, token_address: r.d.tokenAddress ?? null, address: r.address,
          amount: r.d.amount, txid: r.d.txid, tx_url: r.source === "chain" && base ? `${base}${r.d.txid}` : null,
          from_address: r.d.from, from_seeds: r.source === "chain" ? seedsLabel(r.d.txid, labels) : null,
          block_time: r.d.blockTime, source: r.source,
        };
      });
      const { data, error } = await supabaseAdmin.from("pocket_deposits").upsert(insert, { onConflict: "user_id,network,txid,coin", ignoreDuplicates: true }).select("id");
      if (error) console.error("[deposits] save failed", error.message);
      added = data?.length ?? 0;
    }
    return { added };
  } finally {
    await supabaseAdmin.from("pocket_deposit_sync").update({ synced_at: new Date().toISOString(), working_until: null, backfilled }).eq("user_id", userId);
  }
}

/** Every-5-minute job: deposit history for members with a linked pocket, longest-unchecked first. */
export async function syncDueDeposits(limit = 4): Promise<{ checked: number; added: number }> {
  const { data: links } = await supabaseAdmin.from("hme_links").select("user_id").eq("status", "active").limit(2000);
  const users = [...new Set((links ?? []).map((l) => l.user_id))];
  if (!users.length) return { checked: 0, added: 0 };
  const { data: syncs } = await supabaseAdmin.from("pocket_deposit_sync").select("user_id, synced_at").in("user_id", users);
  const last = new Map((syncs ?? []).map((s) => [s.user_id, s.synced_at ? Date.parse(s.synced_at) : 0]));
  const due = users.sort((x, y) => (last.get(x) ?? 0) - (last.get(y) ?? 0)).slice(0, limit);
  let added = 0;
  for (const u of due) added += (await syncDeposits(u).catch((e) => { console.error("[deposits] sync failed", (e as Error).message); return { added: 0 }; })).added;
  return { checked: due.length, added };
}
