/**
 * Telegram alert sweeps and alert texts. Server-only.
 *
 * The sweeps run lazily when the wallet page loads, for the signed-in user
 * only — no external scheduler is required. Every balance read is best-effort:
 * a chain that is offline is skipped entirely rather than recorded as zero, so
 * a node outage can neither raise a false deposit nor hide a real one.
 *
 * Dedupe lives in two tables: `deposit_sightings` remembers the last balance
 * seen per asset, and `alert_log` remembers alerts already sent for a subject
 * (so an authorization that stays inside the expiry window is announced once).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHAINS, getChain, isEvmChain, type ChainId } from "@/lib/chains";
import { notifyUser } from "@/lib/telegram.server";

const SITE = "https://seeds.honest.money";

/** Anything smaller than this is dust, not a deposit. */
const DUST = 1e-8;

/** Authorizations inside this window get a "wiped soon" warning. */
const EXPIRY_WINDOW_MS = 60 * 60_000;

type WalletRow = {
  txc_address: string;
  evm_address: string | null;
  ltc_address: string | null;
  isk_address: string | null;
  btc_address: string | null;
};

type Sighting = { asset: string; label: string; amount: number };

/** Trimmed number for alert copy: 1.5 not 1.50000000. */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

/** Telegram renders HTML, so stray angle brackets from an error must be escaped. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------- alert texts ------------------------------ */

/** Both sides of a fresh fill hear about it. */
export async function alertOrderFilled(input: {
  makerId: string;
  takerId: string;
  baseSymbol: string;
  quoteSymbol: string;
  amount: number;
  price: number;
}): Promise<void> {
  const line = `${fmtNum(input.amount)} ${input.baseSymbol} at ${fmtNum(input.price)} ${input.quoteSymbol}`;
  await notifyUser(
    input.makerId,
    "notify_order_filled",
    `🌱 <b>Seeds</b>\nYour resting order filled: ${line}.\n\n<a href="${SITE}/trades">Open your trades</a>`,
  );
  await notifyUser(
    input.takerId,
    "notify_order_filled",
    `🌱 <b>Seeds</b>\nYour order filled: ${line}.\n\n<a href="${SITE}/trades">Open your trades</a>`,
  );
}

/** Every leg of a trade confirmed on-chain. */
export async function alertTradeSettled(input: {
  makerId: string | null;
  takerId: string | null;
  pair: string;
}): Promise<void> {
  const text = `✅ <b>Seeds</b>\nYour <b>${esc(input.pair)}</b> trade settled — both legs confirmed on-chain.\n\n<a href="${SITE}/trades">Open your trades</a>`;
  for (const id of [input.makerId, input.takerId]) {
    if (id) await notifyUser(id, "notify_settlement", text);
  }
}

/** A leg could not be delivered; it stays retryable from the trades page. */
export async function alertSettlementFailed(input: {
  userIds: Array<string | null>;
  pair: string;
  legSymbol: string;
  error: string;
}): Promise<void> {
  const text = `⚠️ <b>Seeds</b>\nThe <b>${esc(input.legSymbol)}</b> leg of your <b>${esc(input.pair)}</b> trade failed: ${esc(input.error)}\nIt is waiting for a retry on your trades page.\n\n<a href="${SITE}/trades">Open your trades</a>`;
  for (const id of new Set(input.userIds.filter((x): x is string => Boolean(x)))) {
    await notifyUser(id, "notify_settlement_failed", text);
  }
}

/** A trade moved to an admin (a payment vanished or never confirmed). Plain words, no retry promise. */
export async function alertTradeHeld(input: { userIds: Array<string | null>; pair: string; text: string }): Promise<void> {
  const text = `⚠️ <b>Seeds</b>\nYour <b>${esc(input.pair)}</b> trade is on hold: ${esc(input.text)}\n\n<a href="${SITE}/trades">Open your trades</a>`;
  for (const id of new Set(input.userIds.filter((x): x is string => Boolean(x)))) {
    await notifyUser(id, "notify_settlement_failed", text);
  }
}

/** A sign-in through Honest.Money single sign-on. With an active wallet link, the alert carries a
 *  one-tap "Revoke Seeds' access" button so the member doesn't have to sign in to cut Seeds off. */
