/**
 * Network I/O for withdrawals: check a destination, read a pocket balance, and sign + broadcast
 * one plain transfer for any coin in catalog.ts. Server only. Nothing here decides whether a
 * withdrawal may happen (withdraw.server.ts does); the key is opened last and wiped after.
 */
import { bech32 } from "@scure/base";
import { bytesToHex } from "@noble/hashes/utils.js";
import { getChain, omniLegAsset } from "@/lib/chains";
import { EVM_MAX_FEE, EVM_NATIVE, type WithdrawCoin } from "./catalog";

type Link = { id: string; ciphertext: string | null };

function evmAsset(c: WithdrawCoin) {
  const chain = getChain(c.evmChain!);
  const asset = chain.assets.find((a) => a.symbol === c.symbol);
  if (!asset) throw new Error(`${c.symbol} isn't listed on ${chain.name}.`);
  if (asset.decimals !== c.decimals) throw new Error(`${c.symbol} decimals mismatch on ${chain.name}.`);
  return { chain, asset };
}

/** Why `to` is not a safe destination for this coin, or null. */
export async function destinationProblem(c: WithdrawCoin, to: string, own: string): Promise<string | null> {
  const t = to.trim();
  if (!t) return "Enter the address to send to.";
  if (t === own || t.toLowerCase() === own.toLowerCase()) return "That's your trading pocket's own address.";
  if (c.kind === "evm") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return `That isn't a ${c.networkLabel} address. It should start with 0x and have 40 more letters/numbers.`;
    if (/^0x0{40}$/i.test(t)) return "That's the empty (burn) address — coins sent there are gone.";
    const { asset } = evmAsset(c);
    if (asset.contract && t.toLowerCase() === asset.contract.toLowerCase()) return `That's the ${c.symbol} contract itself. Coins sent there can't be recovered.`;
    const { isValidEvmAddress } = await import("@/lib/evm/tx.server");
    return isValidEvmAddress(t) ? null : `That isn't a valid ${c.networkLabel} address (check the capital letters).`;
  }
  if (c.kind === "utxo" && c.utxoChain !== "ltc") {
    const { isValidUtxoAddress } = await import("@/lib/utxo/io.server");
    return isValidUtxoAddress(c.utxoChain!, t) ? null : `That isn't a ${c.networkLabel} address.`;
  }
  if (c.kind === "xmr") {
    const { isMoneroAddress } = await import("@/lib/monero/rules");
    return isMoneroAddress(t) ? null : "That isn't a Monero address (it starts with 4 or 8 and is 95 characters).";
  }
  if (c.kind === "omni") {
    const { isValidUtxoAddress } = await import("@/lib/utxo/io.server");
    return isValidUtxoAddress("txc", t) ? null : "That isn't a TEXITcoin address. TSD goes to a TEXITcoin address.";
  }
  const { swapCoin } = await import("@/lib/xchain/assets");
  const { destinationValid } = await import("@/lib/xchain/safety");
  const sc = swapCoin(c.addressAsset!);
  if (!sc) throw new Error(`No address rules for ${c.symbol}.`);
  return destinationValid(sc, t) ? null : `That isn't a ${c.networkLabel} address (${c.addressHint}).`;
}

export type Balance = { units: bigint | null; feeUnits: bigint | null };

async function evmRaw(chain: string, contract: string | null, address: string): Promise<bigint | null> {
  const { evmRpc } = await import("@/lib/evm.server");
  const hex = contract
    ? await evmRpc<string>(chain as never, "eth_call", [{ to: contract, data: `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` }, "latest"])
    : await evmRpc<string>(chain as never, "eth_getBalance", [address, "latest"]);
  if (hex == null) return null;
  return hex === "0x" ? 0n : BigInt(hex);
}

const coinsToSats = (n: number) => BigInt(Math.round(n * 1e8));

