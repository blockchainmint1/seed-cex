/**
 * Real UTXO settlement — TEXITcoin, Litecoin, and Iskandercoin.
 *
 * The path is: authorization → cap/expiry gate → decrypt branch key → gather
 * UTXOs → build + sign → broadcast → watch confirmations.
 *
 * Every gate lives here, in one file, so no future code path can reach
 * `decryptDelegatedKey` without passing them. Service-role writes are used
 * because settlement necessarily touches the counterparty's rows; the caller is
 * always authenticated and authorized before we get here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChain, type UtxoChainId } from "@/lib/chains";
import { decryptDelegatedKey } from "./delegation.server";
import {
  broadcastFor,
  confirmationsFor,
  feeRateFor,
  isValidUtxoAddress,
  loadUtxosFor,
  p2pkhVersionOf,
  utxoChainOnline,
} from "./utxo/io.server";
import { buildAndSignTransfer, isValidTxcAddress, type Utxo } from "./txc/tx.server";
import {
  delivererOf,
  legAmount,
  legRole,
  receiverOf,
  type TradeShape,
} from "./leg-roles";

const CONFIRMATIONS_REQUIRED = 2;

/** Which wallets column holds the receiving address for each UTXO chain. */
const RECEIVE_COLUMN: Record<UtxoChainId, "txc_address" | "ltc_address" | "isk_address"> = {
  txc: "txc_address",
  ltc: "ltc_address",
  isk: "isk_address",
};

function symbolOf(chain: UtxoChainId): string {
  return getChain(chain).nativeSymbol;
}

/** TXC UTXOs — kept for the Omni (TSD) carrier fee check. */
export async function loadUtxos(address: string): Promise<Utxo[]> {
  return loadUtxosFor("txc", address);
}

/* ------------------------------ authorization ----------------------------- */

export type AuthorizedKey = { privateKeyHex: string; address: string; maxAmount: number };

/**
 * The single gate. Loads the seller's authorization for one chain/asset and
 * refuses to decrypt anything unless it is live and inside the cap.
 */
async function openAuthorization(
  userId: string,
  chain: UtxoChainId,
  amount: number,
): Promise<AuthorizedKey> {
  // Expired rows are destroyed, not hidden — sweep before reading.
  await supabaseAdmin.rpc("purge_expired_delegations");
  const symbol = symbolOf(chain);

  const { data, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("key_ciphertext, trading_address, max_amount, expires_at, revoked_at")
    .eq("user_id", userId)
    .eq("chain", chain)
    .eq("asset", symbol)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(`No live ${symbol} authorization — the seller must authorize the trading branch`);
  }
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Error(`The ${symbol} authorization has expired`);
  }
  if (amount > Number(data.max_amount) + 1e-8) {
    throw new Error(
      `Trade size ${amount} ${symbol} exceeds the authorized cap of ${Number(data.max_amount)} ${symbol}`,
    );
  }

  return {
    privateKeyHex: decryptDelegatedKey(data.key_ciphertext),
    address: data.trading_address,
    maxAmount: Number(data.max_amount),
  };
}

/* -------------------------------- settlement ------------------------------ */

type TradeParties = TradeShape;

/** Whoever delivers this UTXO leg, given its role in the pair. */
function sellerOf(trade: TradeParties, chain: UtxoChainId): string {
  return delivererOf(trade, legRole(trade.pair, chain)) as string;
}

function buyerOf(trade: TradeParties, chain: UtxoChainId): string {
  return receiverOf(trade, legRole(trade.pair, chain)) as string;
}


export type SettleResult = {
  txid: string;
  amount: number;
  to: string;
  feeSats: number;
  inputs: number;
};

/**
 * Deliver a UTXO leg of a trade on-chain: seller's authorized branch → buyer's
 * savings address. Idempotent — a leg that already has a release txid is never
 * broadcast twice.
 */
