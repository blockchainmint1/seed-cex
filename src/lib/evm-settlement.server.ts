/**
 * Real EVM settlement — USDC and USDT (ERC-20) plus native ZCU on ZeroChill.
 *
 * Mirrors the UTXO path: authorization → cap/expiry gate → decrypt branch key →
 * build + sign an EIP-1559 transaction → broadcast → watch confirmations.
 * Every gate lives in `loadEvmDelegation` + the checks below, so no other code
 * path can reach `decryptDelegatedKey`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChain, getLeg, type ChainId, type LegId } from "@/lib/chains";
import { decryptDelegatedKey } from "./delegation.server";
import {
  estimateGas,
  fetchEvmTxStatus,
  fetchNonce,
  fetchTokenBalance,
  sendRawTransaction,
  suggestFees,
} from "./evm.server";
import { erc20TransferData, isValidEvmAddress, signEip1559, toBaseUnits } from "./evm/tx.server";
import { delivererOf, legAmount, legRole, receiverOf, type TradeShape } from "./leg-roles";
import { refreshTradeStatus } from "./settlement.server";

const CONFIRMATIONS_REQUIRED = 3;
const GAS_FALLBACK = 90_000n;
const NATIVE_GAS_FALLBACK = 21_000n;

type EvmDelegation = {
  chain: ChainId;
  address: string;
  maxAmount: number;
  expiresAt: string;
  ciphertext: string;
};

/** The sender's live authorization for one EVM asset, on any chain that lists it. */
async function loadEvmDelegation(userId: string, leg: LegId): Promise<EvmDelegation | null> {
  await supabaseAdmin.rpc("purge_expired_delegations");
  const def = getLeg(leg);
  const { data, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("chain, asset, trading_address, max_amount, expires_at, key_ciphertext")
    .eq("user_id", userId)
    .eq("asset", def.symbol)
    .in("chain", def.evmChains ?? [])
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

async function loadTrade(userId: string, tradeId: string): Promise<TradeShape> {
  const { data, error } = await supabaseAdmin
    .from("trades")
    .select("id, status, side, amount, price, pair, maker_id, taker_id")
    .eq("id", tradeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Trade not found");
  const t = data as unknown as TradeShape;
  if (t.maker_id !== userId && t.taker_id !== userId) {
    throw new Error("Forbidden: you are not a party to this trade");
  }
  return t;
}

/** Asset definition for a leg on a chain: native coin, or listed ERC-20. */
function assetFor(chainId: ChainId, leg: LegId) {
  const def = getLeg(leg);
  const chain = getChain(chainId);
  if (def.native) {
    return chain.assets.find((a) => a.contract === null && a.symbol === def.symbol) ?? null;
  }
  return chain.assets.find((a) => a.symbol === def.symbol && a.contract) ?? null;
}

/* --------------------------------- preview -------------------------------- */

export type EvmPreview = {
  ready: boolean;
  reason: string | null;
  leg: LegId;
  symbol: string;
  chain: ChainId | null;
  chainName: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  balance: number | null;
  gasBalance: number | null;
  amount: number;
};

export async function previewEvmSettlement(
  userId: string,
  tradeId: string,
  leg: LegId,
): Promise<EvmPreview> {
  const def = getLeg(leg);
  const t = await loadTrade(userId, tradeId);
  const role = legRole(t.pair, leg);
  const sender = delivererOf(t, role);
  const receiver = receiverOf(t, role);

  const { data: escrow } = await supabaseAdmin
    .from("escrows")
    .select("expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", leg)
    .maybeSingle();

  const amount = legAmount(t, role, escrow?.expected_amount);
  const base: EvmPreview = {
    ready: false,
    reason: null,
    leg,
    symbol: def.symbol,
    chain: null,
    chainName: null,
    fromAddress: null,
    toAddress: null,
    balance: null,
    gasBalance: null,
    amount,
  };

  const [del, { data: wallet }] = await Promise.all([
    loadEvmDelegation(sender ?? "", leg),
    supabaseAdmin.from("wallets").select("evm_address").eq("user_id", receiver ?? "").maybeSingle(),
  ]);

  const toAddress = wallet?.evm_address ?? null;
  if (!del) {
    return { ...base, toAddress, reason: `No live ${def.symbol} authorization on any supported chain` };
  }

  const chain = getChain(del.chain);
  const asset = assetFor(del.chain, leg);
  const ctx = {
    ...base,
    chain: del.chain,
    chainName: chain.name,
    fromAddress: del.address,
    toAddress,
  };

  if (!asset) return { ...ctx, reason: `${def.symbol} is not listed on ${chain.name}` };
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    return { ...ctx, reason: `The ${def.symbol} authorization has expired` };
  }
  if (amount > del.maxAmount + 1e-6) {
    return { ...ctx, reason: `Trade size exceeds the authorized cap of ${del.maxAmount} ${def.symbol}` };
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
      reason: `The authorized branch holds ${balance.toFixed(4)} ${def.symbol}, needs ${amount.toFixed(4)}`,
    };
  }
  if (gasBalance !== null && gasBalance === 0) {
    return { ...ctx, balance, gasBalance, reason: `No ${chain.nativeSymbol} on the branch to pay gas` };
  }

  return { ...ctx, ready: true, balance, gasBalance };
}

export async function previewUsdcSettlement(userId: string, tradeId: string) {
  return previewEvmSettlement(userId, tradeId, "usdc");
}

/* -------------------------------- settlement ------------------------------ */

export type EvmSettleResult = {
  hash: string;
  chain: ChainId;
  leg: LegId;
  amount: number;
  to: string;
};

export async function settleEvmLeg(
  userId: string,
  tradeId: string,
  leg: LegId,
): Promise<EvmSettleResult> {
  const def = getLeg(leg);
  const t = await loadTrade(userId, tradeId);
  if (t.status === "settled") throw new Error("This trade is already settled");
  if (t.status === "disputed") throw new Error("This trade is in dispute");

  const role = legRole(t.pair, leg);
  const sender = delivererOf(t, role);
  const receiver = receiverOf(t, role);
  if (!sender || !receiver) throw new Error("This trade has no counterparty yet");

  const { data: escrow } = await supabaseAdmin
    .from("escrows")
    .select("id, status, release_txid, expected_amount")
    .eq("trade_id", t.id)
    .eq("leg", leg)
    .maybeSingle();
  if (!escrow) throw new Error(`${def.symbol} escrow leg not found`);
  if (escrow.release_txid && !escrow.release_txid.startsWith("sim-")) {
    throw new Error(`The ${def.symbol} leg has already been broadcast`);
  }

  const del = await loadEvmDelegation(sender, leg);
  if (!del) throw new Error(`No live ${def.symbol} authorization — the sender must authorize the branch`);
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    throw new Error(`The ${def.symbol} authorization has expired`);
  }

  const chain = getChain(del.chain);
  const asset = assetFor(del.chain, leg);
  if (!asset) throw new Error(`${def.symbol} is not listed on ${chain.name}`);

  const amount = legAmount(t, role, escrow.expected_amount);
  if (amount > del.maxAmount + 1e-6) {
    throw new Error(`Trade size ${amount} ${def.symbol} exceeds the authorized cap of ${del.maxAmount}`);
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
      `The authorized branch holds ${balance.toFixed(4)} ${def.symbol}, needs ${amount.toFixed(4)}`,
    );
  }

  const isNative = asset.contract === null;
  const value = isNative ? toBaseUnits(amount, asset.decimals) : 0n;
  const data = isNative ? "0x" : erc20TransferData(to, toBaseUnits(amount, asset.decimals));
  const target = isNative ? to : (asset.contract as string);

  const [nonce, fees, gas] = await Promise.all([
    fetchNonce(del.chain, del.address),
    suggestFees(del.chain),
    estimateGas(del.chain, {
      from: del.address,
      to: target,
      data,
      value: `0x${value.toString(16)}`,
    }),
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
    gasLimit: ((gas ?? (isNative ? NATIVE_GAS_FALLBACK : GAS_FALLBACK)) * 12n) / 10n,
    to: target,
    value,
    data,
  });

  if (signed.from.toLowerCase() !== del.address.toLowerCase()) {
    throw new Error("The authorized key does not control the funding address");
  }

  const hash = await sendRawTransaction(del.chain, signed.raw);

  await supabaseAdmin
    .from("escrows")
    .update({ status: "released", release_txid: hash, funded_amount: amount, confirmations: 0 })
    .eq("id", escrow.id);

  await supabaseAdmin.from("trade_events").insert({
    trade_id: t.id,
    actor_id: userId,
    event: `${leg}_broadcast`,
    detail: { hash, chain: del.chain, amount, to, from: del.address, simulated: false },
  });

  await refreshTradeStatus(t.id);

  return { hash, chain: del.chain, leg, amount, to };
}

