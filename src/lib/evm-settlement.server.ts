/**
 * Real USDC settlement on EVM chains (Base, Ethereum, BNB Chain).
 *
 * Mirrors the TXC path: authorization → cap/expiry gate → decrypt branch key →
 * build + sign an EIP-1559 ERC-20 transfer → broadcast → watch confirmations.
 * Every gate lives in `openEvmAuthorization`, so no other code path can reach
 * `decryptDelegatedKey`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChain, type ChainId } from "@/lib/chains";
import { decryptDelegatedKey } from "./delegation.server";
import {
  estimateGas,
  fetchEvmTxStatus,
  fetchNonce,
  fetchTokenBalance,
  sendRawTransaction,
  suggestFees,
} from "./evm.server";
import {
  erc20TransferData,
  isValidEvmAddress,
  signEip1559,
  toBaseUnits,
} from "./evm/tx.server";
import { refreshTradeStatus } from "./settlement.server";

const CONFIRMATIONS_REQUIRED = 3;
const GAS_FALLBACK = 90_000n;

type TradeParties = {
  id: string;
  status: string;
  side: "buy" | "sell";
  amount: number;
  price: number;
  maker_id: string | null;
  taker_id: string | null;
};

/** Whoever delivers the USDC leg: the counterparty of the TXC seller. */
function usdcSenderOf(trade: TradeParties): string {
  return trade.side === "sell" ? (trade.maker_id as string) : (trade.taker_id as string);
}

function usdcReceiverOf(trade: TradeParties): string {
  return trade.side === "sell" ? (trade.taker_id as string) : (trade.maker_id as string);
}

type EvmDelegation = {
  chain: ChainId;
  address: string;
  maxAmount: number;
  expiresAt: string;
  ciphertext: string;
};

/** The caller's live USDC authorization on whichever EVM chain they chose. */
async function loadEvmDelegation(userId: string): Promise<EvmDelegation | null> {
  await supabaseAdmin.rpc("purge_expired_delegations");
  const { data, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("chain, asset, trading_address, max_amount, expires_at, key_ciphertext")
    .eq("user_id", userId)
    .eq("asset", "USDC")
    .neq("chain", "txc")
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    chain: data.chain as ChainId,
    address: data.trading_address,
    maxAmount: Number(data.max_amount),
    expiresAt: data.expires_at,
    ciphertext: data.key_ciphertext,
  };
}

async function loadTrade(userId: string, tradeId: string): Promise<TradeParties> {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, maker_id, taker_id")
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

function usdcAmountOf(trade: TradeParties, expected?: number | null): number {
  return Number(expected ?? trade.amount * trade.price);
}

/* --------------------------------- preview -------------------------------- */

export type UsdcPreview = {
  ready: boolean;
  reason: string | null;
  chain: ChainId | null;
  chainName: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  balance: number | null;
  gasBalance: number | null;
  amount: number;
};

export async function previewUsdcSettlement(
  userId: string,
  tradeId: string,
): Promise<UsdcPreview> {
  const t = await loadTrade(userId, tradeId);
  const sender = usdcSenderOf(t);
  const receiver = usdcReceiverOf(t);

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", "usdc")
    .maybeSingle();

  const amount = usdcAmountOf(t, leg?.expected_amount);
  const base: UsdcPreview = {
    ready: false,
    reason: null,
    chain: null,
    chainName: null,
    fromAddress: null,
    toAddress: null,
    balance: null,
    gasBalance: null,
    amount,
  };

  const [del, { data: wallet }] = await Promise.all([
    loadEvmDelegation(sender),
    supabaseAdmin.from("wallets").select("evm_address").eq("user_id", receiver ?? "").maybeSingle(),
  ]);

  const toAddress = wallet?.evm_address ?? null;
  if (!del) return { ...base, toAddress, reason: "No live USDC authorization on any EVM chain" };

  const chain = getChain(del.chain);
  const asset = chain.assets.find((a) => a.symbol === "USDC");
  const ctx = {
    ...base,
    chain: del.chain,
    chainName: chain.name,
    fromAddress: del.address,
    toAddress,
  };

  if (!asset) return { ...ctx, reason: `USDC is not listed on ${chain.name}` };
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    return { ...ctx, reason: "The USDC authorization has expired" };
  }
  if (amount > del.maxAmount + 1e-6) {
    return { ...ctx, reason: `Trade size exceeds the authorized cap of ${del.maxAmount} USDC` };
  }
  if (!toAddress || !isValidEvmAddress(toAddress)) {
    return { ...ctx, reason: "The counterparty has no valid EVM receiving address" };
  }

  const [balance, gasBalance] = await Promise.all([
    fetchTokenBalance(del.chain, asset.contract, del.address, asset.decimals),
    fetchTokenBalance(del.chain, null, del.address, 18),
  ]);

  if (balance === null) return { ...ctx, reason: `${chain.name} RPC is unreachable` };
  if (balance < amount) {
    return {
      ...ctx,
      balance,
      gasBalance,
      reason: `The authorized branch holds ${balance.toFixed(2)} USDC, needs ${amount.toFixed(2)}`,
    };
  }
  if (gasBalance !== null && gasBalance === 0) {
    return {
      ...ctx,
      balance,
      gasBalance,
      reason: `No ${chain.nativeSymbol} on the branch to pay gas`,
    };
  }

  return { ...ctx, ready: true, balance, gasBalance };
}

