/**
 * Seeds Lend engine (server only). Pure money rules live in ./rules.ts and the lockbox bytes
 * in ./escrow.ts; this file wires them to members' pockets, Seeds' key, the TXC node and the
 * database. Every lockbox payout is built here from the stored loan terms and recorded
 * before broadcast; every send out of a member's pocket needs that member's Telegram tap.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { getChain, type LegId } from "@/lib/chains";
import type { ApprovalRow } from "@/lib/pocket-send/approvals.server";
import * as R from "./rules";
import * as E from "./escrow";

const SITE = "https://seeds.honest.money";
const TXC_P2PKH = getChain("txc").p2pkhVersion as number;
const SATS = BigInt(R.SATS);
const HOUR = 3_600_000;

export type LoanRow = {
  id: string; ref: string; offer_id: string; proposal_id: string; borrower_id: string; lender_id: string;
  coin: R.LoanCoin; collateral_coin: R.CollateralCoin; amount: number; rate_pct: number; days: number; start_ltv_pct: number;
  owed: number; fee_pct: number; collateral_amount: number; price_at_start: number;
  borrower_pub: string; lender_pub: string; seeds_pub: string; redeem_script: string; escrow_address: string;
  borrower_collateral_address: string; lender_collateral_address: string; seeds_fee_address: string;
  status: R.LoanStatus; outcome: R.LoanOutcome | null; collateral_seen: number; collateral_deadline: string;
  collateral_confirmed_at: string | null; funding_deadline: string | null; funding_started_at: string | null;
  funding_txid: string | null; funding_network: string | null; funding_to: string | null; funded_at: string | null;
  funding_confirmed_at: string | null; due_at: string | null; repay_started_at: string | null; repay_txid: string | null;
  repay_network: string | null; repay_to: string | null; repay_sent_at: string | null; repaid_confirmed_at: string | null;
  escrow_purpose: R.EscrowPurpose | null; escrow_claimed_at: string | null; escrow_hex: string | null; escrow_txid: string | null;
  escrow_split: Record<string, string> | null; escrow_price: number | null; last_price: number | null; last_ltv_pct: number | null;
  last_checked_at: string | null; margin_called_at: string | null; closed_at: string | null; created_at: string;
};

const NUMERIC: (keyof LoanRow)[] = ["amount", "rate_pct", "start_ltv_pct", "owed", "fee_pct", "collateral_amount", "price_at_start", "collateral_seen", "escrow_price", "last_price", "last_ltv_pct"];
export function normLoan(r: Record<string, unknown>): LoanRow {
  const o = { ...r } as Record<string, unknown>;
  for (const k of NUMERIC) if (o[k] != null) o[k] = Number(o[k]);
  return o as unknown as LoanRow;
}

export const legOf = (coin: string) => coin.toLowerCase() as LegId;
const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

export async function loadLoan(id: string): Promise<LoanRow | null> {
  const { data } = await supabaseAdmin.from("loans").select("*").eq("id", id).maybeSingle();
  return data ? normLoan(data as Record<string, unknown>) : null;
}

export async function loanEvent(loanId: string, kind: string, body: string, actorId?: string | null, txid?: string | null) {
  await supabaseAdmin.from("loan_events").insert({ loan_id: loanId, kind, body: body.slice(0, 1000), actor_id: actorId ?? null, txid: txid ?? null });
}

export async function loanAlert(userId: string, loanId: string, text: string) {
  const { notifyUser } = await import("@/lib/telegram.server");
  await notifyUser(userId, "notify_p2p", `🌱 <b>Seeds Lend</b>\n${text}\n\n<a href="${SITE}/loans/${loanId}">Open the loan</a>`).catch(() => {});
}

/* --------------------------------- prices --------------------------------- */

/** Live collateral price in dollars (CoinMarketCap, Seeds' tracked list). */
export async function collateralPrice(coin: R.CollateralCoin): Promise<number | null> {
  const { fetchQuotes, TRACKED } = await import("@/lib/cmc.server");
  const q = await fetchQuotes(TRACKED).catch(() => null);
  const p = q?.quotes.find((x) => x.symbol === coin)?.price ?? null;
  return p && p > 0 ? p : null;
}

