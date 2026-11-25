/**
 * Seeds-signed withdrawals for every coin in catalog.ts, under one rule set (rules.ts).
 *
 * Order is fixed and fails closed:
 *  1. Email code: the server checks everything about the withdrawal (rules, address, balance,
 *     price, level caps), then emails a 6-digit code bound to exactly that coin/network/amount/address.
 *  2. Request: fresh authenticator code (signed session) + the email code (single use, 5 tries), the
 *     same checks again, then reserve_withdrawal (database caps, per-member lock) stores it as
 *     'approving' and the member gets a Telegram Approve / Decline for exactly that send.
 *  3. Approve tap (owner's verified private chat): the approval is spent and the level's hold starts
 *     ('held'); the member can cancel until it ends. Decline or no tap in 15 minutes cancels it.
 *  4. Release (scheduled job): claim_pocket_withdrawal takes one due row per member; the link,
 *     rules, pilot access, pause and address are re-checked; the key is opened, the transaction is
 *     signed, its id stored, then broadcast. A crashed send is never re-signed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { limitsFor } from "@/lib/withdraw-limits.server";
import { nextLevelText } from "@/lib/withdraw-limits";
import { freshTwoFactor, type SessionClaims } from "@/lib/two-factor";
import { WITHDRAW_COINS, withdrawCoin, withdrawCoinByKey, type WithdrawCoin } from "./catalog";
import {
  amountProblem, codeDigest, detailsDigest, detailsText, EMAIL_CODE_TTL_MS, EMAIL_CODES_PER_HOUR, emailCodeProblem, maskEmail,
  MAX_WAITING, maybeBroadcast, newEmailCode, NEEDS_EMAIL_TO_WITHDRAW, parseDestinationTag, parseUnits, readinessProblem, sendBlocker,
  unitsToNumber, unitsToText, withdrawReadiness, WITHDRAW_PILOT_TESTERS_ONLY,
} from "./rules";
import { isKeyKind, pocketSource, type PocketSource, type SignInKind } from "@/lib/account/sign-in-kind";

const SITE = "https://seeds.honest.money";
const withdrawUrl = (c: WithdrawCoin) => `${SITE}/account/balances/withdraw?coin=${encodeURIComponent(c.symbol)}&network=${c.network}`;
const EVM_CONFIRMATIONS = 12;
const ROW_FIELDS = "id, chain, coin, amount, amount_usd, to_address, destination_tag, from_address, status, release_at, hold_hours, txid, error, confirmations, created_at, sent_at, cancelled_at";

function cleanDbError(msg: string): string {
  return msg.replace(/^.*?ERROR:\s*/i, "").trim();
}

function codeSecret(): string {
  const s = process.env.EMAIL_LINK_SECRET;
  if (!s) throw new Error("Withdrawal codes aren't set up on this server yet.");
  return `withdrawal-code|${s}`;
}

async function loadLinkSafe(userId: string) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  return loadLink(userId);
}

async function isTester(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "beta"]).limit(1);
  return Boolean(data?.length);
}

