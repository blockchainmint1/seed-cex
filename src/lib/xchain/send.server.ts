/**
 * Send a THORChain or Maya swap from a member's instant-access HME trading pocket.
 *
 * Order matters, and every step fails closed:
 *  1. Re-quote on the server (never trust the browser's quote) and require every
 *     pre-send check: memo pays exactly the destination/coin, price limit,
 *     vault (and EVM router) confirmed by 2 independent servers, fresh quote.
 *  2. The fresh quote may be at most 1% worse than the one the member confirmed.
 *  3. reserve_swap_send (database): one send per pocket at a time, per-swap and
 *     daily dollar caps — before any key is decrypted.
 *  4. Decrypt the pocket key, check it controls the funding address, build and
 *     sign locally, store the txid, then broadcast. The key is wiped after.
 */
import { maybeBroadcast } from "@/lib/broadcast-rules";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { bech32 } from "@scure/base";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptDelegatedKey } from "@/lib/delegation.server";
import type { PocketCoin } from "@/lib/pockets/coins";
import { pocketReceiveAddress, receivePrivateKey } from "@/lib/pockets/derive";
import { addressFor, solAddress } from "@/lib/pockets/encode";
import { PROTOCOL_LABEL, swapCoin, type Protocol, type SwapCoin } from "./assets";
import { destinationValid, toBaseUnits } from "./safety";
import { allowanceData, approveData, DECIMALS_CALL, depositWithExpiryData, NATIVE_ASSET, roundTo1e8Units, tokenContract, toTokenUnits } from "./evm-router";
import { isOwnPocketDestination, outsideSwapProblem, MIN_SEND_QUOTE_SECONDS, requoteOk, SEND_PROTOCOL, SEND_PROTOCOLS, sendBlocker, sendSource, swapLimitsFor, swapProgress, thorTxId, type SendKind, type ThorTxStatus } from "./send-rules";
import type { SendPlan } from "./router.server";

export type SwapLink = { id: string; mode: string; account: number; hasKey: boolean; pockets: PocketCoin[]; addresses: Partial<Record<PocketCoin, string>> };

export async function loadLink(userId: string): Promise<(SwapLink & { xpubs: Record<string, string>; ciphertext: string | null }) | null> {
  const { data, error } = await supabaseAdmin
    .from("hme_links")
    .select("id, mode, account, xpubs, key_ciphertext")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const xpubs = (data.xpubs ?? {}) as Record<string, string>;
  const addresses: Partial<Record<PocketCoin, string>> = {};
  for (const [coin, pub] of Object.entries(xpubs)) {
    try { addresses[coin as PocketCoin] = pocketReceiveAddress(coin as PocketCoin, pub); } catch { /* skip unreadable */ }
  }
  return {
    id: data.id, mode: data.mode, account: data.account, hasKey: Boolean(data.key_ciphertext),
    pockets: Object.keys(addresses) as PocketCoin[], addresses, xpubs, ciphertext: data.key_ciphertext,
  };
}

/** What the Swap page needs to offer sending: no keys, no vaults. */
export async function swapSendContext(userId: string) {
  const link = await loadLink(userId);
  if (!link) return { link: null };
  const { xpubs: _x, ciphertext: _c, ...safe } = link;
  return { link: safe };
}

// ---------- helpers ----------

const ETH = "ethereum" as const;
const hexQty = (n: bigint) => `0x${n.toString(16)}`;

async function ethCall(to: string, data: string): Promise<bigint> {
  const { evmRpc } = await import("@/lib/evm.server");
  const r = await evmRpc<string>(ETH, "eth_call", [{ to, data }, "latest"]);
  if (!r || r === "0x") throw new Error("Ethereum node gave no answer");
  return BigInt(r);
}

async function tokenDecimals(token: string): Promise<number> {
  const d = Number(await ethCall(token, DECIMALS_CALL));
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error("Token decimals unreadable");
  return d;
}