export async function settleUsdcLeg(userId: string, tradeId: string) {
  return settleEvmLeg(userId, tradeId, "usdc");
}

/* ------------------------------- confirmations ---------------------------- */

export type EvmWatchResult = {
  tradeId: string;
  leg: LegId;
  hash: string | null;
  chain: ChainId | null;
  confirmations: number | null;
  success: boolean | null;
};

export async function watchEvmLeg(
  userId: string,
  tradeId: string,
  leg: LegId,
): Promise<EvmWatchResult> {
  const def = getLeg(leg);
  const t = await loadTrade(userId, tradeId);

  const { data: escrow } = await supabaseAdmin
    .from("escrows")
    .select("id, release_txid, confirmations")
    .eq("trade_id", t.id)
    .eq("leg", leg)
    .maybeSingle();
  if (!escrow) throw new Error(`${def.symbol} escrow leg not found`);

  const hash = escrow.release_txid;
  if (!hash || hash.startsWith("sim-")) {
    return { tradeId, leg, hash: null, chain: null, confirmations: null, success: null };
  }

  const sender = delivererOf(t, legRole(t.pair, leg));
  const del = await loadEvmDelegation(sender ?? "", leg);
  const chain = del?.chain ?? (def.evmChains?.[0] as ChainId);
  const status = await fetchEvmTxStatus(chain, hash);

  if (status.confirmations !== null) {
    await supabaseAdmin
      .from("escrows")
      .update({ confirmations: status.confirmations })
      .eq("id", escrow.id);
    if (status.confirmations >= CONFIRMATIONS_REQUIRED) await refreshTradeStatus(t.id);
  }

  return { tradeId, leg, hash, chain, confirmations: status.confirmations, success: status.success };
}

export async function watchUsdcLeg(userId: string, tradeId: string) {
  return watchEvmLeg(userId, tradeId, "usdc");
}
