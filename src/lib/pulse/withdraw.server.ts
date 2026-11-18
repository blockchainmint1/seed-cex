/**
 * Seeds-signed PulseChain withdrawals (PLS and pHEX) from an instant-access pocket.
 *
 * Order is fixed and fails closed:
 *  1. Request: server re-reads balances and price, checks the destination, then
 *     reserve_pocket_withdrawal (database) enforces caps and puts it on a 24-hour
 *     hold. The member gets an email (always) and Telegram (if linked) with a
 *     way to cancel. No key is touched.
 *  2. Release (scheduled job): claim_pocket_withdrawal moves only a held row
 *     past its hold to "signing", one per member at a time. The link must still
 *     be the same active instant-access link and the same pocket address.
 *  3. Balances and fees are re-read, the key is decrypted, checked against the
 *     pocket address, the transaction is signed, its hash stored, then broadcast.
 *     The key is wiped after. A crashed send is never re-signed automatically.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  destinationProblem, feeTooHigh, isPulseCoin, parseUnits, PULSE_CHAIN_ID, PULSE_COINS, PULSE_CONFIRMATIONS, PULSE_HOLD_HOURS,
  PULSE_WITHDRAW_LIMITS, PULSE_WITHDRAW_PILOT_ADMIN_ONLY, pulseSendBlocker, unitsToNumber, withdrawalProblem, type PulseCoin,
} from "./withdraw-rules";

const CHAIN = "pulsechain" as const;
const SITE = "https://seeds.honest.money";
const cancelUrl = (coin: string) => `${SITE}/account/balances/withdraw?coin=${coin}&network=pulsechain`;

async function rawBalance(coin: PulseCoin, address: string): Promise<bigint | null> {
  const { evmRpc } = await import("@/lib/evm.server");
  const c = PULSE_COINS[coin].contract;
  const hex = c
    ? await evmRpc<string>(CHAIN, "eth_call", [{ to: c, data: `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` }, "latest"])
    : await evmRpc<string>(CHAIN, "eth_getBalance", [address, "latest"]);
  if (hex == null) return null;
  return hex === "0x" ? 0n : BigInt(hex);
}

async function usdPrice(coin: PulseCoin): Promise<number | null> {
  const { fetchQuotes, TRACKED } = await import("@/lib/cmc.server");
  const q = await fetchQuotes(TRACKED);
  const p = q.quotes.find((x) => x.symbol === coin)?.price;
  return p && p > 0 ? p : null;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return Boolean(data);
}

function linkLike(link: Awaited<ReturnType<typeof loadLinkSafe>>) {
  return link ? { mode: link.mode, hasKey: link.hasKey, hasEvm: Boolean(link.addresses.EVM) } : null;
}

async function loadLinkSafe(userId: string) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  return loadLink(userId);
}

function cleanDbError(msg: string): string {
  return msg.replace(/^.*?ERROR:\s*/i, "").trim();
}

/** Telegram (if they opted in) plus an always-sent security email. */
async function tell(userId: string, telegram: string, thing: string, lines: string[]) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    const { emailAccountChange } = await import("@/lib/email/send.server");
    await Promise.allSettled([
      notifyUser(userId, "notify_settlement", telegram),
      emailAccountChange(userId, thing, lines, "cancel it on Seeds right away, revoke your trading pocket in HME Wallet, then contact support@honest.money."),
    ]);
  } catch (e) {
    console.error("pulse withdrawal alert failed", e);
  }
}

const ROW_FIELDS = "id, coin, amount, amount_usd, to_address, from_address, status, release_at, txid, error, confirmations, created_at, sent_at, cancelled_at";