/* -------------------------------- settlement ------------------------------ */

export type UsdcSettleResult = {
  hash: string;
  chain: ChainId;
  amount: number;
  to: string;
};

export async function settleUsdcLeg(userId: string, tradeId: string): Promise<UsdcSettleResult> {
  const t = await loadTrade(userId, tradeId);
  if (t.status === "settled") throw new Error("This trade is already settled");
  if (t.status === "disputed") throw new Error("This trade is in dispute");

  const sender = usdcSenderOf(t);
  const receiver = usdcReceiverOf(t);
  if (!sender || !receiver) throw new Error("This trade has no counterparty yet");

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, status, release_txid, expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", "usdc")
    .maybeSingle();
  if (!leg) throw new Error("USDC escrow leg not found");
  if (leg.release_txid && !leg.release_txid.startsWith("sim-")) {
    throw new Error("The USDC leg has already been broadcast");
  }

  const del = await loadEvmDelegation(sender);
  if (!del) throw new Error("No live USDC authorization — the sender must authorize the branch");
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    throw new Error("The USDC authorization has expired");
  }

  const chain = getChain(del.chain);
  const asset = chain.assets.find((a) => a.symbol === "USDC");
  if (!asset?.contract) throw new Error(`USDC is not listed on ${chain.name}`);

  const amount = usdcAmountOf(t, leg.expected_amount);
  if (amount > del.maxAmount + 1e-6) {
    throw new Error(`Trade size ${amount} USDC exceeds the authorized cap of ${del.maxAmount}`);
  }

  const { data: wallet } = await supabaseAdmin
    .from("wallets")
    .select("evm_address")
    .eq("user_id", receiver)
    .maybeSingle();
  const to = wallet?.evm_address;
  if (!to || !isValidEvmAddress(to)) {
    throw new Error("The counterparty has no valid EVM receiving address");
  }

  const balance = await fetchTokenBalance(del.chain, asset.contract, del.address, asset.decimals);
  if (balance === null) throw new Error(`${chain.name} RPC is unreachable`);
  if (balance < amount) {
    throw new Error(
      `The authorized branch holds ${balance.toFixed(2)} USDC, needs ${amount.toFixed(2)}`,
    );
  }

  const data = erc20TransferData(to, toBaseUnits(amount, asset.decimals));
  const [nonce, fees, gas] = await Promise.all([
    fetchNonce(del.chain, del.address),
    suggestFees(del.chain),
    estimateGas(del.chain, { from: del.address, to: asset.contract, data }),
  ]);
  if (nonce === null || !fees) throw new Error(`${chain.name} RPC did not return fee data`);

  // Decrypt last: everything above can fail without ever touching key material.
  const privateKeyHex = decryptDelegatedKey(del.ciphertext);

  const signed = signEip1559({
    privateKeyHex,
    chainId: chain.evmChainId as number,
    nonce,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    gasLimit: ((gas ?? GAS_FALLBACK) * 12n) / 10n,
    to: asset.contract,
    value: 0n,
    data,
  });

  if (signed.from.toLowerCase() !== del.address.toLowerCase()) {
    throw new Error("The authorized key does not control the funding address");
  }

  const hash = await sendRawTransaction(del.chain, signed.raw);

  await supabaseAdmin
    .from("escrows")
    .update({ status: "released", release_txid: hash, funded_amount: amount, confirmations: 0 })
    .eq("id", leg.id);

  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id,
    actor_id: userId,
    event: "usdc_broadcast",
    detail: {
      hash,
      chain: del.chain,
      amount,
      to,
      from: del.address,
      simulated: false,
    },
  });

  await refreshTradeStatus(t.id);

  return { hash, chain: del.chain, amount, to };
}

/* ------------------------------- confirmations ---------------------------- */

export type UsdcWatchResult = {
  tradeId: string;
  hash: string | null;
  chain: ChainId | null;
  confirmations: number | null;
  success: boolean | null;
};

export async function watchUsdcLeg(userId: string, tradeId: string): Promise<UsdcWatchResult> {
  const t = await loadTrade(userId, tradeId);

  const { data: leg } = await supabaseAdmin
    .from("escrows")
    .select("id, release_txid, confirmations")
    .eq("trade_id", t.id)
    .eq("leg", "usdc")
    .maybeSingle();
  if (!leg) throw new Error("USDC escrow leg not found");

  const hash = leg.release_txid;
  if (!hash || hash.startsWith("sim-")) {
    return { tradeId, hash: null, chain: null, confirmations: null, success: null };
  }

  const del = await loadEvmDelegation(usdcSenderOf(t));
  const chain = del?.chain ?? "base";
  const status = await fetchEvmTxStatus(chain, hash);

  if (status.confirmations !== null) {
    await supabaseAdmin
      .from("escrows")
      .update({ confirmations: status.confirmations })
      .eq("id", leg.id);
    if (status.confirmations >= CONFIRMATIONS_REQUIRED) await refreshTradeStatus(t.id);
  }

  return { tradeId, hash, chain, confirmations: status.confirmations, success: status.success };
}
