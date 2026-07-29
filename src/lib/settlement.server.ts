/**
 * Real TXC settlement.
 *
 * The path is: authorization → cap/expiry gate → decrypt branch key → gather
 * UTXOs → build + sign → broadcast to our own node → watch confirmations.
 *
 * Every gate lives here, in one file, so no future code path can reach
 * `decryptDelegatedKey` without passing them. Service-role writes are used
 * because settlement necessarily touches the counterparty's rows; the caller is
 * always authenticated and authorized before we get here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bytesToHex } from "@noble/hashes/utils.js";
import { decryptDelegatedKey } from "./delegation.server";
import { broadcastRawTx, fetchTxConfirmations, rpcConfigured, scanAddressUtxos } from "./rpc.server";
import { addressToScript, buildAndSignTransfer, isValidTxcAddress, type Utxo } from "./txc/tx.server";

const CONFIRMATIONS_REQUIRED = 2;
const DEFAULT_FEE_RATE = 10; // sat/vB

/* ---------------------------------- utxos --------------------------------- */

/** Our node first (scantxoutset), public Esplora mirror as the fallback. */
export async function loadUtxos(address: string): Promise<Utxo[]> {
  if (rpcConfigured("txc")) {
    const scan = await scanAddressUtxos("txc", [address]);
    if (scan) {
      return scan.utxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        scriptPubKey: u.scriptPubKey,
        amount: u.amount,
        height: u.height,
      }));
    }
  }

  const script = bytesToHex(addressToScript(address));
  const res = await fetch(`https://mempool.texitcoin.org/api/address/${encodeURIComponent(address)}/utxo`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Could not read UTXOs for ${address}`);
  const rows = (await res.json()) as Array<{
    txid: string;
    vout: number;
    value: number;
    status?: { block_height?: number };
  }>;
  return rows.map((r) => ({
    txid: r.txid,
    vout: r.vout,
    scriptPubKey: script,
    amount: r.value / 1e8,
    height: r.status?.block_height ?? 0,
  }));
}

async function feeRateSatPerVb(): Promise<number> {
  try {
    const { fetchChainSnapshot } = await import("./txc.server");
    const snap = await fetchChainSnapshot();
    return snap.halfHourFee && snap.halfHourFee > 0 ? snap.halfHourFee : DEFAULT_FEE_RATE;
  } catch {
    return DEFAULT_FEE_RATE;
  }
}

/* ------------------------------ authorization ----------------------------- */

export type AuthorizedKey = { privateKeyHex: string; address: string; maxAmount: number };

/**
 * The single gate. Loads the seller's TXC authorization and refuses to decrypt
 * anything unless it is live and the amount is inside the cap.
 */
async function openAuthorization(userId: string, amount: number): Promise<AuthorizedKey> {
  // Expired rows are destroyed, not hidden — sweep before reading.
  await supabaseAdmin.rpc("purge_expired_delegations");

  const { data, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("key_ciphertext, trading_address, max_amount, expires_at, revoked_at")
    .eq("user_id", userId)
    .eq("chain", "txc")
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No live TXC authorization — the seller must authorize the trading branch");
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    throw new Error("The TXC authorization has expired");
  }
  if (amount > Number(data.max_amount) + 1e-8) {
    throw new Error(
      `Trade size ${amount} TXC exceeds the authorized cap of ${Number(data.max_amount)} TXC`,
    );
  }

  return {
    privateKeyHex: decryptDelegatedKey(data.key_ciphertext),
    address: data.trading_address,
    maxAmount: Number(data.max_amount),
  };
}

/* -------------------------------- settlement ------------------------------ */

type TradeParties = {
  id: string;
  status: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  maker_id: string | null;
  taker_id: string | null;
};

/** Whoever delivers the TXC leg: the taker when they sold, otherwise the maker. */
function sellerOf(trade: TradeParties): string {
  return trade.side === "sell" ? (trade.taker_id as string) : (trade.maker_id as string);
}

function buyerOf(trade: TradeParties): string {
  return trade.side === "sell" ? (trade.maker_id as string) : (trade.taker_id as string);
}

export type SettleResult = {
  txid: string;
  amount: number;
  to: string;
  feeSats: number;
  inputs: number;
};

/**
 * Deliver the TXC leg of a trade on-chain: seller's authorized branch → buyer's
 * savings address. Idempotent — a leg that already has a release txid is never
 * broadcast twice.
 */
export async function settleTxcLeg(userId: string, tradeId: string): Promise<SettleResult> {
  const { data: trade, error } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, maker_id, taker_id")
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

  const seller = sellerOf(t);
  const buyer = buyerOf(t);
  if (!seller || !buyer) throw new Error("This trade has no counterparty yet");

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, status, release_txid, expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", "txc")
    .maybeSingle();
  if (!leg) throw new Error("TXC escrow leg not found");
  if (leg.release_txid && !leg.release_txid.startsWith("sim-")) {
    throw new Error("The TXC leg has already been broadcast");
  }

  const { data: buyerWallet } = await supabaseAdmin
    .from("wallets")
    .select("txc_address")
    .eq("user_id", buyer)
    .maybeSingle();
  const destination = buyerWallet?.txc_address;
  if (!destination || !isValidTxcAddress(destination)) {
    throw new Error("The buyer has no valid TXC receiving address");
  }

  const amount = Number(leg.expected_amount ?? t.amount);
  const auth = await openAuthorization(seller, amount);

  const [utxos, feeRate] = await Promise.all([loadUtxos(auth.address), feeRateSatPerVb()]);

  const built = buildAndSignTransfer({
    privateKeyHex: auth.privateKeyHex,
    fromAddress: auth.address,
    toAddress: destination,
    amount,
    utxos,
    feeRate,
  });

  const txid = await broadcastRawTx("txc", built.hex);

  await supabaseAdmin
    .from("escrows")
    .update({ status: "released", release_txid: txid, funded_amount: amount, confirmations: 0 })
    .eq("id", leg.id);

  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id,
    actor_id: userId,
    event: "txc_broadcast",
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

/* ------------------------------- confirmations ---------------------------- */

export type WatchResult = {
  tradeId: string;
  leg: "txc";
  txid: string | null;
  confirmations: number | null;
  status: string;
};

/** Poll the node for the TXC leg's confirmation depth and advance the trade. */
export async function watchTxcLeg(userId: string, tradeId: string): Promise<WatchResult> {
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
    .eq("leg", "txc")
    .maybeSingle();
  if (!leg) throw new Error("TXC escrow leg not found");

  const txid = leg.release_txid;
  if (!txid || txid.startsWith("sim-")) {
    return { tradeId, leg: "txc", txid: null, confirmations: null, status: leg.status };
  }

  const confirmations = await fetchTxConfirmations("txc", txid);
  if (confirmations === null) {
    return { tradeId, leg: "txc", txid, confirmations: null, status: leg.status };
  }

  await supabaseAdmin.from("escrows").update({ confirmations }).eq("id", leg.id);
  if (confirmations >= CONFIRMATIONS_REQUIRED) await refreshTradeStatus(tradeId);

  return { tradeId, leg: "txc", txid, confirmations, status: leg.status };
}

/** Trade status is derived from its legs, never set by hand. */
async function refreshTradeStatus(tradeId: string) {
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
};

/** Dry run: everything settleTxcLeg checks, minus decrypting or broadcasting. */
export async function previewTxcSettlement(
  userId: string,
  tradeId: string,
): Promise<SettlementPreview> {
  const feeRate = await feeRateSatPerVb();
  const base: SettlementPreview = {
    ready: false,
    reason: null,
    fromAddress: null,
    toAddress: null,
    balance: null,
    amount: 0,
    feeRate,
    nodeOnline: rpcConfigured("txc"),
  };

  const { data: trade } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, maker_id, taker_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (!trade) return { ...base, reason: "Trade not found" };

  const t = trade as unknown as TradeParties;
  if (t.maker_id !== userId && t.taker_id !== userId) {
    return { ...base, reason: "You are not a party to this trade" };
  }

  const amount = Number(t.amount);
  const seller = sellerOf(t);
  const buyer = buyerOf(t);

  const [{ data: del }, { data: buyerWallet }] = await Promise.all([
    supabaseAdmin
      .from("wallet_delegations")
      .select("trading_address, max_amount, expires_at")
      .eq("user_id", seller ?? "")
      .eq("chain", "txc")
      .is("revoked_at", null)
      .maybeSingle(),
    supabaseAdmin.from("wallets").select("txc_address").eq("user_id", buyer ?? "").maybeSingle(),
  ]);

  const toAddress = buyerWallet?.txc_address ?? null;
  const fromAddress = del?.trading_address ?? null;

  if (!del) {
    return { ...base, amount, toAddress, reason: "The seller has no live TXC authorization" };
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
      reason: `Trade size exceeds the authorized cap of ${Number(del.max_amount)} TXC`,
    };
  }
  if (!toAddress || !isValidTxcAddress(toAddress)) {
    return { ...base, amount, fromAddress, reason: "The buyer has no valid TXC receiving address" };
  }

  let balance: number | null = null;
  try {
    const utxos = await loadUtxos(fromAddress as string);
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
      reason: `The authorized branch holds ${balance.toFixed(8)} TXC, needs ${amount} TXC`,
    };
  }

  return { ...base, ready: true, amount, fromAddress, toAddress, balance };
}