/** Live spendable balance of the coin at the pocket address, plus the fee coin when it differs. */
export async function readBalance(c: WithdrawCoin, address: string): Promise<Balance> {
  try {
    switch (c.kind) {
      case "evm": {
        const { asset } = evmAsset(c);
        const [bal, gas] = await Promise.all([evmRaw(c.evmChain!, asset.contract, address), asset.contract ? evmRaw(c.evmChain!, null, address) : Promise.resolve(null)]);
        return { units: bal, feeUnits: asset.contract ? gas : bal };
      }
      case "omni": {
        const { fetchOmniBalance } = await import("@/lib/omni.server");
        const { loadUtxosFor } = await import("@/lib/utxo/io.server");
        const [omni, utxos] = await Promise.all([fetchOmniBalance(address, omniLegAsset("tsd").propertyId), loadUtxosFor("txc", address).catch(() => null)]);
        if (!omni.online) return { units: null, feeUnits: null };
        return { units: coinsToSats(omni.balance), feeUnits: utxos ? coinsToSats(utxos.reduce((s, u) => s + u.amount, 0)) : null };
      }
      case "utxo": {
        const { loadUtxosFor } = await import("@/lib/utxo/io.server");
        const utxos = await loadUtxosFor(c.utxoChain!, address);
        const u = coinsToSats(utxos.reduce((s, x) => s + x.amount, 0));
        return { units: u, feeUnits: u };
      }
      case "btc": {
        const { fetchBtcUtxos } = await import("@/lib/btc/io.server");
        const u = coinsToSats((await fetchBtcUtxos(address)).reduce((s, x) => s + x.amount, 0));
        return { units: u, feeUnits: u };
      }
      case "doge":
      case "bch": {
        const { bookUtxos } = await import("@/lib/xchain/send-io.server");
        const u = (await bookUtxos(c.kind === "doge" ? "DOGE" : "BCH", address)).reduce((s, x) => s + x.value, 0n);
        return { units: u, feeUnits: u };
      }
      case "xrp": {
        const { xrpAccount } = await import("@/lib/xchain/send-io.server");
        const a = await xrpAccount(address);
        return { units: a.balanceDrops, feeUnits: a.balanceDrops };
      }
      case "trx": {
        const { tronSun } = await import("@/lib/xchain/send-io.server");
        const u = await tronSun(address);
        return { units: u, feeUnits: u };
      }
      case "sol": {
        const { solLamports } = await import("@/lib/xchain/send-io.server");
        const u = await solLamports(address);
        return { units: u, feeUnits: u };
      }
      case "xmr": {
        // Live unlocked balance from the member's watch wallet on Seeds' Monero server.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("monero_wallets").select("link_id").eq("address", address).eq("status", "ready").limit(1).maybeSingle();
        if (!data) return { units: null, feeUnits: null };
        const { liveUnlocked } = await import("@/lib/monero/wallet.server");
        const u = await liveUnlocked(data.link_id);
        return { units: u, feeUnits: u };
      }
    }
  } catch (e) {
    console.error("[withdraw] balance read failed", c.key, e instanceof Error ? e.message : e);
    return { units: null, feeUnits: null };
  }
}

function ltcScript(address: string): Uint8Array | undefined {
  if (!/^ltc1/i.test(address)) return undefined;
  const dec = bech32.decode(address.toLowerCase() as `ltc1${string}`);
  if (dec.prefix !== "ltc" || dec.words[0] !== 0) throw new Error("Unsupported Litecoin address");
  const prog = Uint8Array.from(bech32.fromWords(dec.words.slice(1)));
  if (prog.length !== 20 && prog.length !== 32) throw new Error("Unsupported Litecoin address");
  return Uint8Array.from([0x00, prog.length, ...prog]);
}

/** Called with the transaction id before broadcast where the network allows it. */
export type Recorder = (txid: string) => Promise<void>;

/**
 * Sign and broadcast one transfer of `units` from the pocket at `from` to `to`.
 * Re-reads balances and fees first and refuses (nothing sent) if the pocket can't cover them.
 */
