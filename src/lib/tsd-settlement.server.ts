/**
 * Real TSD settlement on the TEXITcoin Omni Layer.
 *
 * TSD (Texas Stable Dollar) is Omni property #39. It rides on ordinary TEXITcoin
 * addresses, so the *same* authorized trading branch that delivers TXC also
 * delivers TSD — with its own cap, stored as a separate `asset = 'TSD'`
 * authorization row.
 *
 * The path mirrors the TXC and USDC legs: authorization → cap/expiry gate →
 * decrypt branch key → node builds the Omni carrier tx → sign locally →
 * broadcast → watch confirmations. Every gate lives in `loadTsdDelegation`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TSD_PROPERTY_ID } from "@/lib/chains";
import { decryptDelegatedKey } from "./delegation.server";
import { fetchOmniBalance, fetchOmniTx, omniSimpleSend } from "./omni.server";
import { rpcConfigured } from "./rpc.server";
import { isValidTxcAddress } from "./txc/tx.server";
import { loadUtxos, refreshTradeStatus } from "./settlement.server";
import { delivererOf, legAmount, legRole, receiverOf as receiverFor, type TradeShape } from "./leg-roles";

const CONFIRMATIONS_REQUIRED = 2;
/** Whole TXC the branch needs on hand to pay the Omni carrier's miner fee. */
const CARRIER_FEE_TXC = 0.001;

type TradeParties = TradeShape;

/** Whoever delivers the TSD leg of this pair. */
function senderOf(t: TradeParties): string {
  return delivererOf(t, legRole(t.pair, "tsd")) as string;
}

function receiverOf(t: TradeParties): string {
  return receiverFor(t, legRole(t.pair, "tsd")) as string;
}

async function loadTrade(userId: string, tradeId: string): Promise<TradeParties> {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, pair, maker_id, taker_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trade not found");
  const t = data as unknown as TradeParties;
  if (t.maker_id !== userId && t.taker_id !== userId) {
    throw new Error("Forbidden: you are not a party to this trade");
  }
  return t;
}

type TsdDelegation = {
  address: string;
  maxAmount: number;
  expiresAt: string;
  ciphertext: string;
};

/** The sender's live TSD authorization. Expired rows are destroyed first. */
async function loadTsdDelegation(userId: string): Promise<TsdDelegation | null> {
  await supabaseAdmin.rpc("purge_expired_delegations");
  const { data, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("trading_address, max_amount, expires_at, key_ciphertext")
    .eq("user_id", userId)
    .eq("chain", "txc")
    .eq("asset", "TSD")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    address: data.trading_address,
    maxAmount: Number(data.max_amount),
    expiresAt: data.expires_at,
    ciphertext: data.key_ciphertext,
  };
}

function tsdAmountOf(t: TradeParties, expected?: number | null): number {
  return legAmount(t, legRole(t.pair, "tsd"), expected);
}

/* --------------------------------- preview -------------------------------- */

export type TsdPreview = {
  ready: boolean;
  reason: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  balance: number | null;
  /** TXC on the branch, needed for the Omni carrier's miner fee. */
  feeBalance: number | null;
  amount: number;
  propertyId: number;
  nodeOnline: boolean;
};

export async function previewTsdSettlement(userId: string, tradeId: string): Promise<TsdPreview> {
  const t = await loadTrade(userId, tradeId);
  const sender = senderOf(t);
  const receiver = receiverOf(t);

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", "tsd")
    .maybeSingle();

  const amount = tsdAmountOf(t, leg?.expected_amount);
  const base: TsdPreview = {
    ready: false,
    reason: null,
    fromAddress: null,
    toAddress: null,
    balance: null,
    feeBalance: null,
    amount,
    propertyId: TSD_PROPERTY_ID,
    nodeOnline: rpcConfigured("txc"),
  };

  if (!base.nodeOnline) return { ...base, reason: "The TEXITcoin node is not reachable" };

  const [del, { data: wallet }] = await Promise.all([
    loadTsdDelegation(sender),
    supabaseAdmin.from("wallets").select("txc_address").eq("user_id", receiver ?? "").maybeSingle(),
  ]);

  const toAddress = wallet?.txc_address ?? null;
  if (!del) return { ...base, toAddress, reason: "The buyer has no live TSD authorization" };

  const ctx = { ...base, fromAddress: del.address, toAddress };
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    return { ...ctx, reason: "The TSD authorization has expired" };
  }
  if (amount > del.maxAmount + 1e-8) {
    return { ...ctx, reason: `Trade size exceeds the authorized cap of ${del.maxAmount} TSD` };
  }
  if (!toAddress || !isValidTxcAddress(toAddress)) {
    return { ...ctx, reason: "The seller has no valid TEXITcoin receiving address" };
  }

  const [omni, utxos] = await Promise.all([
    fetchOmniBalance(del.address),
    loadUtxos(del.address).catch(() => []),
  ]);
  const feeBalance = utxos.reduce((sum, u) => sum + u.amount, 0);

  if (omni.balance < amount) {
    return {
      ...ctx,
      balance: omni.balance,
      feeBalance,
      reason: `The authorized branch holds ${omni.balance.toFixed(2)} TSD, needs ${amount.toFixed(2)}`,
    };
  }
  if (feeBalance < CARRIER_FEE_TXC) {
    return {
      ...ctx,
      balance: omni.balance,
      feeBalance,
      reason: `The branch needs about ${CARRIER_FEE_TXC} TXC to pay the Omni carrier fee`,
    };
  }

  return { ...ctx, ready: true, balance: omni.balance, feeBalance };
}