/** What the withdraw screen needs: can Seeds send for this member, the rules, and their recent withdrawals. */
export async function pulseWithdrawContext(userId: string, isAdmin: boolean) {
  const link = await loadLinkSafe(userId);
  const { data } = await supabaseAdmin.from("pocket_withdrawals").select(ROW_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  return {
    blocker: pulseSendBlocker({ link: linkLike(link), isAdmin }),
    pilotAdminOnly: PULSE_WITHDRAW_PILOT_ADMIN_ONLY,
    limits: PULSE_WITHDRAW_LIMITS,
    holdHours: PULSE_HOLD_HOURS,
    withdrawals: data ?? [],
  };
}

export type PulseWithdrawInput = { coin: string; amount: string; to: string };

export async function requestPulseWithdrawal(userId: string, isAdmin: boolean, input: PulseWithdrawInput) {
  if (!isPulseCoin(input.coin)) throw new Error("Seeds only sends PLS and pHEX on PulseChain.");
  const coin = input.coin;
  const spec = PULSE_COINS[coin];
  const link = await loadLinkSafe(userId);
  const blocker = pulseSendBlocker({ link: linkLike(link), isAdmin });
  if (blocker) throw new Error(blocker);
  const from = link!.addresses.EVM!;
  const to = input.to.trim();
  const bad = destinationProblem(to, from);
  if (bad) throw new Error(bad);
  const units = parseUnits(input.amount, spec.decimals);
  const [bal, plsBal, price] = await Promise.all([rawBalance(coin, from), coin === "PLS" ? null : rawBalance("PLS", from), usdPrice(coin)]);
  const amount = units == null ? 0 : unitsToNumber(units, spec.decimals);
  const amountUsd = price == null ? null : Math.round(amount * price * 100) / 100;
  const problem = withdrawalProblem({ coin, units, balanceUnits: bal, plsBalanceWei: coin === "PLS" ? bal : plsBal, amountUsd });
  if (problem) throw new Error(problem);

  const { data: id, error } = await supabaseAdmin.rpc("reserve_pocket_withdrawal", {
    _user_id: userId, _link_id: link!.id, _coin: coin, _amount: amount, _amount_units: units!.toString(), _amount_usd: amountUsd!,
    _from_address: from, _to_address: to, _hold_hours: PULSE_HOLD_HOURS,
    _per_max_usd: PULSE_WITHDRAW_LIMITS.perWithdrawalUsd, _daily_max_usd: PULSE_WITHDRAW_LIMITS.dailyUsd, _max_held: PULSE_WITHDRAW_LIMITS.maxWaiting,
  });
  if (error || !id) throw new Error(cleanDbError(error?.message ?? "Could not set up this withdrawal."));

  void tell(userId,
    `⏳ <b>PulseChain withdrawal requested</b>\n${amount} ${coin} (about $${amountUsd}) to ${to}\nSeeds sends it in ${PULSE_HOLD_HOURS} hours. Not you? <a href="${cancelUrl(coin)}">Cancel it now</a>.`,
    "PulseChain withdrawal request",
    [
      `Withdraw ${amount} ${coin} (about $${amountUsd}) from your trading pocket`,
      `To ${to} on PulseChain`,
      `Seeds sends it in ${PULSE_HOLD_HOURS} hours unless you cancel: ${cancelUrl(coin)}`,
    ]);
  return { id: id as string, amount, amountUsd, holdHours: PULSE_HOLD_HOURS };
}

export async function cancelPulseWithdrawal(userId: string, id: string) {
  const { data, error } = await supabaseAdmin.rpc("cancel_pocket_withdrawal", { _id: id, _user_id: userId });
  if (error) throw new Error(cleanDbError(error.message));
  if (!data) throw new Error("This withdrawal is no longer waiting, so it can't be cancelled.");
  const { data: row } = await supabaseAdmin.from("pocket_withdrawals").select("coin, amount, to_address").eq("id", id).maybeSingle();
  if (row) void tell(userId, `❌ PulseChain withdrawal cancelled: ${row.amount} ${row.coin} to ${row.to_address}. Nothing was sent.`,
    "PulseChain withdrawal cancelled", [`Cancelled: ${row.amount} ${row.coin} to ${row.to_address}`, "Nothing was sent"]);
  return { ok: true };
}

type Row = { id: string; user_id: string; link_id: string; coin: string; amount: number; amount_units: string; from_address: string; to_address: string };

async function sendOne(r: Row): Promise<"sent" | "failed" | "unknown"> {
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await supabaseAdmin.from("pocket_withdrawals").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) throw new Error(`Could not record the withdrawal: ${error.message}`);
  };
  let txid: string | null = null;
  try {
    if (!isPulseCoin(r.coin)) throw new Error("Unknown coin.");
    const coin = r.coin;
    const spec = PULSE_COINS[coin];
    const link = await loadLinkSafe(r.user_id);
    const blocker = pulseSendBlocker({ link: linkLike(link), isAdmin: await isAdminUser(r.user_id) });
    if (blocker) throw new Error(blocker);
    if (link!.id !== r.link_id) throw new Error("Your trading pocket link changed since you asked, so nothing was sent. Ask again from the new pocket.");
    const from = link!.addresses.EVM!;
    if (from.toLowerCase() !== r.from_address.toLowerCase()) throw new Error("Your pocket address changed since you asked. Nothing was sent.");
    if (destinationProblem(r.to_address, from)) throw new Error("The destination is no longer allowed. Nothing was sent.");
    const units = BigInt(r.amount_units);

    const { estimateGas, fetchNonce, sendRawTransaction, suggestFees } = await import("@/lib/evm.server");
    const { erc20TransferData, signEip1559 } = await import("@/lib/evm/tx.server");
    const [bal, plsBal, nonce, fees] = await Promise.all([
      rawBalance(coin, from), coin === "PLS" ? Promise.resolve(null) : rawBalance("PLS", from), fetchNonce(CHAIN, from), suggestFees(CHAIN),
    ]);
    if (bal == null || nonce == null || !fees) throw new Error("PulseChain couldn't be read. Nothing was sent.");
    const target = spec.contract ?? r.to_address;
    const data = spec.contract ? erc20TransferData(r.to_address, units) : "0x";
    const value = spec.contract ? 0n : units;
    const est = await estimateGas(CHAIN, { from, to: target, data, value: `0x${value.toString(16)}` });
    if (est == null) throw new Error("PulseChain refused to estimate this send (not enough balance?). Nothing was sent.");
    const gasLimit = (est * 12n) / 10n;
    if (feeTooHigh(gasLimit, fees.maxFeePerGas)) throw new Error("PulseChain network fees are unusually high right now. Nothing was sent — ask again later.");
    const feeWei = gasLimit * fees.maxFeePerGas;
    const plsAvailable = coin === "PLS" ? bal : (plsBal ?? 0n);
    if (bal < units) throw new Error(`Your pocket no longer holds ${r.amount} ${coin}. Nothing was sent.`);
    if (plsAvailable < feeWei + (coin === "PLS" ? units : 0n)) throw new Error("Not enough PLS left in your pocket for the network fee. Nothing was sent.");

    const { withPocketKey } = await import("@/lib/xchain/send.server");
    const signed = await withPocketKey(link!.ciphertext, "EVM", from, async (priv) => {
      const { bytesToHex } = await import("@noble/hashes/utils.js");
      return signEip1559({ privateKeyHex: bytesToHex(priv), chainId: PULSE_CHAIN_ID, nonce, ...fees, gasLimit, to: target, value, data });
    });
    if (signed.from.toLowerCase() !== from.toLowerCase()) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");
    await update({ txid: signed.hash });
    txid = signed.hash;
    await sendRawTransaction(CHAIN, signed.raw);
    await update({ status: "sent", sent_at: new Date().toISOString(), confirmations: 0 });
    void tell(r.user_id, `✅ <b>PulseChain withdrawal sent</b>\n${r.amount} ${coin} to ${r.to_address}\nTx ${signed.hash}`, "PulseChain withdrawal sent",
      [`Sent ${r.amount} ${coin} from your trading pocket to ${r.to_address}`, `PulseChain transaction ${signed.hash}`]);
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A hash we stored may still have reached the network if the broadcast timed out.
    const maybeSent = txid !== null && /timeout|unreachable|fetch|abort|network|socket|reset|50\d/i.test(msg);
    await supabaseAdmin.from("pocket_withdrawals").update({ status: maybeSent ? "unknown" : "failed", error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", r.id);
    void tell(r.user_id, maybeSent
      ? `⚠ PulseChain didn't confirm it received your ${r.amount} ${r.coin} withdrawal. We're checking — don't ask again yet.`
      : `⚠ Your ${r.amount} ${r.coin} PulseChain withdrawal was not sent: ${msg}`,
      "PulseChain withdrawal problem", [maybeSent ? "PulseChain didn't confirm the send; Seeds is checking" : `Not sent: ${msg}`]);
    return maybeSent ? "unknown" : "failed";
  }
}

/** Scheduled: send every withdrawal whose hold is over, then update confirmations. */
export async function advancePulseWithdrawals() {
  const { data: due } = await supabaseAdmin
    .from("pocket_withdrawals")
    .select("id, user_id, link_id, coin, amount, amount_units, from_address, to_address")
    .eq("status", "held").lte("release_at", new Date().toISOString())
    .order("release_at").limit(10);
  const results: Record<string, number> = { sent: 0, failed: 0, unknown: 0, skipped: 0, confirmed: 0 };
  for (const r of (due ?? []) as Row[]) {
    const { data: claimed } = await supabaseAdmin.rpc("claim_pocket_withdrawal", { _id: r.id });
    if (!claimed) { results.skipped++; continue; }
    results[await sendOne(r)]++;
  }

  const { data: sent } = await supabaseAdmin.from("pocket_withdrawals").select("id, user_id, coin, amount, txid").in("status", ["sent", "unknown"]).not("txid", "is", null).limit(25);
  const { fetchEvmTxStatus } = await import("@/lib/evm.server");
  for (const s of sent ?? []) {
    const st = await fetchEvmTxStatus(CHAIN, s.txid!);
    if (st.confirmations == null) continue;
    if (st.success === false) {
      await supabaseAdmin.from("pocket_withdrawals").update({ status: "failed", error: "PulseChain rejected the transaction", confirmations: st.confirmations, updated_at: new Date().toISOString() }).eq("id", s.id);
      void tell(s.user_id, `⚠ PulseChain rejected your ${s.amount} ${s.coin} withdrawal. Only the network fee was used.`, "PulseChain withdrawal rejected", ["PulseChain rejected the transaction; only the network fee was spent"]);
    } else if (st.success === true) {
      const done = st.confirmations >= PULSE_CONFIRMATIONS;
      await supabaseAdmin.from("pocket_withdrawals").update({ status: done ? "confirmed" : "sent", confirmations: st.confirmations, updated_at: new Date().toISOString() }).eq("id", s.id);
      if (done) results.confirmed++;
    }
  }
  return results;
}