export async function settleUtxoLeg(
  userId: string,
  tradeId: string,
  chain: UtxoChainId,
): Promise<SettleResult> {
  const symbol = symbolOf(chain);
  const { data: trade, error } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, pair, maker_id, taker_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!trade) throw new Error("Trade not found");

  const t = trade as unknown as TradeParties;
  if (t.maker_id !== userId && t.taker_id !== userId) {
    throw new Error("Forbidden: you are not a party to this trade");
  }
  if (t.status === "settled" || t.status === "released") throw new Error("This trade is already settled");
  if (t.status === "disputed") throw new Error("This trade is in dispute");

  const seller = sellerOf(t, chain);
  const buyer = buyerOf(t, chain);
  if (!seller || !buyer) throw new Error("This trade has no counterparty yet");

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, status, release_txid, expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", chain)
    .maybeSingle();
  if (!leg) throw new Error(`${symbol} escrow leg not found`);
  if (leg.release_txid && !leg.release_txid.startsWith("sim-")) {
    throw new Error(`The ${symbol} leg has already been broadcast`);
  }

  const column = RECEIVE_COLUMN[chain];
  const { data: buyerWallet } = await supabaseAdmin
    .from("wallets")
    .select(column)
    .eq("user_id", buyer)
    .maybeSingle();
  const destination = (buyerWallet as Record<string, string | null> | null)?.[column] ?? null;
  if (!destination || !isValidUtxoAddress(chain, destination)) {
    throw new Error(`The buyer has no valid ${symbol} receiving address`);
  }

  const amount = legAmount(t, legRole(t.pair, chain), leg.expected_amount);
  const auth = await openAuthorization(seller, chain, amount);

  const [utxos, feeRate] = await Promise.all([
    loadUtxosFor(chain, auth.address),
    feeRateFor(chain),
  ]);

  const built = buildAndSignTransfer({
    privateKeyHex: auth.privateKeyHex,
    fromAddress: auth.address,
    toAddress: destination,
    amount,
    utxos,
    feeRate,
    p2pkhVersion: p2pkhVersionOf(chain),
    symbol,
  });

  const txid = await broadcastFor(chain, built.hex);

  await supabaseAdmin
    .from("escrows")
    .update({ status: "released", release_txid: txid, funded_amount: amount, confirmations: 0 })
    .eq("id", leg.id);

  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id,
    actor_id: userId,
    event: `${chain}_broadcast`,
    detail: {
      txid,
      amount,
      to: destination,
      from: auth.address,
      fee_sats: built.feeSats,
      inputs: built.inputCount,
      simulated: false,
    },
  });

  await refreshTradeStatus(t.id);

  return { txid, amount, to: destination, feeSats: built.feeSats, inputs: built.inputCount };
}

/** Back-compat: the TXC leg. */
export async function settleTxcLeg(userId: string, tradeId: string): Promise<SettleResult> {
  return settleUtxoLeg(userId, tradeId, "txc");
}

/* ------------------------------- confirmations ---------------------------- */

export type WatchResult = {
  tradeId: string;
  leg: UtxoChainId;
  txid: string | null;
  confirmations: number | null;
  status: string;
};

