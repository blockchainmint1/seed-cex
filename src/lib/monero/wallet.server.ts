/**
 * Monero watch wallets (view key only) for balances, and one-off spend wallets for sends.
 * Display balances come from monero_wallets (filled by the scheduled scan); sends re-read live.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { scReduce } from "@/lib/pockets/monero";
import { previewProblem, restoreHeight, watchWalletName } from "./rules";
import { MoneroRpcError, moneroServerReady, walletPassword, walletRpc } from "./rpc.server";

const LEASE_SECONDS = 90;

async function withLease<T>(holder: string, fn: () => Promise<T>, waitMs = 20_000): Promise<T> {
  const until = Date.now() + waitMs;
  for (;;) {
    const { data } = await supabaseAdmin.rpc("monero_take_lease", { _holder: holder, _seconds: LEASE_SECONDS });
    if (data === true) break;
    if (Date.now() > until) throw new Error("Seeds' Monero server is busy. Try again in a minute.");
    await new Promise((r) => setTimeout(r, 1500));
  }
  try {
    return await fn();
  } finally {
    await walletRpc("close_wallet", { autosave_current: true }).catch(() => null);
    await supabaseAdmin.rpc("monero_release_lease", { _holder: holder });
  }
}

/** Remember that this member's Monero pocket should be watched (no key is touched here). */
export async function requestWatch(userId: string, linkId: string, address: string): Promise<void> {
  await supabaseAdmin.from("monero_wallets").upsert(
    { link_id: linkId, user_id: userId, address, wallet_name: watchWalletName(address) },
    { onConflict: "link_id", ignoreDuplicates: true },
  );
}

/** Display reading from the last scan: unlocked = balance, the rest = arriving. */
export async function storedReading(linkId: string): Promise<{ balance: number | null; arriving: number }> {
  const { data } = await supabaseAdmin.from("monero_wallets").select("status, balance_units, unlocked_units").eq("link_id", linkId).maybeSingle();
  if (!data || data.status !== "ready" || data.unlocked_units == null || data.balance_units == null) return { balance: null, arriving: 0 };
  const bal = BigInt(String(data.balance_units));
  const unl = BigInt(String(data.unlocked_units));
  return { balance: Number(unl) / 1e12, arriving: bal > unl ? Number(bal - unl) / 1e12 : 0 };
}

type Row = { link_id: string; user_id: string; address: string; wallet_name: string; restore_height: number | null; status: string; tries: number };

/** Create the watch wallet for a pending row: unlocks the pocket key once, hands the server the VIEW key only. */
async function register(row: Row): Promise<void> {
  const { data: link } = await supabaseAdmin.from("hme_links").select("id, key_ciphertext, created_at, status").eq("id", row.link_id).maybeSingle();
  if (!link || link.status !== "active" || !link.key_ciphertext) {
    await supabaseAdmin.from("monero_wallets").update({ status: "failed", error: "link not active", updated_at: new Date().toISOString() }).eq("link_id", row.link_id);
    return;
  }
  const { withPocketKey } = await import("@/lib/xchain/send.server");
  const viewHex = await withPocketKey({ id: link.id, ciphertext: link.key_ciphertext }, "XMR", row.address, async (spend) => {
    const view = scReduce(keccak_256(spend));
    try { return bytesToHex(view); } finally { view.fill(0); }
  });
  const { height } = await walletRpc<{ height: number }>("get_height").catch(() => ({ height: 0 }));
  const start = row.restore_height ?? restoreHeight(height, new Date(link.created_at).getTime(), Date.now());
  try {
    await walletRpc("generate_from_keys", {
      filename: row.wallet_name, address: row.address, viewkey: viewHex, password: await walletPassword(row.wallet_name),
      restore_height: start, autosave_current: true,
    }, 60_000);
  } catch (e) {
    // Already created on an earlier try: that's fine.
    if (!(e instanceof MoneroRpcError && /exist/i.test(e.message))) throw e;
  }
  await supabaseAdmin.from("monero_wallets").update({ status: "ready", restore_height: start, error: null, updated_at: new Date().toISOString() }).eq("link_id", row.link_id);
}

async function scan(row: Row): Promise<void> {
  await walletRpc("open_wallet", { filename: row.wallet_name, password: await walletPassword(row.wallet_name) });
  await walletRpc("refresh", {}, 50_000);
  const b = await walletRpc<{ balance: number | string; unlocked_balance: number | string }>("get_balance", { account_index: 0 });
  const h = await walletRpc<{ height: number }>("get_height");
  await supabaseAdmin.from("monero_wallets").update({
    balance_units: Number(b.balance), unlocked_units: Number(b.unlocked_balance), scanned_height: h.height,
    scanned_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString(),
  }).eq("link_id", row.link_id);
}