function ltcScript(address: string): Uint8Array | undefined {
  if (!/^ltc1/i.test(address)) return undefined; // base58 L…/M… decoded by the LTC builder itself
  const dec = bech32.decode(address.toLowerCase() as `ltc1${string}`);
  if (dec.prefix !== "ltc" || dec.words[0] !== 0) throw new Error("Unsupported Litecoin vault address");
  const prog = Uint8Array.from(bech32.fromWords(dec.words.slice(1)));
  if (prog.length !== 20 && prog.length !== 32) throw new Error("Unsupported Litecoin vault address");
  return Uint8Array.from([0x00, prog.length, ...prog]);
}

/** Native coins with fewer than 8 decimals need the amount rounded before quoting. */
const NATIVE_DECIMALS: Partial<Record<SendKind, number>> = { xrp: 6, trx: 6 };

function addressOfKey(pocket: PocketCoin, priv: Uint8Array): string {
  if (pocket === "SOL") return solAddress(ed25519.getPublicKey(priv));
  return addressFor(pocket, secp256k1.getPublicKey(priv, true));
}

function cleanDbError(msg: string): string {
  return msg.replace(/^.*?ERROR:\s*/i, "").trim();
}

type Signed = { txid: string; approveTxid?: string };
type Recorder = (field: "txid" | "approve_txid", value: string) => Promise<void>;

