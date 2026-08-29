/**
 * Withdrawals — the user pulls funds out of their own authorized trading
 * branch to any external address.
 *
 * Same gates as trade settlement, in the same order: purge expired keys →
 * live authorization for this asset → expiry → cap → address validity →
 * branch balance → node/RPC reachability — and only then decrypt the branch
 * key. Nothing here touches the savings branch; it never has a key on the
 * server at all.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getChain,
  getLeg,
  TSD_PROPERTY_ID,
  type ChainId,
  type LegId,
  type UtxoChainId,
} from "@/lib/chains";
import { decryptDelegatedKey } from "./delegation.server";
import {
  broadcastFor,
  feeRateFor,
  isValidUtxoAddress,
  loadUtxosFor,
  p2pkhVersionOf,
  utxoChainOnline,
} from "./utxo/io.server";
import { buildAndSignTransfer, isValidTxcAddress } from "./txc/tx.server";
import { fetchOmniBalance, omniSimpleSend } from "./omni.server";
import {
  estimateGas,
  fetchNonce,
  fetchTokenBalance,
  sendRawTransaction,
  suggestFees,
} from "./evm.server";
import { erc20TransferData, isValidEvmAddress, signEip1559, toBaseUnits } from "./evm/tx.server";

const GAS_FALLBACK = 90_000n;
const NATIVE_GAS_FALLBACK = 21_000n;
/** Whole TXC the branch needs on hand to pay an Omni carrier's miner fee. */
const CARRIER_FEE_TXC = 0.001;

type Delegation = {
  chain: ChainId;
  address: string;
  maxAmount: number;
  expiresAt: string;
  ciphertext: string;
};