/** Scheduled: register pending watch wallets and refresh the oldest balances, within a time budget. */
export async function advanceMonero(budgetMs = 45_000): Promise<{ registered: number; scanned: number; skipped?: string }> {
  if (!moneroServerReady()) return { registered: 0, scanned: 0, skipped: "Monero server not configured" };
  const started = Date.now();
  let registered = 0;
  let scanned = 0;
  const { data: rows } = await supabaseAdmin.from("monero_wallets")
    .select("link_id, user_id, address, wallet_name, restore_height, status, tries")
    .in("status", ["pending", "ready"]).order("scanned_at", { ascending: true, nullsFirst: true }).limit(50);
  for (const row of (rows ?? []) as Row[]) {
    if (Date.now() - started > budgetMs) break;
    try {
      await withLease(`scan:${row.link_id}`, async () => {
        if (row.status === "pending") { await register(row); registered++; }
        await scan(row);
        scanned++;
      }, 5_000);
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 200) : "scan failed";
      const tries = row.tries + 1;
      await supabaseAdmin.from("monero_wallets").update({
        tries, error: msg, updated_at: new Date().toISOString(), ...(row.status === "pending" && tries >= 10 ? { status: "failed" } : {}),
      }).eq("link_id", row.link_id);
      if (/busy/.test(msg)) break;
    }
  }
  return { registered, scanned };
}

/** Live unlocked balance for a send-time check (watch wallet, refreshed now). */
export async function liveUnlocked(linkId: string): Promise<bigint | null> {
  if (!moneroServerReady()) return null;
  const { data } = await supabaseAdmin.from("monero_wallets").select("link_id, user_id, address, wallet_name, restore_height, status, tries").eq("link_id", linkId).maybeSingle();
  if (!data || data.status !== "ready") return null;
  return withLease(`read:${linkId}:${crypto.randomUUID()}`, async () => {
    await scan(data as Row);
    const b = await walletRpc<{ unlocked_balance: number | string }>("get_balance", { account_index: 0 });
    return BigInt(String(b.unlocked_balance));
  });
}

/**
 * Send `units` XMR from the member's pocket. The spend key goes into a throwaway wallet on Seeds'
 * Monero server, the payment is built WITHOUT relaying, checked here (address, amount, fee cap),
 * the txid recorded, then relayed. The throwaway wallet is closed either way; the server wipes it.
 */
export async function sendMonero(link: { id: string; ciphertext: string | null }, from: string, to: string, units: bigint, record: (txid: string) => Promise<void>): Promise<string> {
  const { data: w } = await supabaseAdmin.from("monero_wallets").select("restore_height, status").eq("link_id", link.id).maybeSingle();
  if (!w || w.status !== "ready" || w.restore_height == null) throw new Error("Seeds hasn't finished reading your Monero pocket yet. Nothing was sent.");
  const tempName = `seeds-send-${crypto.randomUUID()}`;
  return withLease(`send:${link.id}`, async () => {
    const { withPocketKey } = await import("@/lib/xchain/send.server");
    await withPocketKey(link, "XMR", from, async (spend) => {
      const view = scReduce(keccak_256(spend));
      try {
        await walletRpc("generate_from_keys", {
          filename: tempName, address: from, spendkey: bytesToHex(spend), viewkey: bytesToHex(view),
          password: await walletPassword(tempName), restore_height: w.restore_height, autosave_current: false,
        }, 60_000);
      } finally { view.fill(0); }
    });
    await walletRpc("refresh", {}, 50_000);
    const built = await walletRpc<{ amount: number | string; fee: number | string; tx_hash: string; tx_metadata: string }>("transfer", {
      destinations: [{ amount: Number(units), address: to }], account_index: 0, priority: 0, ring_size: 16,
      do_not_relay: true, get_tx_metadata: true, get_tx_key: false,
    }, 50_000);
    const problem = previewProblem(
      { amount: BigInt(String(built.amount)), fee: BigInt(String(built.fee)), destinations: [{ address: to, amount: BigInt(String(built.amount)) }] },
      { to, units },
    );
    if (problem) throw new Error(problem);
    await record(built.tx_hash);
    await walletRpc("relay_tx", { hex: built.tx_metadata }, 30_000);
    return built.tx_hash;
  }, 30_000);
}