async function signAndBroadcast(
  kind: SendKind, priv: Uint8Array, from: SwapCoin, fromAddress: string, amount: bigint, plan: SendPlan, record: Recorder,
): Promise<Signed> {
  switch (kind) {
    case "btc": {
      const { fetchBtcFeeRate, fetchBtcUtxos, broadcastBtcTx } = await import("@/lib/btc/io.server");
      const { buildAndSignBtcTransfer } = await import("@/lib/btc/tx.server");
      const [utxos, feeRate] = await Promise.all([fetchBtcUtxos(fromAddress), fetchBtcFeeRate()]);
      const tx = buildAndSignBtcTransfer({ privateKeyHex: bytesToHex(priv), fromAddress, toAddress: plan.vault, amount: Number(amount) / 1e8, utxos, feeRate, memo: plan.memo });
      await record("txid", tx.txid);
      await broadcastBtcTx(tx.hex);
      return { txid: tx.txid };
    }
    case "ltc": {
      const { loadUtxosFor, feeRateFor, broadcastFor } = await import("@/lib/utxo/io.server");
      const { buildAndSignTransfer } = await import("@/lib/txc/tx.server");
      const [utxos, feeRate] = await Promise.all([loadUtxosFor("ltc", fromAddress), feeRateFor("ltc")]);
      const tx = buildAndSignTransfer({
        privateKeyHex: bytesToHex(priv), fromAddress, toAddress: plan.vault, toScript: ltcScript(plan.vault),
        amount: Number(amount) / 1e8, utxos, feeRate, p2pkhVersion: 48, symbol: "LTC", memo: plan.memo,
      });
      await record("txid", tx.txid);
      await broadcastFor("ltc", tx.hex);
      return { txid: tx.txid };
    }
    case "doge":
    case "bch": {
      const fam = kind === "doge" ? "DOGE" : "BCH";
      const { bookUtxos, bookFeeRate, bookBroadcast } = await import("./send-io.server");
      const { buildAndSignUtxoSend } = await import("@/lib/pockets/utxo-sign.server");
      const [utxos, feeRate] = await Promise.all([bookUtxos(fam, fromAddress), bookFeeRate(fam)]);
      const tx = buildAndSignUtxoSend({ family: fam, privateKey: priv, utxos, to: plan.vault, amount, feeRate, memo: plan.memo });
      await record("txid", tx.txid);
      await bookBroadcast(fam, tx.hex);
      return { txid: tx.txid };
    }
    case "xrp": {
      const { xrpAccount, xrpFeeDrops, xrpReserveDrops, xrpSubmit } = await import("./send-io.server");
      const { signXrpPayment } = await import("@/lib/pockets/xrp-sign.server");
      const drops = amount / 100n;
      const [acct, fee] = await Promise.all([xrpAccount(fromAddress), xrpFeeDrops()]);
      const reserve = await xrpReserveDrops(acct.ownerCount);
      if (acct.balanceDrops < drops + fee + reserve) throw new Error(`Not enough XRP: the XRP Ledger keeps ${Number(reserve) / 1e6} XRP locked as a reserve.`);
      const tx = signXrpPayment({ privateKey: priv, to: plan.vault, drops, feeDrops: fee, sequence: acct.sequence, lastLedgerSequence: acct.currentLedger + 20, memo: plan.memo });
      await record("txid", tx.hash);
      await xrpSubmit(tx.hex);
      return { txid: tx.hash };
    }
    case "trx": {
      const { tronRefBlock, tronBroadcast, tronSun } = await import("./send-io.server");
      const { signTronTransfer } = await import("@/lib/pockets/tron-sign.server");
      const sun = amount / 100n;
      const [bal, ref] = await Promise.all([tronSun(fromAddress), tronRefBlock()]);
      if (bal < sun + 2_000_000n) throw new Error("Not enough TRX: keep about 2 TRX for TRON's network and memo fees.");
      const tx = signTronTransfer({ privateKey: priv, to: plan.vault, sun, refBlockNum: ref.number, refBlockId: ref.id, timestamp: Date.now(), memo: plan.memo });
      await record("txid", tx.txid);
      await tronBroadcast(tx.hex);
      return { txid: tx.txid };
    }
    case "sol": {
      const { solBlockhash, solLamports, solSend } = await import("./send-io.server");
      const { signSolTransfer } = await import("@/lib/pockets/sol-sign.server");
      const lamports = amount * 10n;
      const [bal, blockhash] = await Promise.all([solLamports(fromAddress), solBlockhash()]);
      if (bal < lamports + 2_005_000n) throw new Error("Not enough SOL: keep about 0.002 SOL for fees and Solana's account minimum.");
      const tx = signSolTransfer({ privateKey: priv, to: plan.vault, lamports, recentBlockhash: blockhash, memo: plan.memo });
      await record("txid", tx.signature);
      await solSend(tx.base64);
      return { txid: tx.signature };
    }
    case "evm":
    case "erc20": {
      if (!plan.router) throw new Error("No confirmed router for Ethereum");
      const { estimateGas, fetchNonce, sendRawTransaction, suggestFees, evmRpc } = await import("@/lib/evm.server");
      const { signEip1559 } = await import("@/lib/evm/tx.server");
      const keyHex = bytesToHex(priv);
      const [nonce0, fees, ethBalHex] = await Promise.all([
        fetchNonce(ETH, fromAddress), suggestFees(ETH), evmRpc<string>(ETH, "eth_getBalance", [fromAddress, "latest"]),
      ]);
      if (nonce0 == null || !fees || !ethBalHex) throw new Error("Ethereum node unreachable");
      const ethBal = BigInt(ethBalHex);
      const expiry = BigInt(plan.expiry);
      const sign = (nonce: number, to: string, value: bigint, data: string, gasLimit: bigint) =>
        signEip1559({ privateKeyHex: keyHex, chainId: 1, nonce, ...fees, gasLimit, to, value, data });

      if (kind === "evm") {
        const value = amount * 10n ** 10n;
        const data = depositWithExpiryData(plan.vault, NATIVE_ASSET, value, plan.memo, expiry);
        const est = await estimateGas(ETH, { from: fromAddress, to: plan.router, data, value: hexQty(value) });
        const gas = est ? (est * 12n) / 10n : 120_000n;
        if (ethBal < value + gas * fees.maxFeePerGas) throw new Error("Not enough ETH for the amount plus the Ethereum network fee.");
        const tx = sign(nonce0, plan.router, value, data, gas);
        await record("txid", tx.hash);
        await sendRawTransaction(ETH, tx.raw);
        return { txid: tx.hash };
      }

      const token = tokenContract(from.asset)!;
      const decimals = await tokenDecimals(token);
      const units = toTokenUnits(amount, decimals);
      const tokenBal = await ethCall(token, `0x70a08231${fromAddress.slice(2).toLowerCase().padStart(64, "0")}`);
      if (tokenBal < units) throw new Error(`Not enough ${from.symbol} in your pocket.`);
      const allowance = await ethCall(token, allowanceData(fromAddress, plan.router));
      const steps: Array<{ data: string; to: string; gas: bigint; approve: boolean }> = [];
      if (allowance < units) {
        // USDT-style tokens refuse to change a non-zero allowance; reset it first.
        if (allowance > 0n) steps.push({ to: token, data: approveData(plan.router, 0n), gas: 80_000n, approve: true });
        steps.push({ to: token, data: approveData(plan.router, units), gas: 80_000n, approve: true });
      }
      const deposit = depositWithExpiryData(plan.vault, token, units, plan.memo, expiry);
      // Gas can't be estimated before the approval is mined, so use a fixed, generous limit then.
      const depGas = steps.length ? 200_000n : ((await estimateGas(ETH, { from: fromAddress, to: plan.router, data: deposit })) ?? 166_667n) * 12n / 10n;
      steps.push({ to: plan.router, data: deposit, gas: depGas, approve: false });
      const totalGas = steps.reduce((s, x) => s + x.gas, 0n);
      if (ethBal < totalGas * fees.maxFeePerGas) throw new Error("Not enough ETH in your pocket to pay the Ethereum network fee.");
      let approveTxid: string | undefined;
      let nonce = nonce0;
      for (const st of steps) {
        const tx = sign(nonce++, st.to, 0n, st.data, st.gas);
        await record(st.approve ? "approve_txid" : "txid", tx.hash);
        await sendRawTransaction(ETH, tx.raw);
        if (st.approve) approveTxid = tx.hash;
        else return { txid: tx.hash, approveTxid };
      }
      throw new Error("unreachable");
    }
  }
}

