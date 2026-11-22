/**
 * Reading and sending from a member's HME trading pocket (instant-access link).
 *
 * Nothing here decides *whether* a send may happen — that's the approval
 * (approvals.server.ts). This file only knows where a member's coins are,
 * what they hold, and how to sign one transfer with the pocket key.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getChain, getLeg, isOmniLeg, omniLegAsset, type ChainId, type LegId, type UtxoChainId } from "@/lib/chains";
import { pocketForLeg, pocketSendBlocker, type PocketId, type PocketSendUse } from "./rules";

export type PocketLink = {
  id: string;
  mode: string;
  account: number;
  hasKey: boolean;
  ciphertext: string | null;
  addresses: Partial<Record<string, string>>;
};

/** The member's one active HME link, with derived pocket addresses. Never returned to a browser. */
export async function activeLink(userId: string): Promise<PocketLink | null> {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const l = await loadLink(userId);
  if (!l) return null;
  return { id: l.id, mode: l.mode, account: l.account, hasKey: l.hasKey, ciphertext: l.ciphertext, addresses: l.addresses };
}

/** Can this member send this leg from their pocket? Returns the link + address, or a plain reason.
 *  use "trade" = exchange order-book legs (Telegram tap only, no two-factor-before-link rule). */
export async function pocketSender(userId: string, leg: LegId, use: PocketSendUse = "send"): Promise<
  { ok: true; link: PocketLink; pocket: PocketId; address: string } | { ok: false; reason: string; link: PocketLink | null }
> {
  const pocket = pocketForLeg(leg);
  const link = await activeLink(userId);
  const address = link?.addresses[pocket] ?? null;
  let twoFactor: "ready" | "needs_2fa" | "needs_relink" | null = null;
  if (link && use !== "trade") {
    const { withdrawLinkStateFor } = await import("@/lib/two-factor.server");
    twoFactor = await withdrawLinkStateFor(userId, link.id).catch(() => null);
  }
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("telegram_verified, telegram_chat_id")
    .eq("id", userId)
    .maybeSingle();
  const reason = pocketSendBlocker(
    {
      link: link ? { mode: link.mode, hasKey: link.hasKey, pocketAddress: address } : null,
      twoFactor,
      telegramVerified: prof?.telegram_verified === true && Boolean(prof?.telegram_chat_id),
    },
    pocket,
    use,
  );
  if (reason || !link || !address) return { ok: false, reason: reason ?? "No pocket address", link };
  return { ok: true, link, pocket, address };
}

const LEGACY_COLUMN: Record<PocketId, "txc_address" | "isk_address" | "ltc_address" | "evm_address"> = {
  TXC: "txc_address",
  ISK: "isk_address",
  LTC: "ltc_address",
  EVM: "evm_address",
};

/**
 * Where a member receives a leg: their HME pocket when linked (any mode — receiving
 * needs no key), otherwise the address saved on their old wallet record.
 */
export async function receiveAddress(userId: string, leg: LegId): Promise<string | null> {
  const pocket = pocketForLeg(leg);
  const link = await activeLink(userId).catch(() => null);
  const fromLink = link?.addresses[pocket];
  if (fromLink) return fromLink;
  const col = LEGACY_COLUMN[pocket];
  const { data } = await supabaseAdmin.from("wallets").select(col).eq("user_id", userId).maybeSingle();
  return ((data as Record<string, string | null> | null)?.[col] ?? null) || null;
}

/** Is `to` a well-formed address for this leg's network? */
export async function validDestination(leg: LegId, to: string): Promise<boolean> {
  const def = getLeg(leg);
  if (def.kind === "evm") {
    const { isValidEvmAddress } = await import("@/lib/evm/tx.server");
    return isValidEvmAddress(to);
  }
  const { isValidUtxoAddress } = await import("@/lib/utxo/io.server");
  return isValidUtxoAddress((def.chain ?? "txc") as UtxoChainId, to);
}

function evmAssetFor(chainId: ChainId, leg: LegId) {
  const def = getLeg(leg);
  const chain = getChain(chainId);
  if (def.native) return chain.assets.find((a) => a.contract === null && a.symbol === def.symbol) ?? null;
  return chain.assets.find((a) => a.symbol === def.symbol && a.contract) ?? null;
}

export type PocketBalance = {
  /** Spendable amount of the leg's coin (largest single network for EVM coins). */
  balance: number | null;
  /** Coin that pays the network fee (TXC for TSD/wrapped, ETH/BNB/PLS for EVM tokens). */
  feeBalance: number | null;
  /** EVM only: the network the balance sits on. */
  chain: ChainId | null;
  reason: string | null;
};

