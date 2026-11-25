/** TRC-20 USDt I/O only through configured mainnet nodes; keys open after every preflight. */
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { nodeEndpoints, type NodeEndpoint } from "@/lib/nodes.server";
import type { KeyedLink } from "@/lib/xchain/send.server";
import type { EdSendMeta } from "./ed-send-rules";
import { USDT_TRON_CONTRACT, tronAbiAddress, tronHexAddress, tronUsdtParameters, tronUsdtData, tronUsdtFeeBudget, tronUsdtBlocker, tronUsdtDestinationProblem, tronUsdtSimulationEnergy, signTronUsdt, tronUsdtReceipt, type TronReceipt, type TronUsdtParams, type TronSimulation } from "./tron-usdt";

type Constant = TronSimulation;
async function nodeCall<T>(endpoint: NodeEndpoint, path: string, body: unknown): Promise<T> {
  const r = await fetch(`${endpoint.url}${path}`, { method: "POST", headers: endpoint.headers, body: JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error("TRON server couldn't answer. Nothing was sent.");
  const value = await r.json() as T & { Error?: unknown };
  if (!value || value.Error) throw new Error("TRON server couldn't read this request. Nothing was sent.");
  return value;
}
async function first<T>(read: (e: NodeEndpoint) => Promise<T>): Promise<T> {
  for (const e of nodeEndpoints("tron")) { try { return await read(e); } catch { /* read fallback only */ } }
  throw new Error("TRON servers aren't answering. Nothing was sent.");
}
async function two<T>(read: (e: NodeEndpoint) => Promise<T>): Promise<T[]> {
  const values: T[] = [];
  const hosts = new Set<string>();
  for (const e of nodeEndpoints("tron")) {
    const host = new URL(e.url).host;
    if (e.backupOnly || hosts.has(host)) continue;
    try { const value = await read(e); values.push(value); hosts.add(host); if (values.length === 2) return values; }
    catch { /* independent read fallback only */ }
  }
  throw new Error("Two TRON servers couldn't verify this send. Nothing was sent.");
}
function constantUint(r: Constant): bigint {
  const hex = r.constant_result?.[0];
  if (r.result?.result !== true || !hex || !/^[0-9a-f]{64}$/i.test(hex)) throw new Error("TRON token answer was incomplete. Nothing was sent.");
  return BigInt(`0x${hex}`);
}
async function tokenBalance(e: NodeEndpoint, address: string, finalized = true): Promise<bigint> {
  tronHexAddress(address);
  return constantUint(await nodeCall<Constant>(e, `${finalized ? "/walletsolidity" : "/wallet"}/triggerconstantcontract`, {
    owner_address: address, contract_address: USDT_TRON_CONTRACT, function_selector: "balanceOf(address)", parameter: tronAbiAddress(address), visible: true,
  }));
}
/** Display reads may use one finalized server; unreadable is null, never a fabricated zero. */
export async function usdtTronBalance(address: string): Promise<bigint | null> {
  try { return await first((e) => tokenBalance(e, address)); } catch { return null; }
}
export async function readUsdtTronSpendable(address: string): Promise<{ units: bigint; feeUnits: bigint }> {
  const answers = await two(async (e) => {
    const [finalized, latest, decimals, account] = await Promise.all([
      tokenBalance(e, address), tokenBalance(e, address, false),
      nodeCall<Constant>(e, "/wallet/triggerconstantcontract", { owner_address: address, contract_address: USDT_TRON_CONTRACT, function_selector: "decimals()", visible: true }),
      nodeCall<{ balance?: number }>(e, "/wallet/getaccount", { address, visible: true }),
    ]);
    if (constantUint(decimals) !== 6n || !Number.isSafeInteger(account.balance ?? 0) || (account.balance ?? 0) < 0) throw new Error("TRON token or fee balance couldn't be verified.");
    return { units: finalized < latest ? finalized : latest, feeUnits: BigInt(account.balance ?? 0) };
  });
  const a = answers[0], b = answers[1];
  if (!a || !b || a.units !== b.units || a.feeUnits !== b.feeUnits) throw new Error("TRON servers disagree about your USDT or TRX balance. Nothing was sent.");
  return a;
}

type Account = { address?: string; balance?: number; owner_permission?: { threshold?: number; keys?: Array<{ address?: string; weight?: number }> } };
/** Full burn budget, simulated for this exact destination/amount, before codes or keys. */
export async function prepareUsdtTronSend(from: string, to: string, units: bigint, tester = false, memo = ""): Promise<TronUsdtParams> {
  const gate = tronUsdtBlocker(tester);
  if (gate) throw new Error(gate);
  const why = tronUsdtDestinationProblem(to, from);
  if (why) throw new Error(why);
  const parameter = tronUsdtParameters(to, units);
  const [balance, estimates] = await Promise.all([readUsdtTronSpendable(from), two(async (e) => {
    const [simulation, fees, account, block] = await Promise.all([
      nodeCall<Constant>(e, "/wallet/triggerconstantcontract", { owner_address: from, contract_address: USDT_TRON_CONTRACT, function_selector: "transfer(address,uint256)", parameter, visible: true }),
      nodeCall<{ chainParameter?: Array<{ key?: string; value?: number }> }>(e, "/wallet/getchainparameters", {}),
      nodeCall<Account>(e, "/wallet/getaccount", { address: from, visible: true }),
      nodeCall<{ blockID?: string; block_header?: { raw_data?: { number?: number; timestamp?: number } } }>(e, "/wallet/getnowblock", {}),
    ]);
    const energy = tronUsdtSimulationEnergy(simulation);
    const price = (key: string) => { const n = fees.chainParameter?.find((p) => p.key === key)?.value; if (!n || !Number.isSafeInteger(n) || n <= 0) throw new Error("TRON fee rates couldn't be verified."); return BigInt(n); };
    const budget = tronUsdtFeeBudget(energy, price("getEnergyFee"), price("getTransactionFee"), memo ? price("getMemoFee") : 0n);
    const permission = account.owner_permission;
    const keys = permission?.keys;
    const key = keys?.[0];
    if (account.address !== from || !permission || !Number.isSafeInteger(permission.threshold) || (permission.threshold ?? 0) <= 0 || keys?.length !== 1 || key?.address !== from || !Number.isSafeInteger(key.weight) || (key.weight ?? 0) < (permission.threshold ?? 0)) throw new Error("Your TRON account's signing permissions changed. Nothing was sent.");
    const num = block.block_header?.raw_data?.number;
    const time = block.block_header?.raw_data?.timestamp;
    if (!block.blockID || !/^[0-9a-f]{64}$/i.test(block.blockID) || !Number.isSafeInteger(num) || num === undefined || num < 0 || !Number.isSafeInteger(time) || time === undefined || Math.abs(Date.now() - time) > 60_000) throw new Error("TRON's block reference isn't fresh. Nothing was sent.");
    return { budget, block: { number: num, id: block.blockID, time } };
  })]);
  const a = estimates[0], b = estimates[1];
  if (!a || !b) throw new Error("TRON estimates couldn't be verified.");
  // Take the larger estimate; a small state change never makes the budget cheaper.
  const budget = a.budget.totalSun >= b.budget.totalSun ? a.budget : b.budget;
  if (balance.units < units) throw new Error("Not enough USDT in your TRON pocket. Nothing was sent.");
  if (balance.feeUnits < budget.totalSun) throw new Error(`Your TRON pocket needs up to ${Number(budget.totalSun) / 1e6} TRX available for this USDT send's network fee. Nothing was sent.`);
  // A block timestamp is shared by every send in that block; use preparation time instead.
  // The transaction-id indexes also refuse an identical concurrent record before broadcast.
  const params: TronUsdtParams = { from, to, units, refBlockNum: a.block.number, refBlockId: a.block.id, timestamp: Date.now(), feeLimit: budget.feeLimit, ...(memo ? { memo } : {}) };
  return params;
}

export async function sendUsdtTron(link: KeyedLink, from: string, to: string, units: bigint, record: (txid: string, meta?: EdSendMeta) => Promise<void>, tester = false, memo = "") {
  const params = await prepareUsdtTronSend(from, to, units, tester, memo);
  const { withPocketKey } = await import("@/lib/xchain/send.server");
  const signed = await withPocketKey(link, "TRX", from, async (key) => signTronUsdt(params, key));
  if (Date.now() > params.timestamp + 120_000) throw new Error("TRON's block reference expired while preparing the send. Nothing was sent.");
  await record(signed.txid, { chain: "TRON", expiresAt: params.timestamp + 180_000, rawDataHex: signed.rawDataHex });
  const { tronBroadcast } = await import("@/lib/xchain/send-io.server");
  await tronBroadcast(signed.hex);
  return signed.txid;
}

/** Missing/ambiguous responses stay unknown; only two matching finalized receipts prove outcome. */
export async function usdtTronTxStatus(txid: string, from: string, to: string, units: bigint, evidence: unknown) {
  const meta = evidence && typeof evidence === "object" ? evidence as { chain?: unknown; rawDataHex?: unknown } : null;
  if (meta?.chain !== "TRON" || typeof meta.rawDataHex !== "string") return null;
  const statuses = await two(async (e) => {
    const [receipt, tx] = await Promise.all([
      nodeCall<TronReceipt>(e, "/walletsolidity/gettransactioninfobyid", { value: txid }),
      nodeCall<{ txID?: string; raw_data_hex?: string; raw_data?: { contract?: Array<{ type?: string; parameter?: { value?: { owner_address?: string; contract_address?: string; data?: string; call_value?: number } } }> } }>(e, "/walletsolidity/gettransactionbyid", { value: txid }),
    ]);
    const raw = tx.raw_data_hex;
    const contracts = tx.raw_data?.contract;
    const contract = contracts?.[0];
    const call = contract?.parameter?.value;
    if (!raw || raw !== meta.rawDataHex || !/^(?:[0-9a-f]{2})+$/i.test(raw) || tx.txID?.toLowerCase() !== txid.toLowerCase() || bytesToHex(sha256(hexToBytes(raw))) !== txid.toLowerCase()
      || contracts?.length !== 1 || contract?.type !== "TriggerSmartContract" || call?.owner_address?.toLowerCase() !== tronHexAddress(from)
      || call.contract_address?.toLowerCase() !== tronHexAddress(USDT_TRON_CONTRACT) || call.data?.toLowerCase() !== tronUsdtData(to, units) || (call.call_value ?? 0) !== 0) return null;
    return tronUsdtReceipt(receipt, txid, from, to, units);
  });
  const a = statuses[0], b = statuses[1];
  if (a === undefined || a === null || a !== b) return null;
  return { success: a, confirmations: 1 };
}