/** Record one price check (at most every 4 minutes per coin) and return the recent ones. */
export async function priceMarks(coin: R.CollateralCoin, record = true): Promise<R.PriceMark[]> {
  const read = async () => {
    const { data } = await supabaseAdmin.from("loan_price_marks").select("price, at").eq("coin", coin).order("at", { ascending: false }).limit(R.PRICE_MARK_WINDOW);
    return (data ?? []).map((m) => ({ price: Number(m.price), atMs: Date.parse(m.at) }));
  };
  let marks = await read();
  if (record && (!marks[0] || Date.now() - marks[0].atMs > 4 * 60_000)) {
    const p = await collateralPrice(coin);
    if (p) {
      await supabaseAdmin.from("loan_price_marks").insert({ coin, price: p, source: "coinmarketcap" });
      marks = await read();
    }
  }
  return marks;
}

/* ---------------------------------- keys ---------------------------------- */

async function txcPocket(userId: string) {
  const { activeLink } = await import("@/lib/pocket-send/pocket.server");
  const link = await activeLink(userId);
  const address = link?.addresses["TXC"];
  if (!link || !address || !link.hasKey) return null;
  return { link, address };
}

/** The member's TXC pocket public key (pocket 1106, receive key 0/0). */
async function pocketPub(userId: string): Promise<{ pub: Uint8Array; address: string }> {
  const p = await txcPocket(userId);
  if (!p) throw new Error("needs a TXC trading pocket that Seeds can sign for");
  const { withPocketKey } = await import("@/lib/xchain/send.server");
  const pub = await withPocketKey(p.link, "TXC", p.address, async (priv) => secp256k1.getPublicKey(priv, true));
  return { pub, address: p.address };
}

async function seedsKey(loanKey: string) {
  const { seedsSigner } = await import("@/lib/lock/lock.server");
  return seedsSigner(`loan:${loanKey}`, "TXC");
}

/* ------------------------------ create a loan ----------------------------- */

type ProposalRow = { id: string; offer_id: string; borrower_id: string; lender_id: string; coin: string; collateral_coin: string; amount: unknown; rate_pct: unknown; days: number; start_ltv_pct: unknown };

/** Turn an accepted proposal into a loan with its own lockbox. Throws a plain reason. */
export async function createLoan(p: ProposalRow): Promise<LoanRow> {
  const terms: R.LoanTerms = {
    coin: p.coin as R.LoanCoin, collateralCoin: p.collateral_coin as R.CollateralCoin,
    amount: Number(p.amount), ratePct: Number(p.rate_pct), days: p.days, startLtvPct: Number(p.start_ltv_pct),
  };
  const problem = R.termsProblem(terms);
  if (problem) throw new Error(problem);
  const { pocketSender } = await import("@/lib/pocket-send/pocket.server");
  const [b, l, lenderSend, price] = await Promise.all([
    pocketPub(p.borrower_id).catch((e) => { throw new Error(`The borrower ${(e as Error).message}`); }),
    pocketPub(p.lender_id).catch((e) => { throw new Error(`The lender ${(e as Error).message}`); }),
    pocketSender(p.lender_id, legOf(terms.coin)),
    collateralPrice(terms.collateralCoin),
  ]);
  if (!lenderSend.ok) throw new Error(`The lender's pocket can't send ${terms.coin} yet: ${lenderSend.reason}`);
  if (!price) throw new Error(`No live ${terms.collateralCoin} price right now — try again in a minute`);
  const seeds = await seedsKey(p.id);
  const rs = E.buildEscrowScript({ borrowerPub: b.pub, lenderPub: l.pub, seedsPub: seeds.publicKey });
  const ref = `LN-${bytesToHex(crypto.getRandomValues(new Uint8Array(3))).toUpperCase()}`;
  const row = {
    ref, offer_id: p.offer_id, proposal_id: p.id, borrower_id: p.borrower_id, lender_id: p.lender_id,
    coin: terms.coin, collateral_coin: terms.collateralCoin, amount: terms.amount, rate_pct: terms.ratePct, days: terms.days,
    start_ltv_pct: terms.startLtvPct, owed: R.amountOwed(terms), fee_pct: R.SEEDS_DEFAULT_FEE_PCT,
    collateral_amount: R.collateralNeeded(terms, price), price_at_start: price,
    borrower_pub: bytesToHex(b.pub), lender_pub: bytesToHex(l.pub), seeds_pub: bytesToHex(seeds.publicKey),
    redeem_script: bytesToHex(rs), escrow_address: E.escrowAddress(rs),
    borrower_collateral_address: b.address, lender_collateral_address: l.address,
    seeds_fee_address: E.p2pkhAddress(seeds.publicKey, TXC_P2PKH),
    collateral_deadline: new Date(Date.now() + R.COLLATERAL_DEADLINE_HOURS * HOUR).toISOString(),
  };
  const { data, error } = await supabaseAdmin.from("loans").insert(row).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't create the loan");
  const loan = normLoan(data as Record<string, unknown>);
  await loanEvent(loan.id, "created", `Terms agreed: ${terms.amount} ${terms.coin} for ${terms.days} days at ${terms.ratePct}% (${loan.owed} ${terms.coin} owed). The borrower locks ${loan.collateral_amount} TXC (at $${price.toFixed(4)}) in the loan's own lockbox.`);
  await Promise.all([
    loanAlert(loan.borrower_id, loan.id, `Your loan ${ref} is agreed. Lock ${loan.collateral_amount} TXC in its lockbox within ${R.COLLATERAL_DEADLINE_HOURS} hours to get ${terms.amount} ${terms.coin}.`),
    loanAlert(loan.lender_id, loan.id, `Your loan ${ref} is agreed. Once the borrower's collateral is locked you'll be asked to send ${terms.amount} ${terms.coin}.`),
  ]);
  return loan;
}