/** TSD/wrapped coins need a little TXC on the same address for the Omni carrier fee. */
export const OMNI_CARRIER_FEE_TXC = 0.001;

/**
 * Live balance of one leg at a pocket address. `need` picks the EVM network that can cover it.
 * `balanceOnly` skips the TSD/wrapped-coin TXC fee read (feeBalance comes back null) for
 * callers that only show or reserve the coin itself; anything that sends must leave it off.
 * `display` reads TXC/ISK coins through loadDisplayUtxosFor (explorer index first) — for
 * balances shown on screen only, never for reserving, settling or sending.
 */
export async function pocketLegBalance(address: string, leg: LegId, need = 0, opts: { balanceOnly?: boolean; display?: boolean } = {}): Promise<PocketBalance> {
  const def = getLeg(leg);
  try {
    if (isOmniLeg(leg)) {
      const { fetchOmniBalance } = await import("@/lib/omni.server");
      const { loadUtxosFor } = await import("@/lib/utxo/io.server");
      const { propertyId } = omniLegAsset(leg);
      const [omni, utxos] = await Promise.all([
        fetchOmniBalance(address, propertyId),
        opts.balanceOnly ? Promise.resolve(null) : loadUtxosFor("txc", address).catch(() => []),
      ]);
      if (!omni.online) return { balance: null, feeBalance: null, chain: null, reason: "The TEXITcoin node is not reachable" };
      return { balance: omni.balance, feeBalance: utxos ? utxos.reduce((s, u) => s + u.amount, 0) : null, chain: null, reason: null };
    }
    if (def.kind === "utxo") {
      const { loadUtxosFor, loadDisplayUtxosFor } = await import("@/lib/utxo/io.server");
      const utxos = opts.display ? await loadDisplayUtxosFor(def.chain as UtxoChainId, address) : await loadUtxosFor(def.chain as UtxoChainId, address, { atLeast: need });
      const bal = utxos.reduce((s, u) => s + u.amount, 0);
      return { balance: bal, feeBalance: bal, chain: null, reason: null };
    }
    const { fetchTokenBalance } = await import("@/lib/evm.server");
    let best: PocketBalance = { balance: null, feeBalance: null, chain: null, reason: `Couldn't read ${def.symbol}` };
    for (const c of (def.evmChains ?? []) as ChainId[]) {
      const asset = evmAssetFor(c, leg);
      if (!asset) continue;
      const [bal, gas] = await Promise.all([
        fetchTokenBalance(c, asset.contract, address, asset.decimals),
        asset.contract ? fetchTokenBalance(c, null, address, 18) : Promise.resolve(null),
      ]);
      if (bal == null) continue;
      const cur: PocketBalance = { balance: bal, feeBalance: asset.contract ? gas : bal, chain: c, reason: null };
      if (best.balance == null || bal > best.balance) best = cur;
      if (need > 0 && bal >= need) return cur;
    }
    return best;
  } catch (e) {
    return { balance: null, feeBalance: null, chain: null, reason: e instanceof Error ? e.message : "Couldn't read the pocket" };
  }
}

/** Can the pocket cover `amount` plus its network fee? Plain reason, or null. */
export function coverProblem(leg: LegId, b: PocketBalance, amount: number): string | null {
  const sym = getLeg(leg).symbol;
  if (b.balance == null) return b.reason ?? `Couldn't read your ${sym} balance`;
  if (b.balance + 1e-8 < amount) return `Your trading pocket holds ${b.balance} ${sym}, needs ${amount}`;
  if (isOmniLeg(leg) && (b.feeBalance ?? 0) < OMNI_CARRIER_FEE_TXC) {
    return `Your trading pocket needs about ${OMNI_CARRIER_FEE_TXC} TXC to pay the network fee for sending ${sym}`;
  }
  if (getLeg(leg).kind === "evm" && b.feeBalance != null && b.feeBalance <= 0) {
    return `Your trading pocket has no ${b.chain ? getChain(b.chain).nativeSymbol : "gas"} for the network fee`;
  }
  return null;
}

/** raw = the signed transaction (rebroadcast if the network drops it); nonce = EVM only. */
export type PocketSendResult = { txid: string; chain: string; from: string; raw?: string; nonce?: number };

/**
 * Sign and broadcast ONE transfer from the pocket. Callers must already have spent a
 * matching approval (approvals.server.ts → spendApproval). The key is opened last and wiped.
 */