/** Poll the chain for a UTXO leg's confirmation depth and advance the trade. */
export async function watchUtxoLeg(
  userId: string,
  tradeId: string,
  chain: UtxoChainId,
): Promise<WatchResult> {
  const { data: trade } = await supabaseAdmin
    .from("trades")
    .select("id, maker_id, taker_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) throw new Error("Trade not found");
  if (trade.maker_id !== userId && trade.taker_id !== userId) {
    throw new Error("Forbidden: you are not a party to this trade");
  }

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, release_txid, status, confirmations")
    .eq("trade_id", tradeId)
    .eq("leg", chain)
    .maybeSingle();
  if (!leg) throw new Error(`${symbolOf(chain)} escrow leg not found`);

  const txid = leg.release_txid;
  if (!txid || txid.startsWith("sim-")) {
    return { tradeId, leg: chain, txid: null, confirmations: null, status: leg.status };
  }

  const confirmations = await confirmationsFor(chain, txid);
  if (confirmations === null) {
    return { tradeId, leg: chain, txid, confirmations: null, status: leg.status };
  }

  await supabaseAdmin.from("escrows").update({ confirmations }).eq("id", leg.id);
  if (confirmations >= CONFIRMATIONS_REQUIRED) await refreshTradeStatus(tradeId);

  return { tradeId, leg: chain, txid, confirmations, status: leg.status };
}

export async function watchTxcLeg(userId: string, tradeId: string): Promise<WatchResult> {
  return watchUtxoLeg(userId, tradeId, "txc");
}

/** Trade status is derived from its legs, never set by hand. */
export async function refreshTradeStatus(tradeId: string) {
  const { data: legs } = await supabaseAdmin
    .from("escrows")
    .select("status")
    .eq("trade_id", tradeId);
  const statuses = (legs ?? []).map((l) => l.status);
  if (statuses.length === 0) return;

  const next = statuses.every((s) => s === "released")
    ? "settled"
    : statuses.some((s) => s === "released" || s === "confirmed")
      ? "both_funded"
      : null;
  if (!next) return;

  await supabaseAdmin.from("trades").update({ status: next }).eq("id", tradeId);
}

/* --------------------------------- preview -------------------------------- */

export type SettlementPreview = {
  ready: boolean;
  reason: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  balance: number | null;
  amount: number;
  feeRate: number;
  nodeOnline: boolean;
  symbol: string;
};

/** Dry run: everything settleUtxoLeg checks, minus decrypting or broadcasting. */
export async function previewUtxoSettlement(
  userId: string,
  tradeId: string,
  chain: UtxoChainId,
): Promise<SettlementPreview> {
  const symbol = symbolOf(chain);
  const feeRate = await feeRateFor(chain);
  const base: SettlementPreview = {
    ready: false,
    reason: null,
    fromAddress: null,
    toAddress: null,
    balance: null,
    amount: 0,
    feeRate,
    nodeOnline: utxoChainOnline(chain),
    symbol,
  };

  const { data: trade } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, pair, maker_id, taker_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) return { ...base, reason: "Trade not found" };

  const t = trade as unknown as TradeParties;
  if (t.maker_id !== userId && t.taker_id !== userId) {
    return { ...base, reason: "You are not a party to this trade" };
  }

  const amount = legAmount(t, legRole(t.pair, chain));
  const seller = sellerOf(t, chain);
  const buyer = buyerOf(t, chain);
  const column = RECEIVE_COLUMN[chain];

  const [{ data: del }, { data: buyerWallet }] = await Promise.all([
    supabaseAdmin
      .from("wallet_delegations")
      .select("trading_address, max_amount, expires_at")
      .eq("user_id", seller ?? "")
      .eq("chain", chain)
      .eq("asset", symbol)
      .is("revoked_at", null)
      .maybeSingle(),
    supabaseAdmin.from("wallets").select(column).eq("user_id", buyer ?? "").maybeSingle(),
  ]);

  const toAddress = (buyerWallet as Record<string, string | null> | null)?.[column] ?? null;
  const fromAddress = del?.trading_address ?? null;

  if (!del) {
    return { ...base, amount, toAddress, reason: `The seller has no live ${symbol} authorization` };
  }
  if (new Date(del.expires_at).getTime() <= Date.now()) {
    return { ...base, amount, fromAddress, toAddress, reason: "The seller's authorization expired" };
  }
  if (amount > Number(del.max_amount) + 1e-8) {
    return {
      ...base,
      amount,
      fromAddress,
      toAddress,
      reason: `Trade size exceeds the authorized cap of ${Number(del.max_amount)} ${symbol}`,
    };
  }
  if (!toAddress || !isValidUtxoAddress(chain, toAddress)) {
    return { ...base, amount, fromAddress, reason: `The buyer has no valid ${symbol} receiving address` };
  }

  let balance: number | null = null;
  try {
    const utxos = await loadUtxosFor(chain, fromAddress as string);
    balance = utxos.reduce((sum, u) => sum + u.amount, 0);
  } catch {
    return { ...base, amount, fromAddress, toAddress, reason: "Could not read the branch balance" };
  }

  if (balance < amount) {
    return {
      ...base,
      amount,
      fromAddress,
      toAddress,
      balance,
      reason: `The authorized branch holds ${balance.toFixed(8)} ${symbol}, needs ${amount} ${symbol}`,
    };
  }

  return { ...base, ready: true, amount, fromAddress, toAddress, balance };
}

export async function previewTxcSettlement(
  userId: string,
  tradeId: string,
): Promise<SettlementPreview> {
  return previewUtxoSettlement(userId, tradeId, "txc");
}

export { isValidTxcAddress };
