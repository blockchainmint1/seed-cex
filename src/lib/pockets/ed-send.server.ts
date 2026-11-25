/** Native coin I/O. Only withdraw/send.server calls these after the owner's three proofs. */
import { Cell } from "@ton/core";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { ED_NODES } from "@/lib/nodes.server";
import { withPocketKey, type KeyedLink } from "@/lib/xchain/send.server";
import { edSendBlocker, checkNativeSpend, ED_FEE_CAP, stellarUnits, stellarReserve, TON_KEEP } from "./ed-send-rules";
import { parseTonPublicKey, TON_W5_CODE_HASH, TON_W5_WALLET_ID, type EdChain } from "./ed25519-chains";
import { buildStellarTransfer } from "./stellar-tx";
import { buildTonTransfer, tonDestination } from "./ton-tx";
import { buildSuiTransfer, signSuiTransfer, suiGasBudget, type SuiCoinRef } from "./sui-tx";
import { suiPaid, tonTraceStatus, type TonTrace } from "./ed-confirm-rules";

type Link = KeyedLink & { xpubs?: Record<string, string> };
type Recorder = (txid: string) => Promise<void>;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`Coin network HTTP ${res.status}`);
  return await res.json() as T;
}
const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

type StellarAccount = { sequence: string; balances: { asset_type: string; balance: string; selling_liabilities?: string }[];
  subentry_count: number; num_sponsoring: number; num_sponsored: number;
  thresholds: { med_threshold: number }; signers: { key: string; weight: number }[] };