/* --------------------------------- lockbox -------------------------------- */

export async function escrowCoins(l: Pick<LoanRow, "escrow_address">) {
  const { lockCoins } = await import("@/lib/lock/lock.server");
  return lockCoins("TXC", l.escrow_address);
}

export function sumCoins(coins: { value: bigint; confirmations: number }[], minConf: number): bigint {
  return coins.filter((c) => c.confirmations >= minConf).reduce((n, c) => n + c.value, 0n);
}

const OUTCOME: Record<R.EscrowPurpose, R.LoanOutcome> = { return: "cancelled", release: "repaid", liquidate: "liquidated", default: "defaulted" };

/**
 * Pay out the lockbox once. Claims the loan row first (one payout per loan, never while a
 * repayment is on its way for liquidations/defaults), builds the split from the stored terms,
 * signs with the two keys signersFor() names, records the signed payout, then broadcasts.
 */
export async function escrowPayout(loanId: string, purpose: R.EscrowPurpose, why: string): Promise<string | null> {
  let q = supabaseAdmin.from("loans").update({ escrow_purpose: purpose, escrow_claimed_at: new Date().toISOString() })
    .eq("id", loanId).is("escrow_purpose", null);
  if (purpose === "return") q = q.in("status", ["awaiting_collateral", "awaiting_funding"]).is("funding_started_at", null);
  else if (purpose === "release") q = q.eq("status", "active").not("repaid_confirmed_at", "is", null);
  else q = q.eq("status", "active").is("repay_started_at", null);
  const { data: claimed } = await q.select("*").maybeSingle();
  if (!claimed) return null;
  const l = normLoan(claimed as Record<string, unknown>);
  const unclaim = () => supabaseAdmin.from("loans").update({ escrow_purpose: null, escrow_claimed_at: null }).eq("id", l.id).is("escrow_hex", null);
  try {
    const all = await escrowCoins(l);
    const coins = all.filter((c) => c.confirmations >= 1);
    if (!coins.length) {
      if (purpose !== "return") throw new Error("The lockbox has no confirmed coins");
      await supabaseAdmin.from("loans").update({ status: "closed", outcome: "cancelled", closed_at: new Date().toISOString() }).eq("id", l.id);
      await loanEvent(l.id, "closed", `Cancelled: ${why} No collateral had arrived, so nothing needed returning.`);
      return null;
    }
    const total = coins.reduce((n, c) => n + c.value, 0n);
    const { feeRateFor } = await import("@/lib/utxo/io.server");
    const { feeCapProblem } = await import("@/lib/utxo/fee-cap");
    const feeRate = await feeRateFor("txc");
    const networkFee = BigInt(Math.ceil(feeRate * E.escrowTxBytes(coins.length, 3)));
    const capProblem = feeCapProblem("txc", Number(networkFee));
    if (capProblem) throw new Error(capProblem);

    let price: number | null = null;
    let split: R.Split;
    if (purpose === "return" || purpose === "release") split = R.returnSplit(total, networkFee);
    else {
      const ref = R.referencePrice(await priceMarks(l.collateral_coin), Date.now());
      if (!ref.fresh || ref.latest === null) throw new Error("No fresh TXC price — the payout waits");
      price = ref.latest;
      split = R.liquidationSplit({ collateralSats: total, owed: l.owed, price, feePct: l.fee_pct, networkFeeSats: networkFee });
    }
    const script = (a: string) => E.p2pkhScript(a, TXC_P2PKH);
    const tx = E.buildEscrowTx(coins, [
      { script: script(l.lender_collateral_address), value: split.lenderSats },
      { script: script(l.borrower_collateral_address), value: split.borrowerSats },
      { script: script(l.seeds_fee_address), value: split.seedsFeeSats },
    ]);
    const rs = hexToBytes(l.redeem_script);
    const keys = E.parseEscrowScript(rs);
    if (!keys || bytesToHex(keys.seedsPub) !== l.seeds_pub) throw new Error("This isn't the loan's lockbox");

    const [memberRole] = R.signersFor(purpose);
    const memberId = memberRole === "borrower" ? l.borrower_id : l.lender_id;
    const memberPubHex = memberRole === "borrower" ? l.borrower_pub : l.lender_pub;
    const pocket = await txcPocket(memberId);
    if (!pocket) throw new Error(`The ${memberRole}'s pocket key isn't available to Seeds (link revoked?)`);
    const { withPocketKey } = await import("@/lib/xchain/send.server");
    const memberSigs = await withPocketKey(pocket.link, "TXC", pocket.address, async (priv) => {
      if (bytesToHex(secp256k1.getPublicKey(priv, true)) !== memberPubHex) throw new Error(`The ${memberRole}'s pocket key no longer matches the lockbox`);
      return tx.inputs.map((_, i) => E.signEscrowInput(tx, i, rs, priv));
    });
    const seeds = await seedsKey(l.proposal_id);
    if (bytesToHex(seeds.publicKey) !== l.seeds_pub) throw new Error("Seeds' key for this lockbox has changed — the team must look");
    const seedsSigs: Uint8Array[] = [];
    for (let i = 0; i < tx.inputs.length; i++) seedsSigs.push(Uint8Array.of(...(await seeds.sign(E.escrowSighash(tx, i, rs))), 0x01));
    const hex = E.finalizeEscrowTx(tx, rs, tx.inputs.map((_, i) => ({ [memberRole]: memberSigs[i]!, seeds: seedsSigs[i]! })));
    const txid = bytesToHex(sha256(sha256(hexToBytes(hex))).reverse());
    const splitJson = { lender: split.lenderSats.toString(), borrower: split.borrowerSats.toString(), seeds_fee: split.seedsFeeSats.toString(), network_fee: split.networkFeeSats.toString() };
    const { error } = await supabaseAdmin.from("loans").update({
      escrow_hex: hex, escrow_txid: txid, escrow_split: splitJson, escrow_price: price, status: "closing", outcome: OUTCOME[purpose],
    }).eq("id", l.id).is("escrow_hex", null);
    if (error) throw new Error(error.message);
    const coin = (s: bigint) => (Number(s) / R.SATS).toString();
    await loanEvent(l.id, "payout_signed",
      `${why} Lockbox payout: ${coin(split.lenderSats)} TXC to the lender, ${coin(split.borrowerSats)} TXC back to the borrower${split.seedsFeeSats > 0n ? `, ${coin(split.seedsFeeSats)} TXC Seeds fee` : ""} (network fee ${coin(split.networkFeeSats)} TXC).`, null, txid);
    const { broadcastTogether } = await import("@/lib/lock/lock.server");
    await broadcastTogether("TXC", [hex]).catch((e) => loanEvent(l.id, "broadcast_retry", `Broadcast will be retried: ${(e as Error).message}`));
    const msg: Record<R.EscrowPurpose, [string, string]> = {
      return: [`Your ${l.ref} collateral is on its way back to your pocket.`, `Loan ${l.ref} was cancelled; the borrower's collateral is being returned.`],
      release: [`Repayment confirmed — your ${l.ref} collateral is on its way back to your pocket. 🎉`, `Loan ${l.ref} is repaid in full. Thanks for lending!`],
      liquidate: [`⚠ Loan ${l.ref} was liquidated: TXC fell too far. Any leftover collateral is on its way back to you.`, `Loan ${l.ref} was liquidated to protect you: collateral worth what you're owed is on its way to your TXC pocket.`],
      default: [`⚠ Loan ${l.ref} defaulted after the grace period. Any leftover collateral is on its way back to you.`, `Loan ${l.ref} defaulted: collateral worth what you're owed is on its way to your TXC pocket.`],
    };
    await Promise.all([loanAlert(l.borrower_id, l.id, msg[purpose][0]), loanAlert(l.lender_id, l.id, msg[purpose][1])]);
    return txid;
  } catch (e) {
    await unclaim();
    const m = e instanceof Error ? e.message : String(e);
    await loanEvent(l.id, "payout_waiting", `Lockbox payout (${purpose}) didn't go out yet: ${m}`);
    return null;
  }
}