export async function alertSignIn(input: { userId: string; email?: string | null }): Promise<void> {
  const who = `New sign-in${input.email ? ` as <b>${esc(input.email)}</b>` : ""}.`;
  const { data: link } = await supabaseAdmin.from("hme_links").select("id")
    .eq("user_id", input.userId).eq("status", "active").maybeSingle();
  const { revokeButtonData } = await import("@/lib/telegram-actions");
  const { telegramActionKey } = await import("@/lib/telegram.server");
  const key = await telegramActionKey();
  if (link?.id && key) {
    await notifyUser(
      input.userId,
      "notify_login",
      `🔐 <b>Seeds</b>\n${who}\nIf that wasn't you, tap <b>Revoke Seeds' access</b> below. Seeds deletes its key to your trading pocket right away, no sign-in needed. Your coins stay in your HME Wallet.`,
      {
        inline_keyboard: [
          [{ text: "🚫 Revoke Seeds' access", callback_data: await revokeButtonData(key, "ask", link.id, input.userId) }],
          [{ text: "Open Security", url: `${SITE}/account/security` }],
        ],
      },
    );
    return;
  }
  await notifyUser(
    input.userId,
    "notify_login",
    `🔐 <b>Seeds</b>\n${who}\nNo HME Wallet is linked, so Seeds can't trade from any pocket of yours. If that wasn't you, sign out of Honest.Money everywhere and contact support@honest.money.\n\n<a href="${SITE}/account/security">Open Security</a>`,
  );
}

/** A coin / wallet account added an email (it now receives withdrawal codes). Security notice: sent whatever the alert settings. */
export async function alertAccountEmailAdded(input: { userId: string; email: string }): Promise<void> {
  const { sendTelegram, telegramConfigured } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return;
  const { data } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").eq("id", input.userId).maybeSingle();
  if (!data?.telegram_chat_id || data.telegram_verified !== true) return;
  await sendTelegram(
    String(data.telegram_chat_id),
    `📧 <b>Seeds</b>\nYour account email is now <b>${esc(input.email)}</b>. Seeds sends withdrawal codes there.\nIf that wasn't you, revoke Seeds' access in Security right away and contact help.honest.money.\n\n<a href="${SITE}/account/security">Open Security</a>`,
  );
}

/** Security alarms for every admin's verified Telegram chat (whatever their alert settings). */
export async function alertAdmins(text: string): Promise<void> {
  const { sendTelegram, telegramConfigured } = await import("@/lib/telegram.server");
  if (!telegramConfigured()) return;
  const { data: admins } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (admins ?? []).map((a) => a.user_id);
  if (!ids.length) return;
  const { data: chats } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").in("id", ids);
  for (const c of chats ?? []) {
    if (c.telegram_chat_id && c.telegram_verified === true) await sendTelegram(String(c.telegram_chat_id), text).catch(() => undefined);
  }
}

/* --------------------------------- deposits ------------------------------- */

async function remember(userId: string, s: Sighting): Promise<void> {
  await supabaseAdmin
    .from("deposit_sightings")
    .upsert(
      { user_id: userId, asset: s.asset, amount: s.amount, seen_at: new Date().toISOString() },
      { onConflict: "user_id,asset" },
    );
}

/** Confirmed balance at every address this wallet controls, best-effort. */
async function collectSightings(wallet: WalletRow): Promise<Sighting[]> {
  const jobs: Array<Promise<Sighting | Sighting[] | null>> = [];

  // TEXITcoin and the Omni tokens that ride on it (TSD, wBTC, wLTC, wETH).
  if (wallet.txc_address) {
    jobs.push(
      (async () => {
        try {
          const { fetchAddressStats } = await import("./txc.server");
          const stats = await fetchAddressStats(wallet.txc_address);
          return stats.online ? { asset: "TXC", label: "TXC", amount: stats.confirmed } : null;
        } catch {
          return null;
        }
      })(),
    );

    const txc = getChain("txc");
    for (const asset of txc.assets) {
      if (!asset.omniPropertyId) continue;
      const propertyId = asset.omniPropertyId;
      jobs.push(
        (async () => {
          try {
            const { fetchOmniBalance } = await import("./omni.server");
            const bal = await fetchOmniBalance(wallet.txc_address, propertyId);
            return bal.online
              ? { asset: asset.symbol, label: asset.symbol, amount: bal.balance }
              : null;
          } catch {
            return null;
          }
        })(),
      );
    }
  }

  // Bitcoin mainnet (the native side of the wrap desk).
  const btcAddress = wallet.btc_address;
  if (btcAddress) {
    jobs.push(
      (async () => {
        try {
          const { fetchBtcBalance } = await import("./btc/io.server");
          const bal = await fetchBtcBalance(btcAddress);
          return bal.online ? { asset: "BTC", label: "BTC", amount: bal.confirmed } : null;
        } catch {
          return null;
        }
      })(),
    );
  }

  // Litecoin and Iskandercoin.
  for (const chain of ["ltc", "isk"] as const) {
    const address = chain === "ltc" ? wallet.ltc_address : wallet.isk_address;
    if (!address) continue;
    jobs.push(
      (async () => {
        try {
          const { loadDisplayUtxosFor, utxoChainOnline } = await import("./utxo/io.server");
          if (!utxoChainOnline(chain)) return null;
          const utxos = await loadDisplayUtxosFor(chain, address);
          return {
            asset: chain.toUpperCase(),
            label: chain.toUpperCase(),
            amount: utxos.reduce((sum, u) => sum + u.amount, 0),
          };
        } catch {
          return null;
        }
      })(),
    );
  }

  // Every configured EVM chain: native coin plus listed tokens.
  if (wallet.evm_address) {
    const address = wallet.evm_address;
    const chains = CHAINS.filter((c) => isEvmChain(c.id)) as Array<{ id: ChainId }>;
    for (const chain of chains) {
      jobs.push(
        (async () => {
          try {
            const { evmChainConfigured, fetchEvmBalances } = await import("./evm.server");
            if (!evmChainConfigured(chain.id)) return null;
            const rows = await fetchEvmBalances(chain.id, address);
            // One sighting per token per chain, so funds moving between chains
            // each read as their own deposit.
            return rows.length && rows.every((r) => r.online)
              ? rows.map((r) => ({
                  asset: `${r.symbol}@${chain.id}`,
                  label: `${r.symbol} on ${r.chainName}`,
                  amount: r.balance,
                }))
              : null;
          } catch {
            return null;
          }
        })(),
      );
    }
  }

  const settled = await Promise.all(jobs);
  return settled.flatMap((s) => (s ? (Array.isArray(s) ? s : [s]) : []));
}