export async function sendFromPocket(p: {
  link: PocketLink;
  leg: LegId;
  from: string;
  to: string;
  amount: number;
  /** Called with the txid before broadcast where the network allows it. */
  record?: (txid: string) => Promise<void>;
}): Promise<PocketSendResult> {
  const def = getLeg(p.leg);
  const pocket = pocketForLeg(p.leg);
  if (!(await validDestination(p.leg, p.to))) throw new Error(`Not a valid ${def.symbol} address: ${p.to}`);
  const { withPocketKey } = await import("@/lib/xchain/send.server");
  const { bytesToHex } = await import("@noble/hashes/utils.js");

  if (isOmniLeg(p.leg)) {
    const { omniSimpleSend } = await import("@/lib/omni.server");
    const { propertyId } = omniLegAsset(p.leg);
    const sent = await withPocketKey(p.link.ciphertext, pocket, p.from, (priv) =>
      omniSimpleSend({ privateKeyHex: bytesToHex(priv), fromAddress: p.from, toAddress: p.to, amount: p.amount, propertyId, beforeBroadcast: p.record }),
    );
    return { txid: sent.txid, chain: "txc", from: p.from, raw: sent.hex };
  }

  if (def.kind === "utxo") {
    const chain = def.chain as UtxoChainId;
    const { loadUtxosFor, feeRateFor, broadcastFor, p2pkhVersionOf } = await import("@/lib/utxo/io.server");
    const { buildAndSignTransfer } = await import("@/lib/txc/tx.server");
    const [utxos, feeRate] = await Promise.all([loadUtxosFor(chain, p.from, { atLeast: p.amount }), feeRateFor(chain)]);
    const built = await withPocketKey(p.link.ciphertext, pocket, p.from, async (priv) =>
      buildAndSignTransfer({
        privateKeyHex: bytesToHex(priv), fromAddress: p.from, toAddress: p.to, amount: p.amount,
        utxos, feeRate, p2pkhVersion: p2pkhVersionOf(chain), symbol: def.symbol,
      }),
    );
    if (p.record) await p.record(built.txid);
    const txid = await broadcastFor(chain, built.hex);
    return { txid: txid || built.txid, chain, from: p.from, raw: built.hex };
  }

  // EVM: pick the network that holds enough, then sign an EIP-1559 transfer.
  const bal = await pocketLegBalance(p.from, p.leg, p.amount);
  const problem = coverProblem(p.leg, bal, p.amount);
  if (problem || !bal.chain) throw new Error(problem ?? `No network holds enough ${def.symbol}`);
  const chainId = bal.chain;
  const chain = getChain(chainId);
  const asset = evmAssetFor(chainId, p.leg);
  if (!asset) throw new Error(`${def.symbol} is not listed on ${chain.name}`);
  const { estimateGas, fetchNonce, sendRawTransaction, suggestFees } = await import("@/lib/evm.server");
  const { erc20TransferData, signEip1559, toBaseUnits } = await import("@/lib/evm/tx.server");
  const isNative = asset.contract === null;
  const units = toBaseUnits(p.amount, asset.decimals);
  const value = isNative ? units : 0n;
  const data = isNative ? "0x" : erc20TransferData(p.to, units);
  const target = isNative ? p.to : (asset.contract as string);
  const [nonce, fees, gas] = await Promise.all([
    fetchNonce(chainId, p.from),
    suggestFees(chainId),
    estimateGas(chainId, { from: p.from, to: target, data, value: `0x${value.toString(16)}` }),
  ]);
  if (nonce === null || !fees) throw new Error(`${chain.name} didn't return fee data. Nothing was sent.`);
  const gasLimit = ((gas ?? (isNative ? 21_000n : 90_000n)) * 12n) / 10n;
  // Worst-case network fee, in the chain's own coin. Refuse before signing if the pocket can't pay it.
  const maxFee = Number(gasLimit * fees.maxFeePerGas) / 1e18;
  const feeHave = isNative ? (bal.balance ?? 0) - p.amount : (bal.feeBalance ?? 0);
  if (feeHave + 1e-12 < maxFee) {
    throw new Error(`Your trading pocket needs about ${maxFee.toPrecision(3)} ${chain.nativeSymbol} on ${chain.name} for the network fee. Nothing was sent.`);
  }
  const signed = await withPocketKey(p.link.ciphertext, "EVM", p.from, async (priv) =>
    signEip1559({
      privateKeyHex: bytesToHex(priv), chainId: chain.evmChainId as number, nonce,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      gasLimit, to: target, value, data,
    }),
  );
  if (signed.from.toLowerCase() !== p.from.toLowerCase()) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");
  if (p.record) await p.record(signed.hash);
  await sendRawTransaction(chainId, signed.raw);
  return { txid: signed.hash, chain: chainId, from: p.from, raw: signed.raw, nonce };
}