export async function sendWithdrawal(c: WithdrawCoin, link: Link, from: string, to: string, units: bigint, record: Recorder, destinationTag?: number | null): Promise<string> {
  const { withPocketKey } = await import("@/lib/xchain/send.server");
  const coins = Number(units) / 10 ** c.decimals;
  switch (c.kind) {
    case "evm": {
      const { chain, asset } = evmAsset(c);
      const id = c.evmChain!;
      const { estimateGas, fetchNonce, sendRawTransaction, suggestFees } = await import("@/lib/evm.server");
      const { erc20TransferData, signEip1559 } = await import("@/lib/evm/tx.server");
      const [bal, gasBal, nonce, fees] = await Promise.all([
        evmRaw(id, asset.contract, from), asset.contract ? evmRaw(id, null, from) : Promise.resolve(null), fetchNonce(id, from), suggestFees(id),
      ]);
      if (bal == null || nonce == null || !fees) throw new Error(`${chain.name} couldn't be read. Nothing was sent.`);
      const target = asset.contract ?? to;
      const data = asset.contract ? erc20TransferData(to, units) : "0x";
      const value = asset.contract ? 0n : units;
      const est = await estimateGas(id, { from, to: target, data, value: `0x${value.toString(16)}` });
      if (est == null) throw new Error(`${chain.name} refused to estimate this send (not enough balance?). Nothing was sent.`);
      const gasLimit = (est * 12n) / 10n;
      const feeWei = gasLimit * fees.maxFeePerGas;
      const native = EVM_NATIVE[id] ?? chain.nativeSymbol;
      if (Number(feeWei) / 1e18 > (EVM_MAX_FEE[id] ?? 0)) throw new Error(`${chain.name} network fees are unusually high right now. Nothing was sent — ask again later.`);
      if (bal < units) throw new Error(`Your pocket no longer holds ${coins} ${c.symbol}. Nothing was sent.`);
      const gasHave = asset.contract ? (gasBal ?? 0n) : bal - units;
      if (gasHave < feeWei) throw new Error(`Not enough ${native} left in your pocket on ${chain.name} for the network fee. Nothing was sent.`);
      const signed = await withPocketKey(link, "EVM", from, async (priv) =>
        signEip1559({ privateKeyHex: bytesToHex(priv), chainId: chain.evmChainId!, nonce, ...fees, gasLimit, to: target, value, data }));
      if (signed.from.toLowerCase() !== from.toLowerCase()) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");
      await record(signed.hash);
      await sendRawTransaction(id, signed.raw);
      return signed.hash;
    }
    case "omni": {
      const { omniSimpleSend } = await import("@/lib/omni.server");
      const sent = await withPocketKey(link, "TXC", from, (priv) =>
        omniSimpleSend({ privateKeyHex: bytesToHex(priv), fromAddress: from, toAddress: to, amount: coins, propertyId: omniLegAsset("tsd").propertyId, beforeBroadcast: record }));
      return sent.txid;
    }
    case "utxo": {
      const chain = c.utxoChain!;
      const { loadUtxosFor, feeRateFor, broadcastFor, p2pkhVersionOf } = await import("@/lib/utxo/io.server");
      const { buildAndSignTransfer } = await import("@/lib/txc/tx.server");
      const [utxos, feeRate] = await Promise.all([loadUtxosFor(chain, from, { atLeast: coins }), feeRateFor(chain)]);
      const tx = await withPocketKey(link, c.pocket, from, async (priv) => buildAndSignTransfer({
        privateKeyHex: bytesToHex(priv), fromAddress: from, toAddress: to, toScript: chain === "ltc" ? ltcScript(to) : undefined,
        amount: coins, utxos, feeRate, p2pkhVersion: p2pkhVersionOf(chain), symbol: c.symbol,
      }));
      await record(tx.txid);
      const id = await broadcastFor(chain, tx.hex);
      return id || tx.txid;
    }
    case "btc": {
      const { fetchBtcFeeRate, fetchBtcUtxos, broadcastBtcTx } = await import("@/lib/btc/io.server");
      const { buildAndSignBtcTransfer } = await import("@/lib/btc/tx.server");
      const [utxos, feeRate] = await Promise.all([fetchBtcUtxos(from), fetchBtcFeeRate()]);
      const tx = await withPocketKey(link, "BTC", from, async (priv) =>
        buildAndSignBtcTransfer({ privateKeyHex: bytesToHex(priv), fromAddress: from, toAddress: to, amount: coins, utxos, feeRate }));
      await record(tx.txid);
      await broadcastBtcTx(tx.hex);
      return tx.txid;
    }
    case "doge":
    case "bch": {
      const fam = c.kind === "doge" ? "DOGE" : "BCH";
      const { bookUtxos, bookFeeRate, bookBroadcast } = await import("@/lib/xchain/send-io.server");
      const { buildAndSignUtxoSend } = await import("@/lib/pockets/utxo-sign.server");
      const [utxos, feeRate] = await Promise.all([bookUtxos(fam, from), bookFeeRate(fam)]);
      const tx = await withPocketKey(link, fam, from, async (priv) => buildAndSignUtxoSend({ family: fam, privateKey: priv, utxos, to, amount: units, feeRate }));
      await record(tx.txid);
      await bookBroadcast(fam, tx.hex);
      return tx.txid;
    }
    case "xrp": {
      const { xrpAccount, xrpFeeDrops, xrpReserveDrops, xrpSubmit } = await import("@/lib/xchain/send-io.server");
      const { signXrpPayment } = await import("@/lib/pockets/xrp-sign.server");
      const [acct, fee] = await Promise.all([xrpAccount(from), xrpFeeDrops()]);
      const reserve = await xrpReserveDrops(acct.ownerCount);
      if (acct.balanceDrops < units + fee + reserve) throw new Error(`Not enough XRP: the XRP Ledger keeps ${Number(reserve) / 1e6} XRP locked as a reserve. Nothing was sent.`);
      const tx = await withPocketKey(link, "XRP", from, async (priv) => signXrpPayment({
        privateKey: priv, to, drops: units, feeDrops: fee, sequence: acct.sequence, lastLedgerSequence: acct.currentLedger + 20,
        destinationTag: destinationTag ?? undefined,
      }));
      await record(tx.hash);
      await xrpSubmit(tx.hex);
      return tx.hash;
    }
    case "trx": {
      const { tronRefBlock, tronBroadcast, tronSun } = await import("@/lib/xchain/send-io.server");
      const { signTronTransfer } = await import("@/lib/pockets/tron-sign.server");
      const [bal, ref] = await Promise.all([tronSun(from), tronRefBlock()]);
      if (bal < units + 1_000_000n) throw new Error("Not enough TRX: keep about 1 TRX for TRON's network fee. Nothing was sent.");
      const tx = await withPocketKey(link, "TRX", from, async (priv) =>
        signTronTransfer({ privateKey: priv, to, sun: units, refBlockNum: ref.number, refBlockId: ref.id, timestamp: Date.now() }));
      await record(tx.txid);
      await tronBroadcast(tx.hex);
      return tx.txid;
    }
    case "sol": {
      const { solBlockhash, solLamports, solSend } = await import("@/lib/xchain/send-io.server");
      const { signSolTransfer } = await import("@/lib/pockets/sol-sign.server");
      const [bal, blockhash] = await Promise.all([solLamports(from), solBlockhash()]);
      if (bal < units + 2_005_000n) throw new Error("Not enough SOL: keep about 0.002 SOL for fees and Solana's account minimum. Nothing was sent.");
      const tx = await withPocketKey(link, "SOL", from, async (priv) => signSolTransfer({ privateKey: priv, to, lamports: units, recentBlockhash: blockhash }));
      await record(tx.signature);
      await solSend(tx.base64);
      return tx.signature;
    }
    case "xmr": {
      const { sendMonero } = await import("@/lib/monero/wallet.server");
      return sendMonero(link, from, to, units, record);
    }
  }
}

/** EVM only: confirmations and success of a sent withdrawal. Other networks return null (shown as "Sent"). */
export async function txStatus(c: WithdrawCoin, txid: string) {
  if (c.kind !== "evm") return null;
  const { fetchEvmTxStatus } = await import("@/lib/evm.server");
  return fetchEvmTxStatus(c.evmChain!, txid);
}
