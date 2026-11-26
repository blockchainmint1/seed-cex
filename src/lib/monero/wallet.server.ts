/**
 * Monero watch wallets (view key only) for balances, and one-off spend wallets for sends.
 * Display balances come from monero_wallets (filled by the scheduled scan); sends re-read live.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { scReduce } from "@/lib/pockets/monero";
import { previewFromDescribe, previewProblem, samePreview, restoreHeight, watchWalletName } from "./rules";
import { MoneroRpcError, moneroRpc, moneroServerReady, moneroSignerReady, throwawayPassword, walletPassword, walletRpc } from "./rpc.server";

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

/**
 * Create the watch wallet for a pending row: unlocks the pocket key once per member (rows leave
 * "pending" after success or 10 tries), hands the server the VIEW key only. Audit Z3: accepted by
 * Bobby Nov 24 2026 as the one scheduled key unlock, because Monero balances can't be read without it.
 */
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
 * Send `units` XMR from the member's pocket by cold signing (audit Z1/Z2):
 * 1. the VIEW-ONLY watch wallet exports its outputs;
 * 2. the separate offline signer (RAM-only wallet dir, own token) loads the spend key into a
 *    throwaway wallet with a random, never-stored password, imports the outputs and exports key images;
 * 3. the watch wallet imports the key images and builds an UNSIGNED set;
 * 4. Seeds reads that set back (describe_transfer) and checks recipient, amount, change and fee cap;
 * 5. the signer signs it, the throwaway wallet is closed WITHOUT saving;
 * 6. the txid is recorded, then the watch server submits it.
 * The watch server never sees the spend key.
 */
export async function sendMonero(link: { id: string; ciphertext: string | null }, from: string, to: string, units: bigint, record: (txid: string) => Promise<void>): Promise<string> {
  if (!moneroSignerReady()) throw new Error("Seeds' Monero signer isn't connected yet. Nothing was sent.");
  const { data: w } = await supabaseAdmin.from("monero_wallets").select("link_id, user_id, address, wallet_name, restore_height, status, tries").eq("link_id", link.id).maybeSingle();
  if (!w || w.status !== "ready" || w.restore_height == null) throw new Error("Seeds hasn't finished reading your Monero pocket yet. Nothing was sent.");
  const row = w as Row;
  return withLease(`send:${link.id}`, async () => {
    await scan(row); // opens + refreshes the watch wallet
    const { outputs_data_hex } = await walletRpc<{ outputs_data_hex: string }>("export_outputs", { all: true }, 30_000);
    const signerName = `seeds-sign-${crypto.randomUUID()}`;
    const { withPocketKey } = await import("@/lib/xchain/send.server");
    const signed = await withPocketKey(link, "XMR", from, async (spend) => {
      const view = scReduce(keccak_256(spend));
      try {
        await moneroRpc("signer", "generate_from_keys", {
          filename: signerName, address: from, spendkey: bytesToHex(spend), viewkey: bytesToHex(view),
          password: throwawayPassword(), restore_height: row.restore_height, autosave_current: false,
        }, 60_000);
      } finally { view.fill(0); }
      try {
        await moneroRpc("signer", "import_outputs", { outputs_data_hex }, 30_000);
        const ki = await moneroRpc<{ signed_key_images?: unknown[] }>("signer", "export_key_images", { all: true }, 30_000);
        await walletRpc("import_key_images", { signed_key_images: ki.signed_key_images ?? [] }, 30_000);
        const built = await walletRpc<{ unsigned_txset?: string }>("transfer", {
          destinations: [{ amount: Number(units), address: to }], account_index: 0, priority: 0, do_not_relay: true,
        }, 50_000);
        if (!built.unsigned_txset) throw new Error("The Monero server didn't build an unsigned payment. Nothing was sent.");
        // Audit Y1: the offline signer reads the set itself; the online watch server's reading is only a second check.
        const signerDesc = await moneroRpc<Parameters<typeof previewFromDescribe>[0]>("signer", "describe_transfer", { unsigned_txset: built.unsigned_txset }, 20_000);
        const preview = previewFromDescribe(signerDesc);
        if (!preview) throw new Error("Seeds couldn't read back the Monero payment. Nothing was sent.");
        const problem = previewProblem(preview, { to, units, from });
        if (problem) throw new Error(problem);
        const watchPreview = previewFromDescribe(await walletRpc<Parameters<typeof previewFromDescribe>[0]>("describe_transfer", { unsigned_txset: built.unsigned_txset }, 20_000));
        if (!watchPreview || !samePreview(preview, watchPreview)) throw new Error("The two Monero servers disagree about this payment. Nothing was sent.");
        const s = await moneroRpc<{ signed_txset?: string; tx_hash_list?: string[] }>("signer", "sign_transfer", { unsigned_txset: built.unsigned_txset, export_raw: false }, 50_000);
        const txid = s.tx_hash_list?.[0];
        if (!s.signed_txset || !txid || (s.tx_hash_list?.length ?? 0) !== 1 || !/^[0-9a-f]{64}$/i.test(txid)) throw new Error("The Monero signer gave an unexpected answer. Nothing was sent.");
        return { signed_txset: s.signed_txset, txid };
      } finally {
        await moneroRpc("signer", "close_wallet", { autosave_current: false }).catch(() => null);
      }
    });
    await record(signed.txid);
    await walletRpc("submit_transfer", { tx_data_hex: signed.signed_txset }, 30_000);
    return signed.txid;
  }, 30_000);
}

/** The member's watch wallet's reading of one sent transfer (no refresh: the scheduled scan keeps height current). */
export async function moneroTransfer(from: string, txid: string): Promise<unknown> {
  if (!moneroServerReady()) return null;
  const { data: w } = await supabaseAdmin.from("monero_wallets").select("link_id, wallet_name, status").eq("address", from).eq("status", "ready").limit(1).maybeSingle();
  if (!w?.wallet_name) return null;
  try {
    return await withLease(`confirm:${w.link_id}`, async () => {
      await walletRpc("open_wallet", { filename: w.wallet_name, password: await walletPassword(w.wallet_name) });
      return walletRpc<unknown>("get_transfer_by_txid", { txid, account_index: 0 });
    }, 5_000);
  } catch { return null; }
}