/* ------------------------------ pocket sends ------------------------------ */

export type LoanSendKind = "loan_collateral" | "loan_funding" | "loan_repay";

/** Ask the right member to approve the next send in Telegram. Returns the approval or throws a plain reason. */
export async function requestLoanSend(l: LoanRow, kind: LoanSendKind, actorId: string) {
  const { pocketSender, pocketLegBalance, coverProblem, receiveAddress } = await import("@/lib/pocket-send/pocket.server");
  const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
  let payer: string, leg: LegId, amount: number, to: string | null, what: string;
  if (kind === "loan_collateral") {
    if (l.status !== "awaiting_collateral") throw new Error("Collateral isn't needed right now");
    payer = l.borrower_id; leg = "txc"; to = l.escrow_address;
    const have = sumCoins(await escrowCoins(l), 0);
    amount = Math.ceil((l.collateral_amount - Number(have) / R.SATS) * R.SATS) / R.SATS;
    if (amount <= 0) throw new Error("The full collateral has already arrived — it's waiting for confirmations");
    what = `Seeds Lend · lock collateral for ${l.ref}`;
  } else if (kind === "loan_funding") {
    const p = R.canFund({ status: l.status, escrowPurpose: l.escrow_purpose, fundingTxid: l.funding_txid, fundingDeadlineMs: ms(l.funding_deadline) }, Date.now());
    if (p) throw new Error(p);
    payer = l.lender_id; leg = legOf(l.coin); amount = l.amount; to = await receiveAddress(l.borrower_id, leg);
    what = `Seeds Lend · send loan ${l.ref} to the borrower`;
  } else {
    const p = R.canRepay({ status: l.status, escrowPurpose: l.escrow_purpose, repayTxid: l.repay_txid });
    if (p) throw new Error(p);
    payer = l.borrower_id; leg = legOf(l.coin); amount = l.owed; to = await receiveAddress(l.lender_id, leg);
    what = `Seeds Lend · repay loan ${l.ref}`;
  }
  if (actorId !== payer) throw new Error("Only the paying side can start this send");
  if (!to) throw new Error("The other side has no receiving address for this coin yet");
  const s = await pocketSender(payer, leg);
  if (!s.ok) throw new Error(s.reason);
  const problem = coverProblem(leg, await pocketLegBalance(s.address, leg, amount), amount);
  if (problem) throw new Error(problem);
  if (kind !== "loan_repay") {
    // Coins set aside for open orders and trades stay put (set-asides.ts). A repayment
    // always goes; orders it leaves uncovered are cancelled by the order watch.
    const { pocketSpendProblem } = await import("@/lib/set-asides.server");
    const why = await pocketSpendProblem(payer, leg, amount, { address: s.address, network: null });
    if (why) throw new Error(why);
  }
  const ap = await requestSendApproval({ userId: payer, linkId: s.link.id, purpose: kind, refId: l.id, leg, amount, from: s.address, to, what });
  await loanEvent(l.id, "approval_requested", `${what}: ${amount} ${leg.toUpperCase()} — waiting for a Telegram tap.`, actorId);
  return ap;
}