/* -------------------------- expiring authorizations ----------------------- */

/** Warn once, inside the window, about each authorization about to be wiped. */
async function alertExpiringAuthorizations(userId: string): Promise<number> {
  const now = Date.now();
  const { data: rows } = await supabaseAdmin
    .from("wallet_delegations")
    .select("id, asset, chain, expires_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .lt("expires_at", new Date(now + EXPIRY_WINDOW_MS).toISOString());

  let sent = 0;
  for (const row of rows ?? []) {
    // The insert doubles as the dedupe: a duplicate subject sends nothing.
    const { data: fresh } = await supabaseAdmin
      .from("alert_log")
      .upsert(
        { user_id: userId, kind: "auth_expiring", subject: row.id },
        { onConflict: "user_id,kind,subject", ignoreDuplicates: true },
      )
      .select("subject")
      .maybeSingle();
    if (!fresh) continue;

    const minutes = Math.max(1, Math.round((new Date(row.expires_at).getTime() - now) / 60_000));
    const label = (row.asset ?? row.chain ?? "trading").toUpperCase();
    sent += 1;
    await notifyUser(
      userId,
      "notify_auth_expiring",
      `⏳ <b>Seeds</b>\nYour <b>${esc(label)}</b> trading authorization is wiped in <b>${minutes} min</b>.\nRenew it on the wallet page to keep trading.\n\n<a href="${SITE}/wallet">Open your wallet</a>`,
    );
  }
  return sent;
}

/* ---------------------------------- sweep --------------------------------- */

export type SweepResult = { deposits: number; expiring: number };

/**
 * One pass over the signed-in user's wallet: report deposits that arrived since
 * the last look, and authorizations that are about to be wiped.
 */
export async function sweepWalletAlerts(userId: string): Promise<SweepResult> {
  const out: SweepResult = { deposits: 0, expiring: 0 };
  try {
    const { data: wallet } = await supabaseAdmin
      .from("wallets")
      .select("txc_address, evm_address, ltc_address, isk_address, btc_address")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet) return out;

    const { data: seenRows } = await supabaseAdmin
      .from("deposit_sightings")
      .select("asset, amount")
      .eq("user_id", userId);
    const seen = new Map<string, number>((seenRows ?? []).map((r) => [r.asset, Number(r.amount)]));

    for (const s of await collectSightings(wallet as WalletRow)) {
      const prior = seen.get(s.asset);
      // First time we look at this asset: remember it, don't cry deposit.
      if (prior === undefined) {
        await remember(userId, s);
        continue;
      }
      if (s.amount > prior + DUST) {
        await remember(userId, s);
        out.deposits += 1;
        await notifyUser(
          userId,
          "notify_deposit",
          `🌱 <b>Seeds</b>\n<b>+${fmtNum(s.amount - prior)} ${esc(s.label)}</b> landed in your trading branch.\n\n<a href="${SITE}/wallet">Open your wallet</a>`,
        );
      } else if (s.amount < prior - DUST) {
        // Funds left (a trade settled out). Not an alert, but don't stale the row.
        await remember(userId, s);
      }
    }

    out.expiring = await alertExpiringAuthorizations(userId);
  } catch (err) {
    console.error("wallet alert sweep failed", err);
  }
  return out;
}