/** The caller's live authorization for one asset. Expired rows are destroyed first. */
async function loadDelegation(userId: string, leg: LegId): Promise<Delegation | null> {
  await supabaseAdmin.rpc("purge_expired_delegations");
  const def = getLeg(leg);
  const chains = def.kind === "evm" ? (def.evmChains ?? []) : [def.chain as ChainId];
  const { data, error } = await supabaseAdmin
    .from("wallet_delegations")
    .select("chain, trading_address, max_amount, expires_at, key_ciphertext")
    .eq("user_id", userId)
    .eq("asset", def.symbol)
    .in("chain", chains)
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

function checkWindow(del: Delegation, amount: number, symbol: string) {
  if (new Date(del.expiresAt).getTime() <= Date.now()) {
    throw new Error(`The ${symbol} authorization has expired`);
  }
  if (amount > del.maxAmount + 1e-8) {
    throw new Error(
      `Withdrawal of ${amount} ${symbol} exceeds the authorized cap of ${del.maxAmount} ${symbol}`,
    );
  }
}

export type WithdrawalPreview = {
  ready: boolean;
  reason: string | null;
  leg: LegId;
  symbol: string;
  chain: ChainId | null;
  chainName: string | null;
  fromAddress: string | null;
  balance: number | null;
  amount: number;
};

export type WithdrawalResult = {
  id: string;
  txid: string;
  leg: LegId;
  chain: ChainId;
  amount: number;
  to: string;
};

/** Dry run: every gate a withdrawal checks, minus decrypting or broadcasting. */
export async function previewWithdrawal(
  userId: string,
  leg: LegId,
  to: string,
  amount: number,
): Promise<WithdrawalPreview> {
  const def = getLeg(leg);
  const base: WithdrawalPreview = {
    ready: false,
    reason: null,
    leg,
    symbol: def.symbol,
    chain: null,
    chainName: null,
    fromAddress: null,
    balance: null,
    amount,
  };
  if (!(amount > 0)) return { ...base, reason: "Enter an amount above zero" };

  const del = await loadDelegation(userId, leg);
  if (!del) {
    return { ...base, reason: `No live ${def.symbol} authorization — authorize the branch below first` };
  }
  const chain = getChain(del.chain);
  const ctx = { ...base, chain: del.chain, chainName: chain.name, fromAddress: del.address };

  try {
    checkWindow(del, amount, def.symbol);
  } catch (e) {
    return { ...ctx, reason: e instanceof Error ? e.message : "Authorization check failed" };
  }

  if (def.kind === "utxo") {
    const c = del.chain as UtxoChainId;
    if (!isValidUtxoAddress(c, to)) return { ...ctx, reason: `That is not a valid ${chain.name} address` };
    if (!utxoChainOnline(c)) return { ...ctx, reason: `${chain.name} node is not reachable` };
    let utxos;
    try {
      utxos = await loadUtxosFor(c, del.address);
    } catch {
      return { ...ctx, reason: `Could not read the ${chain.name} branch balance` };
    }
    const balance = utxos.reduce((s, u) => s + u.amount, 0);
    if (balance < amount) {
      return { ...ctx, balance, reason: `The branch holds ${balance.toFixed(8)} ${def.symbol}` };
    }
    return { ...ctx, ready: true, balance };
  }

  if (def.kind === "omni") {
    if (!isValidTxcAddress(to)) return { ...ctx, reason: "That is not a valid TEXITcoin address" };
    const [omni, utxos] = await Promise.all([
      fetchOmniBalance(del.address),
      loadUtxosFor("txc", del.address).catch(() => []),
    ]);
    if (!omni.online) return { ...ctx, reason: "The TEXITcoin node is not reachable" };
    const feeBalance = utxos.reduce((s, u) => s + u.amount, 0);
    if (omni.balance < amount) {
      return { ...ctx, balance: omni.balance, reason: `The branch holds ${omni.balance.toFixed(2)} TSD` };
    }
    if (feeBalance < CARRIER_FEE_TXC) {
      return {
        ...ctx,
        balance: omni.balance,
        reason: `The branch needs about ${CARRIER_FEE_TXC} TXC for the Omni carrier fee`,
      };
    }
    return { ...ctx, ready: true, balance: omni.balance };
  }

  // evm
  if (!isValidEvmAddress(to)) return { ...ctx, reason: `That is not a valid ${chain.name} address` };
  const asset = chain.assets.find((a) =>
    def.native ? a.contract === null && a.symbol === def.symbol : a.symbol === def.symbol && a.contract,
  );
  if (!asset) return { ...ctx, reason: `${def.symbol} is not listed on ${chain.name}` };
  const balance = await fetchTokenBalance(del.chain, asset.contract, del.address, asset.decimals);
  if (balance === null) return { ...ctx, reason: `${chain.name} RPC is unreachable` };
  if (balance < amount) {
    return { ...ctx, balance, reason: `The branch holds ${balance.toFixed(4)} ${def.symbol}` };
  }
  return { ...ctx, ready: true, balance };
}

/** Build, sign, broadcast, and record a withdrawal from the authorized branch. */
export async function withdrawAsset(
  userId: string,
  leg: LegId,
  to: string,
  amount: number,
): Promise<WithdrawalResult> {
  const def = getLeg(leg);
  if (!(amount > 0)) throw new Error("Amount must be above zero");

  // Run the full preview first — one gate definition, no drift.
  const preview = await previewWithdrawal(userId, leg, to, amount);
  if (!preview.ready) throw new Error(preview.reason ?? "Withdrawal is not ready");
  const del = (await loadDelegation(userId, leg)) as Delegation;

  let txid: string;
  if (def.kind === "utxo") {
    const c = del.chain as UtxoChainId;
    const [utxos, feeRate] = await Promise.all([loadUtxosFor(c, del.address), feeRateFor(c)]);
    // Decrypt last: every check above can fail without touching key material.
    const built = buildAndSignTransfer({
      privateKeyHex: decryptDelegatedKey(del.ciphertext),
      fromAddress: del.address,
      toAddress: to,
      amount,
      utxos,
      feeRate,
      p2pkhVersion: p2pkhVersionOf(c),
      symbol: def.symbol,
    });
    txid = await broadcastFor(c, built.hex);
  } else if (def.kind === "omni") {
    const sent = await omniSimpleSend({
      privateKeyHex: decryptDelegatedKey(del.ciphertext),
      fromAddress: del.address,
      toAddress: to,
      amount,
      propertyId: TSD_PROPERTY_ID,
    });
    txid = sent.txid;
  } else {
    const chain = getChain(del.chain);
    const asset = chain.assets.find((a) =>
      def.native ? a.contract === null && a.symbol === def.symbol : a.symbol === def.symbol && a.contract,
    );
    if (!asset) throw new Error(`${def.symbol} is not listed on ${chain.name}`);
    const isNative = asset.contract === null;
    const value = isNative ? toBaseUnits(amount, asset.decimals) : 0n;
    const data = isNative ? "0x" : erc20TransferData(to, toBaseUnits(amount, asset.decimals));
    const target = isNative ? to : (asset.contract as string);

    const [nonce, fees, gas] = await Promise.all([
      fetchNonce(del.chain, del.address),
      suggestFees(del.chain),
      estimateGas(del.chain, { from: del.address, to: target, data, value: `0x${value.toString(16)}` }),
    ]);
    if (nonce === null || !fees) throw new Error(`${chain.name} RPC did not return fee data`);

    const signed = signEip1559({
      privateKeyHex: decryptDelegatedKey(del.ciphertext),
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
    txid = await sendRawTransaction(del.chain, signed.raw);
  }

  const { data: row, error } = await supabaseAdmin
    .from("withdrawals")
    .insert({
      user_id: userId,
      leg,
      chain: del.chain,
      asset: def.symbol,
      amount,
      from_address: del.address,
      to_address: to,
      txid,
      status: "broadcast",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { id: row.id as string, txid, leg, chain: del.chain, amount, to };
}

export type WithdrawalRow = {
  id: string;
  leg: LegId;
  chain: ChainId;
  asset: string;
  amount: number;
  to_address: string;
  txid: string;
  status: string;
  created_at: string;
};

export async function listWithdrawals(userId: string): Promise<WithdrawalRow[]> {
  const { data, error } = await supabaseAdmin
    .from("withdrawals")
    .select("id, leg, chain, asset, amount, to_address, txid, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);
  return (data ?? []) as WithdrawalRow[];
}