/** The protocol can't take this swap right now (no route, paused, a pre-send check failed). Nothing was reserved or sent. */
export class RouteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouteUnavailableError";
  }
}

/** The fresh quote is worse than allowed; carries the new expected output so a route can ask the member. */
export class PriceMovedError extends Error {
  constructor(public freshOut: number, message: string) {
    super(message);
    this.name = "PriceMovedError";
  }
}

/** Telegram (if they opted in) plus an always-sent security email: coins left their pocket. */
export async function tellMember(userId: string, telegram: string, emailLines: string[]) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    const { emailAccountChange } = await import("@/lib/email/send.server");
    await Promise.allSettled([
      notifyUser(userId, "notify_settlement", telegram),
      emailAccountChange(userId, "Cross-chain swap", emailLines, "revoke your trading pocket in HME Wallet right away, then contact support@honest.money."),
    ]);
  } catch (e) {
    console.error("swap alert failed", e);
  }
}

export type SendSwapInput = { from: string; to: string; amount: string; destination: string; shownOut: number; protocol?: Protocol };

/**
 * Decrypt one pocket key, prove it controls `address`, run `fn`, then wipe it.
 * Used by TSD routes for the TSD send and the USDC hand-off to TSD Bridge.
 */
export async function withPocketKey<T>(ciphertext: string | null, pocket: PocketCoin, address: string, fn: (priv: Uint8Array) => Promise<T>): Promise<T> {
  if (!ciphertext) throw new Error("Seeds doesn't hold this pocket's key.");
  let priv: Uint8Array | null = null;
  try {
    const keys = JSON.parse(decryptDelegatedKey(ciphertext)) as Record<string, string>;
    const xprv = keys[pocket];
    for (const k of Object.keys(keys)) keys[k] = "";
    if (!xprv) throw new Error(`Seeds doesn't hold the ${pocket} key for this pocket.`);
    priv = receivePrivateKey(pocket, xprv);
    if (addressOfKey(pocket, priv) !== address) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");
    return await fn(priv);
  } finally {
    priv?.fill(0);
  }
}