/** After a Telegram decision on a loan send: send it, or note that it didn't happen. Never throws. */
export async function continueLoanSend(r: ApprovalRow) {
  try {
    const l = await loadLoan(r.ref_id);
    if (!l) return;
    const kind = r.purpose as LoanSendKind;
    const label = kind === "loan_collateral" ? "collateral" : kind === "loan_funding" ? "loan" : "repayment";
    if (r.status === "declined" || r.status === "expired" || r.status === "cancelled") {
      await loanEvent(l.id, "approval_" + r.status, `The ${label} send ${r.status === "declined" ? "was declined" : r.status === "expired" ? "wasn't approved in time" : "was cancelled"} in Telegram. Nothing was sent.`);
      return;
    }
    if (r.status !== "approved") return;
    const { spendApproval, recordApprovalTx, recordApprovalError } = await import("@/lib/pocket-send/approvals.server");
    const { pocketSender, sendFromPocket } = await import("@/lib/pocket-send/pocket.server");
    const leg = r.leg as LegId;
    const s = await pocketSender(r.user_id, leg);
    if (!s.ok) { await loanEvent(l.id, "send_blocked", `Couldn't send the ${label}: ${s.reason}`); return; }
    // The destination must still be what the loan says.
    if (kind === "loan_collateral" && r.to_address !== l.escrow_address) return;
    const spent = await spendApproval({ purpose: kind, refId: l.id, leg, userId: r.user_id, linkId: s.link.id, amount: r.amount, from: s.address, to: r.to_address }).catch(() => null);
    if (!spent) return;

    const now = new Date().toISOString();
    if (kind === "loan_funding") {
      const { data } = await supabaseAdmin.from("loans").update({ funding_started_at: now }).eq("id", l.id)
        .eq("status", "awaiting_funding").is("escrow_purpose", null).is("funding_started_at", null).gt("funding_deadline", now).select("id").maybeSingle();
      if (!data) { await recordApprovalError(spent.id, "The loan can no longer be funded"); return; }
    }
    if (kind === "loan_repay") {
      const { data } = await supabaseAdmin.from("loans").update({ repay_started_at: now }).eq("id", l.id)
        .eq("status", "active").is("escrow_purpose", null).is("repay_started_at", null).select("id").maybeSingle();
      if (!data) { await recordApprovalError(spent.id, "The loan can no longer be repaid this way"); return; }
    }
    try {
      const sent = await sendFromPocket({ link: s.link, leg, from: s.address, to: r.to_address, amount: r.amount, record: (txid) => recordApprovalTx(spent.id, txid) });
      await recordApprovalTx(spent.id, sent.txid);
      if (kind === "loan_funding") {
        await supabaseAdmin.from("loans").update({
          funding_txid: sent.txid, funding_network: sent.chain, funding_to: r.to_address, funded_at: now,
          due_at: new Date(Date.now() + l.days * 24 * HOUR).toISOString(),
        }).eq("id", l.id);
        await loanAlert(l.borrower_id, l.id, `💸 ${l.amount} ${l.coin} is on its way to your pocket. Due in ${l.days} days: ${l.owed} ${l.coin}.`);
      } else if (kind === "loan_repay") {
        await supabaseAdmin.from("loans").update({ repay_txid: sent.txid, repay_network: sent.chain, repay_to: r.to_address, repay_sent_at: now }).eq("id", l.id);
        await loanAlert(l.lender_id, l.id, `💸 The borrower sent ${l.owed} ${l.coin} to repay ${l.ref}. The collateral is released once it confirms.`);
      }
      await loanEvent(l.id, `${label}_sent`, `Sent ${r.amount} ${r.asset} (${label}).`, r.user_id, sent.txid);
    } catch (e) {
      const m = e instanceof Error ? e.message : "Send failed";
      await recordApprovalError(spent.id, m);
      if (kind === "loan_funding") await supabaseAdmin.from("loans").update({ funding_started_at: null }).eq("id", l.id).is("funding_txid", null);
      if (kind === "loan_repay") await supabaseAdmin.from("loans").update({ repay_started_at: null }).eq("id", l.id).is("repay_txid", null);
      await loanEvent(l.id, "send_failed", `The ${label} send failed: ${m} Nothing was sent.`);
    }
  } catch (e) {
    console.error("[loans] continue failed", r.id, e);
  }
}