async function stellarAccount(address: string): Promise<StellarAccount | null> {
  const r = await fetch(`${ED_NODES.stellar}/accounts/${encodeURIComponent(address)}`, { redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Stellar couldn't read the account. Nothing was sent.");
  return await r.json() as StellarAccount;
}
async function stellarState(address: string) {
  const [account, ledger] = await Promise.all([stellarAccount(address), json<{ _embedded: { records: { base_fee_in_stroops: number; base_reserve_in_stroops: number; closed_at: string }[] } }>(`${ED_NODES.stellar}/ledgers?order=desc&limit=1`)]);
  const last = ledger._embedded.records[0];
  if (!last || !Number.isSafeInteger(last.base_fee_in_stroops) || !Number.isSafeInteger(last.base_reserve_in_stroops) || !Number.isFinite(Date.parse(last.closed_at)) || Math.abs(Date.now() - Date.parse(last.closed_at)) > 120_000) throw new Error("Stellar ledger isn't current. Nothing was sent.");
  const native = account?.balances.find((b) => b.asset_type === "native");
  const balance = native ? stellarUnits(native.balance) : 0n;
  const baseReserve = BigInt(last.base_reserve_in_stroops);
  const reserve = account ? stellarReserve(baseReserve, account.subentry_count, account.num_sponsoring, account.num_sponsored, stellarUnits(native?.selling_liabilities ?? "0")) : 0n;
  return { account, balance, reserve, baseReserve, fee: BigInt(last.base_fee_in_stroops) * 2n };
}

type TonInfo = { balance: string; state: string; code: string; data: string; suspended?: boolean; sync_utime: number };
async function tonCall<T>(method: string, args: unknown): Promise<T> {
  const r = await json<{ ok: boolean; result: T }>(`${ED_NODES.ton}/${method}`, post(args));
  if (r.ok !== true) throw new Error("TON refused the network request.");
  return r.result;
}
async function tonInfo(address: string): Promise<TonInfo> {
  const r = await tonCall<TonInfo>("getAddressInformation", { address });
  if (!/^\d+$/.test(r.balance) || !Number.isSafeInteger(r.sync_utime) || Math.abs(Date.now() / 1000 - r.sync_utime) > 120) throw new Error("TON account data isn't current. Nothing was sent.");
  return r;
}
/** A deployed account must still be this exact W5 wallet, with signatures on and no extensions. */
export function tonSeqno(info: TonInfo, publicKey: Uint8Array): number {
  if (info.suspended) throw new Error("TON account is suspended. Nothing was sent.");
  if (info.state === "uninitialized") return 0;
  if (info.state !== "active") throw new Error("TON pocket isn't active. Nothing was sent.");
  const code = Cell.fromBoc(Buffer.from(info.code, "base64"))[0];
  const data = Cell.fromBoc(Buffer.from(info.data, "base64"))[0];
  if (!code || !data || code.hash().toString("hex") !== TON_W5_CODE_HASH) throw new Error("TON wallet code changed. Nothing was sent.");
  const s = data.beginParse();
  if (!s.loadBit()) throw new Error("TON wallet signatures are disabled. Nothing was sent.");
  const seqno = s.loadUint(32);
  if (s.loadUint(32) !== TON_W5_WALLET_ID || !s.loadBuffer(32).equals(Buffer.from(publicKey)) || s.loadBit() || s.remainingBits !== 0 || s.remainingRefs !== 0) throw new Error("TON wallet keys or extensions changed. Nothing was sent.");
  return seqno;
}

function suiClient() { return new SuiGrpcClient({ network: "mainnet", baseUrl: ED_NODES.sui }); }

export async function readEdSpendable(chain: EdChain, address: string): Promise<bigint> {
  if (chain === "XLM") { const s = await stellarState(address); return s.balance > s.reserve ? s.balance - s.reserve : 0n; }
  if (chain === "TON") { const b = BigInt((await tonInfo(address)).balance); return b > TON_KEEP ? b - TON_KEEP : 0n; }
  const r = await suiClient().getBalance({ owner: address, coinType: "0x2::sui::SUI", signal: AbortSignal.timeout(12_000) });
  return BigInt(r.balance.balance);
}

/** Unknown broadcast outcomes always contain 'broadcast' so the existing no-retry watcher holds them. */
export async function sendEdNative(chain: EdChain, link: Link, from: string, to: string, units: bigint, record: Recorder, tester = false): Promise<string> {
  const blocked = edSendBlocker(chain, tester);
  if (blocked) throw new Error(blocked);
  if (chain === "XLM") {
    const [s, recipient] = await Promise.all([stellarState(from), stellarAccount(to)]);
    if (!s.account || (s.account.signers.find((k) => k.key === from)?.weight ?? 0) < s.account.thresholds.med_threshold) throw new Error("Stellar pocket can't authorize this payment. Nothing was sent.");
    if (!recipient && units < 2n * s.baseReserve) throw new Error("A new Stellar address needs its minimum account reserve. Nothing was sent.");
    checkNativeSpend(chain, units, s.balance, s.fee, s.reserve);
    const tx = await withPocketKey(link, chain, from, async (privateKey) => buildStellarTransfer({ privateKey, from, to, units, sequence: s.account?.sequence ?? "", fee: s.fee, createAccount: !recipient, expiresAt: Math.floor(Date.now() / 1000) + 120 }));
    await record(tx.txid);
    try {
      const res = await fetch(`${ED_NODES.stellar}/transactions`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ tx: tx.xdr }), redirect: "manual", signal: AbortSignal.timeout(20_000) });
      if (res.status === 400) throw new Error("Stellar rejected this transaction.");
      if (!res.ok) throw new Error("Stellar broadcast not confirmed");
      const result = await res.json() as { hash: string; successful: boolean };
      if (result.hash !== tx.txid || result.successful !== true) throw new Error("Stellar broadcast result couldn't be verified");
    } catch (e) {
      if (e instanceof Error && e.message === "Stellar rejected this transaction.") throw e;
      throw new Error("Stellar network broadcast outcome is unknown. Do not retry; Seeds will check its transaction id.");
    }
    return tx.txid;
  }
  if (chain === "TON") {
    const publicHalf = link.xpubs?.['TON'];
    if (!publicHalf) throw new Error("TON public key is missing. Nothing was sent.");
    const publicKey = parseTonPublicKey(publicHalf);
    const info = await tonInfo(from);
    const seqno = tonSeqno(info, publicKey);
    const args = { publicKey, from, to, units, seqno, deploy: info.state === "uninitialized", expiresAt: Math.floor(Date.now() / 1000) + 120 };
    const unsigned = await buildTonTransfer(args);
    const estimate = await tonCall<{ source_fees: Record<string, number | string> }>("estimateFee", { address: from, body: unsigned.body, init_code: unsigned.initCode, init_data: unsigned.initData, ignore_chksig: true });
    const names = ["in_fwd_fee", "storage_fee", "gas_fee", "fwd_fee"];
    const fee = names.reduce((n, k) => { const v = estimate.source_fees[k]; if (v === undefined || !/^\d+$/.test(String(v))) throw new Error("TON fee estimate is incomplete"); return n + BigInt(v); }, 0n) * 2n;
    checkNativeSpend(chain, units, BigInt(info.balance), fee, TON_KEEP);
    const tx = await withPocketKey(link, chain, from, (privateKey) => buildTonTransfer({ ...args, privateKey }));
    await record(tx.txid);
    try { await tonCall("sendBoc", { boc: tx.boc }); }
    catch { throw new Error("TON network broadcast outcome is unknown. Do not retry; Seeds will check its message id."); }
    // Acknowledgement is not delivery. The confirmation watcher checks the full trace.
    return tx.txid;
  }
  const client = suiClient();
  const { referenceGasPrice } = await client.getReferenceGasPrice({ signal: AbortSignal.timeout(12_000) });
  const gasPrice = BigInt(referenceGasPrice);
  const coins: SuiCoinRef[] = []; const seen = new Set<string>(); const cursors = new Set<string>();
  let balance = 0n; let cursor: string | null = null;
  for (let pageNumber = 0; balance < units + ED_FEE_CAP.SUI && pageNumber < 20; pageNumber++) {
    const page = await client.listCoins({ owner: from, coinType: "0x2::sui::SUI", limit: 100, cursor, signal: AbortSignal.timeout(12_000) });
    for (const coin of page.objects) {
      if (seen.has(coin.objectId)) throw new Error("Sui coin list repeated a coin");
      seen.add(coin.objectId);
      if (coin.owner.$kind !== "AddressOwner" || coin.owner.AddressOwner !== from) throw new Error("Sui coin ownership mismatch");
      if (BigInt(coin.balance) === 0n) continue;
      if (coins.length >= 256) throw new Error("Sui pocket needs coin consolidation first. Nothing was sent.");
      coins.push(coin); balance += BigInt(coin.balance);
      if (balance >= units + ED_FEE_CAP.SUI) break;
    }
    if (!page.hasNextPage || balance >= units + ED_FEE_CAP.SUI) break;
    if (!page.cursor || cursors.has(page.cursor)) throw new Error("Invalid Sui coin pagination");
    cursors.add(page.cursor); cursor = page.cursor;
  }
  checkNativeSpend(chain, units, balance, ED_FEE_CAP.SUI);
  const input = { from, to, units, gasPrice, gasBudget: ED_FEE_CAP.SUI, coins };
  const initial = await buildSuiTransfer(input);
  const simulated = await client.simulateTransaction({ transaction: initial.bytes, checksEnabled: true, doGasSelection: false, include: { effects: true }, signal: AbortSignal.timeout(12_000) });
  if (simulated.$kind !== "Transaction" || simulated.gasPaymentMocked || !simulated.Transaction.effects) throw new Error("Sui refused the payment simulation. Nothing was sent.");
  const gasBudget = suiGasBudget(simulated.Transaction.effects.gasUsed, gasPrice);
  checkNativeSpend(chain, units, balance, gasBudget);
  const tx = await buildSuiTransfer({ ...input, gasBudget });
  const final = await client.simulateTransaction({ transaction: tx.bytes, checksEnabled: true, doGasSelection: false, include: { effects: true }, signal: AbortSignal.timeout(12_000) });
  if (final.$kind !== "Transaction" || final.gasPaymentMocked || !final.Transaction.status.success) throw new Error("Sui refused the final payment. Nothing was sent.");
  const signature = await withPocketKey(link, chain, from, async (privateKey) => signSuiTransfer(tx.bytes, privateKey, from));
  await record(tx.txid);
  try {
    const result = await client.executeTransaction({ transaction: tx.bytes, signatures: [signature], include: { effects: true, balanceChanges: true }, signal: AbortSignal.timeout(20_000) });
    const executed = result.Transaction ?? result.FailedTransaction;
    if (executed.digest !== tx.txid) throw new Error("Sui broadcast digest mismatch");
    if (!executed.status.success) throw new Error("Sui rejected this transaction.");
    if (!suiPaid(executed.balanceChanges, to, units)) throw new Error("Sui broadcast payout couldn't be verified");
  } catch (e) {
    if (e instanceof Error && e.message === "Sui rejected this transaction.") throw e;
    throw new Error("Sui network broadcast outcome is unknown. Do not retry; Seeds will check its transaction id.");
  }
  return tx.txid;
}

export async function edTxStatus(chain: EdChain, txid: string, to: string, units: bigint) {
  if (chain === "XLM") {
    const r = await json<{ hash: string; successful: boolean }>(`${ED_NODES.stellar}/transactions/${encodeURIComponent(txid)}`);
    return r.hash === txid ? { success: r.successful, confirmations: 1 } : null;
  }
  if (chain === "SUI") {
    const r = await suiClient().getTransaction({ digest: txid, include: { balanceChanges: true }, signal: AbortSignal.timeout(12_000) });
    const tx = r.Transaction ?? r.FailedTransaction;
    if (tx.digest !== txid) return null;
    return { success: tx.status.success && suiPaid(tx.balanceChanges, to, units), confirmations: 1 };
  }
  // TON's wallet can accept an external message but skip its outgoing action (W5 +2 mode).
  // Never treat the wallet's seqno advancing or an HTTP acknowledgement as a paid recipient.
  const trace = await json<TonTrace>(`${ED_NODES.tonTrace}/${encodeURIComponent(txid)}`);
  return tonTraceStatus(trace, txid, tonDestination(to).toRawString(), units);
}