/** A TSD route's THORChain leg: the route was gated when it started; the leg allows more drift (it runs later). */
export type RouteLegOptions = { routeId: string; tolerance: number };

/** Member-started sends only: the session's claims (fresh two-factor) and, on the second call, the Telegram approval. */
export type MemberSendOptions = { claims: unknown; approvalId?: string };

/** Returned instead of sending when a swap to an outside address is waiting for the member's Telegram tap. */
export type SwapNeedsApproval = { needsApproval: true; approvalId: string; expiresAt: string };

export async function sendSwapFromPocket(userId: string, isAdmin: boolean, input: SendSwapInput, leg?: RouteLegOptions, member?: MemberSendOptions) {
  const from = swapCoin(input.from);
  const to = swapCoin(input.to);
  const protocol: Protocol = input.protocol ?? SEND_PROTOCOL;
  if (!SEND_PROTOCOLS.includes(protocol)) throw new Error("Unknown swap network.");
  const label = PROTOCOL_LABEL[protocol];
  if (!from || !to || from.id === to.id) throw new Error("Pick two different coins.");
  if (!to.protocols.includes(protocol)) throw new Error(`${label} doesn't offer ${to.symbol} on ${to.network}.`);
  if (!destinationValid(to, input.destination)) throw new Error(`That doesn't look like a ${to.network} address (${to.addressHint}).`);
  const src = sendSource(from, protocol);
  if (!src) throw new Error(`Seeds can't send ${from.symbol} on ${from.network} through ${label} yet.`);
  let amount = toBaseUnits(input.amount);
  if (amount == null || amount <= 0n) throw new Error("Enter an amount with at most 8 decimal places.");

  const link = await loadLink(userId);
  // Early, cheap gate (no price yet) so non-pilot members never trigger quotes.
  const early = sendBlocker({ from, link, isAdmin: isAdmin || Boolean(leg), amountUsd: 0, protocol });
  if (early) throw new Error(early);

  if (src.kind === "erc20") amount = roundTo1e8Units(amount, await tokenDecimals(tokenContract(from.asset)!));
  const nd = NATIVE_DECIMALS[src.kind];
  if (nd != null) amount = roundTo1e8Units(amount, nd);
  if (amount <= 0n) throw new Error("Amount too small.");

  const { quoteForSend } = await import("./router.server");
  const { route, plan, inputUsd } = await quoteForSend(protocol, from, to, amount, input.destination);
  const blocker = sendBlocker({ from, link, isAdmin: isAdmin || Boolean(leg), amountUsd: inputUsd, protocol });
  if (blocker) throw new Error(blocker);
  if (!route.ok) throw new RouteUnavailableError(route.error ?? `${label} has no route right now.`);
  if (!plan) throw new RouteUnavailableError(`Not safe to send through ${label} right now: ${route.blockedReason ?? "a safety check failed"}.`);
  if (plan.expiry - Date.now() / 1000 < MIN_SEND_QUOTE_SECONDS) throw new RouteUnavailableError(`${label}'s quote is about to expire. Try again.`);
  if (!requoteOk(input.shownOut, route.expectedOut, leg?.tolerance)) {
    throw new PriceMovedError(route.expectedOut, `The price moved more than ${Math.round((leg?.tolerance ?? 0.01) * 100)}% since you looked (now ${route.expectedOut} ${to.symbol}). Check the new quote and try again.`);
  }
  if (from.evm && !plan.router) throw new Error(`${label} named no confirmed router contract.`);

  const fromAddress = link!.addresses[src.pocket]!;

  // Audit 2026-11-19 H2: paying out anywhere but the member's own pocket is a withdrawal.
  // It needs a fresh two-factor code and a Telegram Approve tap for exactly this send.
  // TSD-route legs (leg set) always pay the member's own pocket and never get here unchecked.
  if (!isOwnPocketDestination(to, link!.addresses, input.destination)) {
    if (leg || !member) throw new Error("This swap can only pay out to your own pocket. Nothing was sent.");
    {
      const { tradingFrozenReason } = await import("@/lib/settle/confirm.server");
      const frozen = await tradingFrozenReason(userId);
      if (frozen) throw new Error(`${frozen} Swaps to an outside address are paused too. Nothing was sent.`);
    }
    const amountCoins = Number(amount) / 1e8;
    const { spendApproval, requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    if (!member.approvalId) {
      const { hasTwoFactor } = await import("@/lib/two-factor.server");
      const { freshTwoFactor } = await import("@/lib/two-factor");
      const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle();
      const problem = outsideSwapProblem({
        twoFactorOn: await hasTwoFactor(userId),
        fresh: freshTwoFactor(member.claims as never, Math.floor(Date.now() / 1000)),
        telegramVerified: prof?.telegram_verified === true,
      });
      if (problem) throw new Error(problem);
      const ap = await requestSendApproval({
        userId, linkId: link!.id, purpose: "swap_out", refId: crypto.randomUUID(), leg: from.id, asset: from.symbol,
        amount: amountCoins, from: fromAddress, to: input.destination,
        what: `Swap to about ${route.expectedOut} ${to.symbol} (${to.network}) via ${label}, paid to an outside address`,
        meta: { from: from.id, to: to.id, protocol, shownOut: input.shownOut },
      });
      return { needsApproval: true, approvalId: ap.id, expiresAt: ap.expires_at } satisfies SwapNeedsApproval;
    }
    await spendApproval({
      purpose: "swap_out", id: member.approvalId, leg: from.id, userId, linkId: link!.id,
      amount: amountCoins, from: fromAddress, to: input.destination,
      meta: { from: from.id, to: to.id, protocol },
    });
  }
  const { data: id, error } = await supabaseAdmin.rpc("reserve_swap_send", {
    _user_id: userId, _link_id: link!.id, _protocol: protocol, _pocket: src.pocket, _from_asset: from.asset, _to_asset: to.asset,
    _amount_in: Number(amount) / 1e8, _amount_usd: Math.round(inputUsd! * 100) / 100, _expected_out: route.expectedOut, _min_out: route.minOut ?? 0,
    _from_address: fromAddress, _destination: input.destination, _vault: plan.vault, _router: plan.router ?? "", _memo: plan.memo,
    // A TSD route's leg was already held to its route's limits when the route started.
    _per_swap_max_usd: swapLimitsFor(isAdmin || Boolean(leg)).perSwapUsd, _daily_max_usd: swapLimitsFor(isAdmin || Boolean(leg)).dailyUsd, _route_id: leg?.routeId,
  });
  if (error || !id) throw new Error(cleanDbError(error?.message ?? "Could not reserve this swap."));
  const rowId = id as string;

  const update = async (patch: Record<string, unknown>) => {
    const { error: e } = await supabaseAdmin.from("swap_sends").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", rowId);
    if (e) throw new Error(`Could not record the swap: ${e.message}`);
  };
  let recordedTxid = false;
  const record: Recorder = async (field, value) => {
    await update({ [field]: value });
    if (field === "txid") recordedTxid = true;
  };

  let priv: Uint8Array | null = null;
  try {
    if (!link!.ciphertext) throw new Error("Seeds doesn't hold this pocket's key.");
    const keys = JSON.parse(decryptDelegatedKey(link!.ciphertext)) as Record<string, string>;
    const xprv = keys[src.pocket];
    for (const k of Object.keys(keys)) keys[k] = "";
    if (!xprv) throw new Error(`Seeds doesn't hold the ${from.network} key for this pocket.`);
    priv = receivePrivateKey(src.pocket, xprv);
    if (addressOfKey(src.pocket, priv) !== fromAddress) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");

    const sent = await signAndBroadcast(src.kind, priv, from, fromAddress, amount, plan, record);
    await update({ status: "sent", txid: sent.txid, approve_txid: sent.approveTxid ?? null });
    void tellMember(userId, `Swap sent: ${Number(amount) / 1e8} ${from.symbol} → about ${route.expectedOut} ${to.symbol} via ${label}. Tx ${sent.txid}`, [
      `Sent ${Number(amount) / 1e8} ${from.symbol} (${from.network}) from your trading pocket`,
      `Expected about ${route.expectedOut} ${to.symbol} to ${input.destination}; refund instead if it would be under ${route.minOut ?? "the limit"}`,
      `Network transaction ${sent.txid}`,
    ]);
    return { needsApproval: false as const, id: rowId, txid: sent.txid, expectedOut: route.expectedOut, minOut: route.minOut, protocol };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A txid we stored may still have reached the network if the broadcast timed out.
    const maybeSent = recordedTxid && maybeBroadcast(msg);
    await supabaseAdmin.from("swap_sends").update({ status: maybeSent ? "unknown" : "failed", error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", rowId);
    throw new Error(maybeSent ? `The network didn't confirm it received the swap (${msg}). We'll keep checking — don't retry yet.` : msg);
  } finally {
    priv?.fill(0);
  }
}

/** Check THORChain / Maya for progress on this member's open swaps (at most 5, every 30s each). */
export async function refreshSwapSends(userId: string) {
  const stale = new Date(Date.now() - 30_000).toISOString();
  const { data } = await supabaseAdmin
    .from("swap_sends")
    .select("id, txid, status, protocol, to_asset")
    .eq("user_id", userId)
    .in("status", ["sent", "unknown"])
    .not("txid", "is", null)
    .or(`checked_at.is.null,checked_at.lt.${stale}`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (!data?.length) return;
  const { protocolTxStatus } = await import("./router.server");
  await Promise.all(data.map(async (r) => {
    const p: Protocol = r.protocol === "maya" ? "maya" : "thorchain";
    const s = (await protocolTxStatus(p, thorTxId(r.txid!))) as ThorTxStatus & { tx?: unknown } | null;
    const seen = Boolean(s && (s.tx || s.stages?.inbound_observed?.completed));
    // Maya also lists CACAO payouts on its own chain: only a payout on the coin's chain is delivery.
    const prog = swapProgress(s, p === "maya" ? r.to_asset.split(".")[0] : undefined);
    const status = prog.status !== "sent" ? prog.status : seen ? "sent" : r.status;
    await supabaseAdmin.from("swap_sends").update({ status, out_txid: prog.outTxid, checked_at: new Date().toISOString() }).eq("id", r.id);
    if (status !== r.status && (status === "done" || status === "refunded")) {
      const { notifyUser } = await import("@/lib/telegram.server");
      void notifyUser(userId, "notify_settlement", status === "done"
        ? `Swap delivered by ${PROTOCOL_LABEL[p]}. Tx ${prog.outTxid ?? r.txid}`
        : `${PROTOCOL_LABEL[p]} refunded your swap (price protection or a network issue). Refund tx ${prog.outTxid ?? "pending"}`);
    }
  }));
}

export async function listSwapSends(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("swap_sends")
    .select("id, protocol, from_asset, to_asset, amount_in, amount_usd, expected_out, min_out, destination, txid, approve_txid, out_txid, status, error, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  // A TSD swap's THORChain step is shown inside that TSD swap, not as a second swap.
  const { data: legs, error: legErr } = await supabaseAdmin
    .from("tsd_routes")
    .select("swap_send_id")
    .eq("user_id", userId)
    .not("swap_send_id", "is", null);
  if (legErr) throw new Error(legErr.message);
  // A two-step swap's THORChain/Maya hop is shown inside that swap too.
  const { data: hops, error: hopErr } = await supabaseAdmin
    .from("two_step_swaps")
    .select("swap_send_id, leg2_swap_send_id")
    .eq("user_id", userId);
  if (hopErr) throw new Error(hopErr.message);
  const legIds = new Set([
    ...(legs ?? []).map((l) => l.swap_send_id),
    ...(hops ?? []).flatMap((h) => [h.swap_send_id, h.leg2_swap_send_id]).filter(Boolean),
  ]);
  return (data ?? []).filter((s) => !legIds.has(s.id)).slice(0, 20);
}