/** How the member signs in, and (coin / wallet accounts only) whether they have a real email yet. */
async function signInFor(userId: string): Promise<{ kind: SignInKind; hasEmail: boolean; pocket: PocketSource }> {
  const [{ data }, { data: active }] = await Promise.all([
    supabaseAdmin.from("profiles").select("identity_kind").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("hme_links").select("source, key_kind").eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  const k = data?.identity_kind ?? null;
  const kind: SignInKind = isKeyKind(k) ? k : "hme";
  const pocket = pocketSource(kind, active ? { source: active.source, keyKind: active.key_kind } : null);
  if (!isKeyKind(kind)) return { kind, hasEmail: true, pocket };
  const { isPlaceholderEmail } = await import("@/lib/key-signin/rules");
  const u = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = u.data.user?.email ?? null;
  return { kind, hasEmail: Boolean(email) && !isPlaceholderEmail(email), pocket };
}

/** Is this link allowed to withdraw (two-factor and Telegram both set up before it was made)? */
export async function readinessFor(userId: string, linkId: string | null) {
  const { twoFactorSinceMs } = await import("@/lib/two-factor.server");
  const [since, { data: prof }, { data: link }] = await Promise.all([
    twoFactorSinceMs(userId),
    supabaseAdmin.from("profiles").select("telegram_verified, telegram_chat_id, telegram_verified_at").eq("id", userId).maybeSingle(),
    linkId ? supabaseAdmin.from("hme_links").select("created_at").eq("id", linkId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return withdrawReadiness({
    twoFactorSinceMs: since,
    telegramVerified: prof?.telegram_verified === true && Boolean(prof?.telegram_chat_id),
    telegramSinceMs: prof?.telegram_verified_at ? Date.parse(prof.telegram_verified_at) : null,
    linkCreatedMs: link?.created_at ? Date.parse(link.created_at) : null,
  });
}

async function usdPrice(symbol: string): Promise<number | null> {
  if (symbol === "TSD") return 1;
  const { fetchQuotes, TRACKED } = await import("@/lib/cmc.server");
  const q = await fetchQuotes(["XLM", "TON", "SUI"].includes(symbol) ? [...TRACKED, symbol] : TRACKED);
  const p = q.quotes.find((x) => x.symbol === symbol)?.price;
  if (p && p > 0) return p;
  return symbol === "USDC" || symbol === "USDT" ? 1 : null;
}

/** Security email (always) + Telegram notice (if they opted in). Never throws. */
async function tell(userId: string, telegram: string, thing: string, lines: string[]) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    const { emailAccountChange } = await import("@/lib/email/send.server");
    await Promise.allSettled([
      notifyUser(userId, "notify_settlement", telegram),
      emailAccountChange(userId, thing, lines, "cancel it on Seeds right away, revoke your trading pocket in HME Wallet, then contact support@honest.money."),
    ]);
  } catch (e) {
    console.error("withdrawal alert failed", e);
  }
}

/** Monero only: Seeds' Monero server must be connected and the member's pocket watched first. */
async function moneroBlocker(userId: string, linkId: string | null, address: string | null): Promise<string | null> {
  const { moneroSignerReady } = await import("@/lib/monero/rpc.server");
  // Deposits and withdrawals both need the separate signer: no deposit may be one-way.
  if (!moneroSignerReady()) return "Seeds' Monero server isn't connected yet.";
  if (!linkId || !address) return null;
  const { requestWatch } = await import("@/lib/monero/wallet.server");
  await requestWatch(userId, linkId, address);
  const { data } = await supabaseAdmin.from("monero_wallets").select("status").eq("link_id", linkId).maybeSingle();
  if (data?.status === "failed") return "Seeds couldn't set up reading your Monero pocket. Contact support@honest.money.";
  return data?.status === "ready" ? null : "Seeds is getting ready to read your Monero pocket (a few minutes).";
}

/** What the withdraw screen needs for one coin (or just the rules when `key` is unknown). */
export async function withdrawContext(userId: string, tester: boolean, key: string | null) {
  const coin = key ? withdrawCoinByKey(key) : null;
  const [link, lim, { data }, who] = await Promise.all([
    loadLinkSafe(userId),
    limitsFor(userId),
    supabaseAdmin.from("pocket_withdrawals").select(ROW_FIELDS).eq("user_id", userId).order("created_at", { ascending: false }).limit(30),
    signInFor(userId),
  ]);
  const readiness = link ? await readinessFor(userId, link.id) : null;
  const address = coin && link ? link.addresses[coin.pocket] ?? null : null;
  const moneroDown = coin?.kind === "xmr" ? await moneroBlocker(userId, link?.id ?? null, address) : null;
  const blocker = moneroDown ?? sendBlocker({ link: link ? { mode: link.mode, hasKey: link.hasKey, address: coin ? address : "-" } : null, tester, frozen: lim.frozen, symbol: coin?.symbol ?? "", networkLabel: coin?.networkLabel ?? "", kind: who.kind })
    ?? (!who.hasEmail ? NEEDS_EMAIL_TO_WITHDRAW : null)
    ?? (readiness ? readinessProblem(readiness, who.pocket.kind, who.pocket.viaLink) : null);
  return {
    blocker,
    readiness,
    signIn: who.kind,
    pocket: who.pocket,
    needsEmail: !who.hasEmail,
    pilotTestersOnly: WITHDRAW_PILOT_TESTERS_ONLY,
    limits: { perWithdrawalUsd: lim.perWithdrawalUsd, dailyUsd: lim.dailyUsd, maxWaiting: MAX_WAITING },
    level: { name: lim.tier.name, number: lim.tier.level, setByAdmin: lim.source === "admin", next: nextLevelText(lim) },
    holdHours: lim.holdHours,
    tester: lim.tester,
    withdrawals: data ?? [],
  };
}

export type WithdrawInput = { symbol: string; network: string; amount: string; to: string; tag?: string };

/** Every check that doesn't need a code: returns exactly what would be sent. Throws a plain reason. */
async function prepare(userId: string, tester: boolean, input: WithdrawInput) {
  const coin = withdrawCoin(input.symbol, input.network);
  if (!coin) throw new Error("Seeds can't send that coin on that network yet.");
  const [link, lim, who] = await Promise.all([loadLinkSafe(userId), limitsFor(userId), signInFor(userId)]);
  const from = link?.addresses[coin.pocket] ?? null;
  const block = sendBlocker({ link: link ? { mode: link.mode, hasKey: link.hasKey, address: from } : null, tester, frozen: lim.frozen, symbol: coin.symbol, networkLabel: coin.networkLabel, kind: who.kind });
  if (block) throw new Error(block);
  if (!who.hasEmail) throw new Error(NEEDS_EMAIL_TO_WITHDRAW);
  const ready = readinessProblem(await readinessFor(userId, link!.id), who.pocket.kind, who.pocket.viaLink);
  if (ready) throw new Error(ready);
  const to = input.to.trim();
  const { destinationProblem, readBalance } = await import("./send.server");
  const bad = await destinationProblem(coin, to, from!);
  if (bad) throw new Error(bad);
  const tag = coin.kind === "xrp" ? parseDestinationTag(input.tag) : { ok: true as const, tag: null };
  if (!tag.ok) throw new Error("A destination tag is a whole number (up to 10 digits).");
  const units = parseUnits(input.amount, coin.decimals);
  const [bal, price] = await Promise.all([readBalance(coin, from!), usdPrice(coin.symbol)]);
  const problem = amountProblem({ symbol: coin.symbol, decimals: coin.decimals, units, balance: bal.units, feeBalance: bal.feeUnits, feeCoin: coin.feeCoin });
  if (problem) throw new Error(problem);
  const amount = unitsToNumber(units!, coin.decimals);
  // Coins set aside for open orders and trades can't be withdrawn (set-asides.ts).
  {
    const { legForCoin } = await import("@/lib/set-asides");
    const held = legForCoin(coin.symbol, coin.network);
    if (held) {
      const { pocketSpendProblem } = await import("@/lib/set-asides.server");
      const why = await pocketSpendProblem(userId, held, amount, { address: from!, network: coin.evmChain ?? null });
      if (why) throw new Error(why);
    }
  }
  // Beta testers have no dollar limits, so a coin without a live price (ISK, ZCU) can still go; members need a price.
  if (price == null && !lim.tester) throw new Error(`No live price for ${coin.symbol} right now, so your withdrawal limit can't be checked.`);
  const amountUsd = price == null ? 0 : Math.round(amount * price * 100) / 100;
  if (amountUsd > lim.perWithdrawalUsd) throw new Error(`Your withdrawal level allows up to $${lim.perWithdrawalUsd.toLocaleString("en-US")} per withdrawal.`);
  return { coin, link: link!, lim, from: from!, to, tag: tag.tag, units: units!, amount, amountText: unitsToText(units!, coin.decimals), amountUsd };
}

/** Step 1: email a code for exactly this withdrawal. */
export async function sendWithdrawalEmailCode(userId: string, tester: boolean, input: WithdrawInput) {
  const p = await prepare(userId, tester, input);
  const { loadRecipient, deliver } = await import("@/lib/email/send.server");
  const { sesConfigured } = await import("@/lib/email/ses.server");
  if (!sesConfigured()) throw new Error("Seeds can't send email right now, so withdrawals are paused. Try again later.");
  const r = await loadRecipient(userId);
  if (!r) throw new Error("Add and confirm an email address in Account → Profile (or join Honest.Money) before withdrawing. Seeds emails a code for every withdrawal.");
  const { count } = await supabaseAdmin.from("withdrawal_email_codes").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gt("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if ((count ?? 0) >= EMAIL_CODES_PER_HOUR) throw new Error("Too many withdrawal codes in the last hour. Wait a little and try again.");

  const secret = codeSecret();
  const details = detailsText({ userId, key: p.coin.key, units: p.units, to: p.to, tag: p.tag });
  const code = newEmailCode();
  const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString();
  const { error } = await supabaseAdmin.from("withdrawal_email_codes").insert({
    user_id: userId, details: await detailsDigest(secret, details), code_digest: await codeDigest(secret, details, code), expires_at: expiresAt,
  });
  if (error) throw new Error("Couldn't set up a withdrawal code. Try again.");
  await deliver(r.email, "withdrawal-code", {
    name: r.name, code, amount: p.amountText, symbol: p.coin.symbol, network: p.coin.networkLabel,
    to: p.tag != null ? `${p.to} (tag ${p.tag})` : p.to, minutes: Math.round(EMAIL_CODE_TTL_MS / 60_000),
  });
  return { sentTo: maskEmail(r.email), expiresAt, amount: p.amountText, amountUsd: p.amountUsd };
}

/** Step 2: both codes, then reserve and ask Telegram. Nothing is signed now. */
/** Audit C2: the free-coins check and the hold it leads to run one at a time per member. */
export async function requestWithdrawal(userId: string, tester: boolean, input: WithdrawInput & { emailCode: string }, claims: SessionClaims | null) {
  const { withPocketSpendLock } = await import("@/lib/set-asides.server");
  return withPocketSpendLock(userId, () => requestWithdrawalUnlocked(userId, tester, input, claims));
}

async function requestWithdrawalUnlocked(userId: string, tester: boolean, input: WithdrawInput & { emailCode: string }, claims: SessionClaims | null) {
  if (!freshTwoFactor(claims, Math.floor(Date.now() / 1000))) throw new Error("Enter the 6-digit code from your authenticator app to approve this withdrawal.");
  const p = await prepare(userId, tester, input);
  const secret = codeSecret();
  const details = detailsText({ userId, key: p.coin.key, units: p.units, to: p.to, tag: p.tag });
  const { cleanEmailCode } = await import("./rules");
  const code = cleanEmailCode(input.emailCode);
  if (!code) throw new Error("Enter the 6-digit code from the Seeds email.");
  const { data: used, error: ce } = await supabaseAdmin.rpc("use_withdrawal_email_code", {
    _user_id: userId, _details: await detailsDigest(secret, details), _code_digest: await codeDigest(secret, details, code),
  });
  if (ce) throw new Error("Couldn't check the email code. Try again.");
  const codeProblem = emailCodeProblem(String(used));
  if (codeProblem) throw new Error(codeProblem);

  const { data: id, error } = await supabaseAdmin.rpc("reserve_withdrawal", {
    _user_id: userId, _link_id: p.link.id, _chain: p.coin.network, _coin: p.coin.symbol, _amount: p.amount, _amount_units: p.units.toString(),
    _amount_usd: p.amountUsd, _from_address: p.from, _to_address: p.to, _hold_hours: p.lim.holdHours,
    _per_max_usd: p.lim.perWithdrawalUsd, _daily_max_usd: p.lim.dailyUsd, _max_held: MAX_WAITING,
  });
  if (error || !id) throw new Error(cleanDbError(error?.message ?? "Could not set up this withdrawal."));
  const rowId = id as string;
  if (p.tag != null) await supabaseAdmin.from("pocket_withdrawals").update({ destination_tag: p.tag }).eq("id", rowId);

  const hold = p.lim.holdHours > 0 ? `then a ${p.lim.holdHours}-hour wait you can cancel` : "then it goes out within a few minutes (beta tester: no wait)";
  try {
    const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    const ap = await requestSendApproval({
      userId, linkId: p.link.id, purpose: "withdrawal", refId: rowId, leg: p.coin.key, asset: p.coin.symbol,
      amount: p.amount, from: p.from, to: p.to,
      what: `Withdrawal on ${p.coin.networkLabel}${p.tag != null ? ` · destination tag ${p.tag}` : ""} (about $${p.amountUsd}) — ${hold}`,
      meta: { withdrawal: rowId, network: p.coin.network },
    });
    await supabaseAdmin.from("pocket_withdrawals").update({ approval_id: ap.id }).eq("id", rowId);
    void tell(userId, "", "Withdrawal request", [
      `Withdraw ${p.amountText} ${p.coin.symbol} (about $${p.amountUsd}) from your trading pocket`,
      `To ${p.to}${p.tag != null ? ` (tag ${p.tag})` : ""} on ${p.coin.networkLabel}`,
      `Waiting for your Approve tap in Telegram, ${hold}. Cancel: ${withdrawUrl(p.coin)}`,
    ]);
    return { id: rowId, amount: p.amountText, amountUsd: p.amountUsd, holdHours: p.lim.holdHours, approvalExpiresAt: ap.expires_at };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("pocket_withdrawals").update({ status: "cancelled", cancelled_at: new Date().toISOString(), error: msg.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", rowId).eq("status", "approving");
    throw new Error(`${msg} Nothing was sent.`);
  }
}

type ApprovalLike = { id: string; ref_id: string; status: string; user_id: string; link_id: string; leg: string; amount: number; from_address: string; to_address: string };

/** After the Telegram tap (or its expiry): start the hold, or cancel. Called from approvals.server.ts; never throws. */
export async function continueWithdrawal(a: ApprovalLike) {
  try {
    const { data: row } = await supabaseAdmin.from("pocket_withdrawals").select("id, user_id, chain, coin, amount, to_address, status, hold_hours").eq("id", a.ref_id).maybeSingle();
    if (!row || row.status !== "approving") return;
    const coin = withdrawCoin(row.coin, row.chain);
    if (a.status !== "approved") {
      await supabaseAdmin.from("pocket_withdrawals").update({ status: "cancelled", cancelled_at: new Date().toISOString(), error: "Not approved in Telegram", updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("status", "approving");
      return;
    }
    const { spendApproval } = await import("@/lib/pocket-send/approvals.server");
    await spendApproval({ purpose: "withdrawal", id: a.id, leg: a.leg, userId: a.user_id, linkId: a.link_id, amount: a.amount, from: a.from_address, to: a.to_address });
    const { data: ok } = await supabaseAdmin.rpc("approve_pocket_withdrawal", { _id: row.id, _approval_id: a.id });
    if (!ok) return;
    if (row.hold_hours > 0) {
      const at = new Date(Date.now() + row.hold_hours * 3_600_000);
      void tell(row.user_id, `⏳ <b>Withdrawal approved</b>\n${row.amount} ${row.coin} to ${row.to_address}\nSeeds sends it ${at.toUTCString()}. Not you? <a href="${coin ? withdrawUrl(coin) : SITE}">Cancel it now</a>.`,
        "Withdrawal approved", [`${row.amount} ${row.coin} to ${row.to_address}`, `Seeds sends it after the ${row.hold_hours}-hour wait unless you cancel`]);
    } else {
      await advanceWithdrawals(row.id);
    }
  } catch (e) {
    console.error("[withdraw] continue after approval failed", a.ref_id, e);
  }
}

/** Why an Approve tap can't be honoured any more, or null (approvals.server.ts). */
export async function withdrawalApproveBlocker(a: ApprovalLike): Promise<string | null> {
  const link = await loadLinkSafe(a.user_id);
  if (!link || link.id !== a.link_id || !link.hasKey || !Object.values(link.addresses).includes(a.from_address)) return "Your wallet link changed since this request.";
  return readinessProblem(await readinessFor(a.user_id, link.id));
}

export async function cancelWithdrawal(userId: string, id: string) {
  const { data, error } = await supabaseAdmin.rpc("cancel_pocket_withdrawal", { _id: id, _user_id: userId });
  if (error) throw new Error(cleanDbError(error.message));
  if (!data) throw new Error("This withdrawal is no longer waiting, so it can't be cancelled.");
  const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
  await cancelApprovals({ purpose: "withdrawal", refId: id }, "You cancelled this withdrawal on Seeds.").catch(() => 0);
  const { data: row } = await supabaseAdmin.from("pocket_withdrawals").select("coin, amount, to_address").eq("id", id).maybeSingle();
  if (row) void tell(userId, `❌ Withdrawal cancelled: ${row.amount} ${row.coin} to ${row.to_address}. Nothing was sent.`,
    "Withdrawal cancelled", [`Cancelled: ${row.amount} ${row.coin} to ${row.to_address}`, "Nothing was sent"]);
  return { ok: true };
}

type Row = { id: string; user_id: string; link_id: string; chain: string; coin: string; amount: number; amount_units: string; from_address: string; to_address: string; destination_tag: number | null; approval_id: string | null };

async function sendOne(r: Row): Promise<"sent" | "failed" | "unknown"> {
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await supabaseAdmin.from("pocket_withdrawals").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", r.id);
    if (error) throw new Error(`Could not record the withdrawal: ${error.message}`);
  };
  let txid: string | null = null;
  const coin = withdrawCoin(r.coin, r.chain);
  try {
    if (!coin) throw new Error("Seeds can't send this coin on this network.");
    // Only a withdrawal its owner approved in Telegram goes out (rows from before Nov 20 2026 had no tap).
    if (!r.approval_id) throw new Error("This withdrawal was asked for before every withdrawal needed a Telegram tap. Nothing was sent — ask again.");
    const { data: ap } = await supabaseAdmin.from("send_approvals").select("status, ref_id, purpose").eq("id", r.approval_id).maybeSingle();
    if (!ap || ap.status !== "used" || ap.ref_id !== r.id || ap.purpose !== "withdrawal") throw new Error("No matching Telegram approval. Nothing was sent.");
    const link = await loadLinkSafe(r.user_id);
    const tester = await isTester(r.user_id);
    const block = sendBlocker({
      link: link ? { mode: link.mode, hasKey: link.hasKey, address: link.addresses[coin.pocket] ?? null } : null,
      tester, frozen: false, symbol: coin.symbol, networkLabel: coin.networkLabel,
    });
    if (block) throw new Error(block);
    if (!link) throw new Error("Your trading pocket is no longer linked. Nothing was sent.");
    const { data: ov } = await supabaseAdmin.from("withdrawal_limit_overrides").select("frozen").eq("user_id", r.user_id).maybeSingle();
    if (ov?.frozen) throw new Error("Withdrawals were paused on your account during the wait, so nothing was sent.");
    if (link.id !== r.link_id) throw new Error("Your trading pocket link changed since you asked, so nothing was sent. Ask again from the new link.");
    if (readinessProblem(await readinessFor(r.user_id, r.link_id))) {
      throw new Error("Two-factor or Telegram changed during the wait, so nothing was sent. Re-link your HME Wallet and ask again.");
    }
    const from = link.addresses[coin.pocket];
    if (!from) throw new Error("Your linked pocket no longer includes this coin. Nothing was sent.");
    if (from !== r.from_address) throw new Error("Your pocket address changed since you asked. Nothing was sent.");
    const { destinationProblem, sendWithdrawal } = await import("./send.server");
    if (await destinationProblem(coin, r.to_address, from)) throw new Error("The destination is no longer allowed. Nothing was sent.");
    const sent = await sendWithdrawal(coin, link, from, r.to_address, BigInt(r.amount_units), async (id) => { txid = id; await update({ txid: id }); }, r.destination_tag, tester);
    txid = sent;
    await update({ status: "sent", txid: sent, sent_at: new Date().toISOString(), confirmations: 0 });
    void tell(r.user_id, `✅ <b>Withdrawal sent</b>\n${r.amount} ${coin.symbol} on ${coin.networkLabel} to ${r.to_address}\nTx ${sent}`, "Withdrawal sent",
      [`Sent ${r.amount} ${coin.symbol} from your trading pocket to ${r.to_address} on ${coin.networkLabel}`, `Transaction ${sent}`]);
    return "sent";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const nativeEd = coin && ["xlm", "ton", "sui"].includes(coin.kind);
    const definiteRejection = msg === "Stellar rejected this transaction." || msg === "Sui rejected this transaction.";
    const unsure = txid !== null && (maybeBroadcast(msg) || (nativeEd && !definiteRejection));
    await supabaseAdmin.from("pocket_withdrawals").update({ status: unsure ? "unknown" : "failed", error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", r.id);
    void tell(r.user_id, unsure
      ? `⚠ The network didn't confirm it received your ${r.amount} ${r.coin} withdrawal. We're checking — don't ask again yet.`
      : `⚠ Your ${r.amount} ${r.coin} withdrawal was not sent: ${msg}`,
      "Withdrawal problem", [unsure ? "The network didn't confirm the send; Seeds is checking" : `Not sent: ${msg}`]);
    return unsure ? "unknown" : "failed";
  }
}

/** Scheduled (and right after a no-wait approval): send every withdrawal whose hold is over, then update confirmations. */
export async function advanceWithdrawals(onlyId?: string) {
  let q = supabaseAdmin.from("pocket_withdrawals")
    .select("id, user_id, link_id, chain, coin, amount, amount_units, from_address, to_address, destination_tag, approval_id")
    .eq("status", "held").lte("release_at", new Date().toISOString()).order("release_at").limit(10);
  if (onlyId) q = q.eq("id", onlyId);
  const { data: due } = await q;
  const results: Record<string, number> = { sent: 0, failed: 0, unknown: 0, skipped: 0, confirmed: 0 };
  for (const r of (due ?? []) as Row[]) {
    const { data: claimed } = await supabaseAdmin.rpc("claim_pocket_withdrawal", { _id: r.id });
    if (!claimed) { results.skipped!++; continue; }
    results[await sendOne(r)]!++;
  }
  if (onlyId) return results;

  // Time out taps that never came (the approvals sweeper also does this; this keeps rows tidy if it lags).
  const { data: stale } = await supabaseAdmin.from("pocket_withdrawals").select("id").eq("status", "approving").lt("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).limit(25);
  for (const s of stale ?? []) {
    await supabaseAdmin.from("pocket_withdrawals").update({ status: "cancelled", cancelled_at: new Date().toISOString(), error: "Not approved in Telegram in time", updated_at: new Date().toISOString() })
      .eq("id", s.id).eq("status", "approving");
  }

  const { data: sent } = await supabaseAdmin.from("pocket_withdrawals").select("id, user_id, chain, coin, amount, amount_units, to_address, txid").in("status", ["sent", "unknown"]).not("txid", "is", null).limit(25);
  const { txStatus } = await import("./send.server");
  for (const s of sent ?? []) {
    const coin = withdrawCoin(s.coin, s.chain);
    if (!coin || !s.txid || !["evm", "xlm", "ton", "sui"].includes(coin.kind)) continue;
    const st = await txStatus(coin, s.txid, s.to_address, BigInt(s.amount_units)).catch(() => null);
    if (!st || st.confirmations == null) continue;
    if (st.success === false) {
      await supabaseAdmin.from("pocket_withdrawals").update({ status: "failed", error: `${coin.networkLabel} rejected the transaction`, confirmations: st.confirmations, updated_at: new Date().toISOString() }).eq("id", s.id);
      void tell(s.user_id, `⚠ ${coin.networkLabel} rejected your ${s.amount} ${s.coin} withdrawal. Only the network fee was used.`, "Withdrawal rejected", [`${coin.networkLabel} rejected the transaction; only the network fee was spent`]);
    } else if (st.success === true) {
      const done = st.confirmations >= (coin.kind === "evm" ? EVM_CONFIRMATIONS : 1);
      await supabaseAdmin.from("pocket_withdrawals").update({ status: done ? "confirmed" : "sent", confirmations: st.confirmations, updated_at: new Date().toISOString() }).eq("id", s.id);
      if (done) results.confirmed!++;
    }
  }
  return results;
}

/** All coins Seeds can send, for the withdraw screen and help pages. */
export const SENDABLE_KEYS = WITHDRAW_COINS.map((c) => c.key);