/* -------------------------------- settlement ------------------------------ */

export type TsdSettleResult = { txid: string; amount: number; to: string; propertyId: number };

export async function settleTsdLeg(userId: string, tradeId: string): Promise<TsdSettleResult> {
  const t = await loadTrade(userId, tradeId);
  if (t.status === "settled") throw new Error("This trade is already settled");
  if (t.status === "disputed") throw new Error("This trade is in dispute");

  const sender = senderOf(t);
  const receiver = receiverOf(t);
  if (!sender || !receiver) throw new Error("This trade has no counterparty yet");

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, status, release_txid, expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", "tsd")
    .maybeSingle();
  if (!leg) throw new Error("TSD escrow leg not found");
  if (leg.release_txid && !leg.release_txid.startsWith("sim-")) {
    throw new Error("The TSD leg has already been broadcast");
  }

  const del = await loadTsdDelegation(sender);
  if (!del) throw new Error("No live TSD authorization — the buyer must authorize the branch");
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    throw new Error("The TSD authorization has expired");
  }

  const amount = tsdAmountOf(t, leg.expected_amount);
  if (amount > del.maxAmount + 1e-8) {
    throw new Error(`Trade size ${amount} TSD exceeds the authorized cap of ${del.maxAmount}`);
  }

  const { data: wallet } = await supabaseAdmin
    .from("wallets")
    .select("txc_address")
    .eq("user_id", receiver)
    .maybeSingle();
  const to = wallet?.txc_address;
  if (!to || !isValidTxcAddress(to)) {
    throw new Error("The seller has no valid TEXITcoin receiving address");
  }

  const omni = await fetchOmniBalance(del.address);
  if (!omni.online) throw new Error("The TEXITcoin node is not reachable");
  if (omni.balance < amount) {
    throw new Error(
      `The authorized branch holds ${omni.balance.toFixed(2)} TSD, needs ${amount.toFixed(2)}`,
    );
  }

  // Decrypt last: everything above can fail without touching key material.
  const privateKeyHex = decryptDelegatedKey(del.ciphertext);

  const sent = await omniSimpleSend({
    privateKeyHex,
    fromAddress: del.address,
    toAddress: to,
    amount,
    propertyId: TSD_PROPERTY_ID,
  });

  await supabaseAdmin
    .from("escrows")
    .update({ status: "released", release_txid: sent.txid, funded_amount: amount, confirmations: 0 })
    .eq("id", leg.id);

  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id,
    actor_id: userId,
    event: "tsd_broadcast",
    detail: {
      txid: sent.txid,
      amount,
      to,
      from: del.address,
      property_id: TSD_PROPERTY_ID,
      simulated: false,
    },
  });

  await refreshTradeStatus(t.id);

  return { txid: sent.txid, amount, to, propertyId: TSD_PROPERTY_ID };
}

/* ------------------------------- confirmations ---------------------------- */

export type TsdWatchResult = {
  tradeId: string;
  txid: string | null;
  confirmations: number | null;
  valid: boolean | null;
  invalidReason: string | null;
};

export async function watchTsdLeg(userId: string, tradeId: string): Promise<TsdWatchResult> {
  const t = await loadTrade(userId, tradeId);

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, release_txid, confirmations")
    .eq("trade_id", t.id)
    .eq("leg", "tsd")
    .maybeSingle();
  if (!leg) throw new Error("TSD escrow leg not found");

  const txid = leg.release_txid;
  if (!txid || txid.startsWith("sim-")) {
    return { tradeId, txid: null, confirmations: null, valid: null, invalidReason: null };
  }

  const status = await fetchOmniTx(txid);
  if (status.confirmations !== null) {
    await supabaseAdmin.from("escrows").update({ confirmations: status.confirmations }).eq("id", leg.id);
    if (status.confirmations >= CONFIRMATIONS_REQUIRED) await refreshTradeStatus(t.id);
  }

  return {
    tradeId,
    txid,
    confirmations: status.confirmations,
    valid: status.valid,
    invalidReason: status.invalidReason,
  };
}