/* --------------------------------- watcher -------------------------------- */

async function sendState(leg: LegId, txid: string, network: string | null, sentAt: string | null) {
  const { checkSentLeg } = await import("@/lib/settle/confirm.server");
  const { sentLegState, confirmationsNeeded } = await import("@/lib/settle/confirm-rules");
  const c = await checkSentLeg(leg, txid, network, Date.now() - (ms(sentAt) || Date.now()));
  return sentLegState(c, confirmationsNeeded(network));
}

/** Move one loan along. Safe to run any number of times. */
export async function tickLoan(id: string): Promise<void> {
  const l = await loadLoan(id);
  if (!l || l.status === "closed") return;
  const now = Date.now();

  if (l.status === "awaiting_collateral" || l.status === "awaiting_funding") {
    const coins = await escrowCoins(l).catch(() => null);
    const confirmed = coins ? Number(sumCoins(coins, R.COLLATERAL_CONFIRMATIONS)) / R.SATS : l.collateral_seen;
    if (coins && confirmed !== l.collateral_seen) await supabaseAdmin.from("loans").update({ collateral_seen: confirmed, last_checked_at: new Date().toISOString() }).eq("id", l.id);
    if (l.status === "awaiting_collateral") {
      if (confirmed + 1e-8 >= l.collateral_amount) {
        const { data } = await supabaseAdmin.from("loans").update({
          status: "awaiting_funding", collateral_confirmed_at: new Date().toISOString(),
          funding_deadline: new Date(now + R.FUNDING_DEADLINE_HOURS * HOUR).toISOString(),
        }).eq("id", l.id).eq("status", "awaiting_collateral").select("id").maybeSingle();
        if (data) {
          await loanEvent(l.id, "collateral_locked", `${confirmed} TXC is locked and confirmed in the lockbox.`);
          await Promise.all([
            loanAlert(l.lender_id, l.id, `🔒 The borrower's ${confirmed} TXC is locked for ${l.ref}. Tap "Send the loan" within ${R.FUNDING_DEADLINE_HOURS} hours to send ${l.amount} ${l.coin}.`),
            loanAlert(l.borrower_id, l.id, `🔒 Your ${confirmed} TXC is locked for ${l.ref}. Waiting for the lender to send ${l.amount} ${l.coin}.`),
          ]);
        }
      } else if (now > ms(l.collateral_deadline)) {
        await escrowPayout(l.id, "return", "The collateral didn't arrive in time.");
      }
      return;
    }
    // awaiting_funding
    if (l.funding_txid) {
      const st = await sendState(legOf(l.coin), l.funding_txid, l.funding_network, l.funded_at);
      if (st === "confirmed") {
        const { data } = await supabaseAdmin.from("loans").update({ status: "active", funding_confirmed_at: new Date().toISOString() })
          .eq("id", l.id).eq("status", "awaiting_funding").select("id").maybeSingle();
        if (data) await loanEvent(l.id, "active", `The loan is confirmed on-chain. ${l.owed} ${l.coin} is due ${new Date(ms(l.due_at)).toUTCString()}.`);
      } else if (st === "vanished") {
        await loanEvent(l.id, "funding_vanished", "The loan send can't be found on the network. The team has been asked to look; the collateral stays locked.");
      }
    } else if (!l.funding_started_at && now > ms(l.funding_deadline)) {
      await escrowPayout(l.id, "return", "The lender didn't send the loan in time.");
    }
    return;
  }

  if (l.status === "active") {
    if (l.repay_txid) {
      const st = await sendState(legOf(l.coin), l.repay_txid, l.repay_network, l.repay_sent_at);
      if (st === "confirmed") {
        await supabaseAdmin.from("loans").update({ repaid_confirmed_at: new Date().toISOString() }).eq("id", l.id).is("repaid_confirmed_at", null);
        await loanEvent(l.id, "repaid", `Repayment of ${l.owed} ${l.coin} confirmed on-chain.`);
        await escrowPayout(l.id, "release", "Repaid in full.");
      } else if (st === "vanished") {
        // The repayment never landed: the loan is open again (liquidation and default checks resume).
        await supabaseAdmin.from("loans").update({ repay_txid: null, repay_started_at: null, repay_network: null, repay_sent_at: null }).eq("id", l.id).is("repaid_confirmed_at", null);
        await loanEvent(l.id, "repay_vanished", "The repayment can't be found on the network, so the loan is open again.");
        await loanAlert(l.borrower_id, l.id, `⚠ Your repayment for ${l.ref} didn't land on the network. Please repay again.`);
      }
      return;
    }
    const coins = await escrowCoins(l).catch(() => null);
    const locked = coins ? Number(sumCoins(coins, 1)) / R.SATS : l.collateral_seen;
    const marks = await priceMarks(l.collateral_coin);
    const ref = R.referencePrice(marks, now);
    const ltv = ref.latest ? R.ltvPct(l.owed, locked, ref.latest) : null;
    await supabaseAdmin.from("loans").update({ collateral_seen: locked, last_price: ref.latest, last_ltv_pct: ltv !== null && Number.isFinite(ltv) ? Math.round(ltv * 100) / 100 : null, last_checked_at: new Date().toISOString() }).eq("id", l.id);
    if (coins && R.shouldLiquidate(l.owed, locked, marks, now)) {
      await escrowPayout(l.id, "liquidate", `Loan-to-value reached ${ltv?.toFixed(1)}% (liquidation at ${R.LIQUIDATION_LTV}%).`);
      return;
    }
    if (l.due_at && R.isDefaulted(ms(l.due_at), now)) {
      await escrowPayout(l.id, "default", `Not repaid by the due date plus the ${R.GRACE_HOURS}-hour grace period.`);
      return;
    }
    const callDue = !l.margin_called_at || now - ms(l.margin_called_at) > 12 * HOUR;
    if (ltv !== null && R.healthOf(ltv) === "margin_call" && callDue) {
      await supabaseAdmin.from("loans").update({ margin_called_at: new Date().toISOString() }).eq("id", l.id);
      const liq = R.liquidationPrice(l.owed, locked);
      await loanEvent(l.id, "margin_call", `Loan-to-value is ${ltv.toFixed(1)}%. Liquidation happens at ${R.LIQUIDATION_LTV}% (TXC ≈ $${liq.toFixed(4)}).`);
      await loanAlert(l.borrower_id, l.id, `⚠ ${l.ref} is at ${ltv.toFixed(1)}% loan-to-value. Add TXC to the lockbox or repay to avoid liquidation at ${R.LIQUIDATION_LTV}% (TXC ≈ $${liq.toFixed(4)}).`);
    }
    if (l.due_at && now > ms(l.due_at) && now - ms(l.due_at) < 13 * 60_000) {
      await loanAlert(l.borrower_id, l.id, `⏰ ${l.ref} is due now: ${l.owed} ${l.coin}. You have ${R.GRACE_HOURS} hours before it defaults.`);
    }
    return;
  }

  if (l.status === "closing" && l.escrow_hex && l.escrow_txid) {
    const { rpc } = await import("@/lib/rpc.server");
    const tx = await rpc<{ confirmations?: number }>("txc", "getrawtransaction", [l.escrow_txid, true]).catch(() => null);
    if (tx && (tx.confirmations ?? 0) >= 1) {
      await supabaseAdmin.from("loans").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", l.id).eq("status", "closing");
      await loanEvent(l.id, "closed", "The lockbox payout is confirmed. This loan is closed.", null, l.escrow_txid);
    } else if (!tx) {
      const { broadcastTogether } = await import("@/lib/lock/lock.server");
      await broadcastTogether("TXC", [l.escrow_hex]).catch(() => {});
    }
  }
}

/** Every open loan, oldest first. Also ends proposals nobody answered in time. */
export async function tickAllLoans(limit = 40) {
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("loan_proposals").update({ status: "expired", decided_at: nowIso }).eq("status", "pending").lt("expires_at", nowIso);
  const { data } = await supabaseAdmin.from("loans").select("id").neq("status", "closed").order("updated_at", { ascending: true }).limit(limit);
  let done = 0;
  for (const r of data ?? []) {
    await tickLoan(r.id).catch((e) => console.error("[loans] tick failed", r.id, e));
    done++;
  }
  return { loans: done };
}
