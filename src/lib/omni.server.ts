/**
 * Omni Layer (TEXITcoin L2) support — the home of TSD, the Texas Stable Dollar.
 *
 * TSD is Omni property #39 on the TEXITcoin chain: a divisible (8dp), managed
 * token issued against reserves by the honest.money bridge. Seeds treats it as
 * the native settlement dollar of the exchange.
 *
 * Server-only. Reads go through our own Omni Core node (`omni_*` RPC); sends
 * are assembled by the node and signed here, so key material never leaves the
 * worker.
 */
import { rpc, rpcConfigured, scanAddressUtxos, tryRpc } from "./rpc.server";
import { isValidTxcAddress, signRawTxWithKey, type Utxo } from "./txc/tx.server";

/** Texas Stable Dollar — Omni property id on the TEXITcoin Omni Layer. */
export const TSD_PROPERTY_ID = 39;

/** Miner fee (whole TXC) handed to `omni_createrawtx_change`. */
const OMNI_TX_FEE = 0.001;

export type OmniProperty = {
  propertyId: number;
  name: string;
  category: string;
  url: string;
  divisible: boolean;
  managed: boolean;
  issuer: string;
  creationTxid: string;
  totalTokens: number;
  online: boolean;
};

export async function fetchProperty(propertyId = TSD_PROPERTY_ID): Promise<OmniProperty> {
  const offline: OmniProperty = {
    propertyId,
    name: propertyId === TSD_PROPERTY_ID ? "Texas Stable Dollar" : `Property #${propertyId}`,
    category: "",
    url: "",
    divisible: true,
    managed: true,
    issuer: "",
    creationTxid: "",
    totalTokens: 0,
    online: false,
  };
  if (!rpcConfigured("txc")) return offline;

  const p = await tryRpc<{
    propertyid: number;
    name: string;
    category: string;
    url: string;
    divisible: boolean;
    managedissuance: boolean;
    issuer: string;
    creationtxid: string;
    totaltokens: string;
  }>("txc", "omni_getproperty", [propertyId]);
  if (!p) return offline;

  return {
    propertyId: p.propertyid,
    name: p.name,
    category: p.category,
    url: p.url,
    divisible: p.divisible,
    managed: p.managedissuance,
    issuer: p.issuer,
    creationTxid: p.creationtxid,
    totalTokens: Number(p.totaltokens),
    online: true,
  };
}

export type OmniBalance = {
  address: string;
  propertyId: number;
  balance: number;
  reserved: number;
  frozen: number;
  online: boolean;
};

export async function fetchOmniBalance(
  address: string,
  propertyId = TSD_PROPERTY_ID,
): Promise<OmniBalance> {
  const zero: OmniBalance = {
    address,
    propertyId,
    balance: 0,
    reserved: 0,
    frozen: 0,
    online: false,
  };
  if (!isValidTxcAddress(address) || !rpcConfigured("txc")) return zero;

  const b = await tryRpc<{ balance: string; reserved: string; frozen: string }>(
    "txc",
    "omni_getbalance",
    [address, propertyId],
  );
  if (!b) return zero;
  return {
    address,
    propertyId,
    balance: Number(b.balance),
    reserved: Number(b.reserved),
    frozen: Number(b.frozen),
    online: true,
  };
}

export type OmniHolder = { address: string; balance: number };

/** Every address holding the property, largest first. Public data. */
export async function fetchHolders(propertyId = TSD_PROPERTY_ID): Promise<OmniHolder[]> {
  const rows = await tryRpc<Array<{ address: string; balance: string }>>(
    "txc",
    "omni_getallbalancesforid",
    [propertyId],
  );
  if (!rows) return [];
  return rows
    .map((r) => ({ address: r.address, balance: Number(r.balance) }))
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

export type TsdSnapshot = {
  property: OmniProperty;
  holders: OmniHolder[];
  holderCount: number;
  circulating: number;
  top: OmniHolder[];
  omniBlock: number | null;
  omniVersion: string | null;
};

/** One call for the public TSD dashboard. */
export async function fetchTsdSnapshot(): Promise<TsdSnapshot> {
  const [property, holders, info] = await Promise.all([
    fetchProperty(),
    fetchHolders(),
    tryRpc<{ block: number; omnicoreversion: string }>("txc", "omni_getinfo"),
  ]);
  const circulating = holders.reduce((sum, h) => sum + h.balance, 0);
  return {
    property,
    holders,
    holderCount: holders.length,
    circulating: circulating || property.totalTokens,
    top: holders.slice(0, 10),
    omniBlock: info?.block ?? null,
    omniVersion: info?.omnicoreversion ?? null,
  };
}

/* --------------------------------- sending -------------------------------- */

export type OmniSendParams = {
  privateKeyHex: string;
  fromAddress: string;
  toAddress: string;
  /** whole tokens, 8dp for a divisible property */
  amount: number;
  propertyId?: number;
  /** Called with the txid after signing, before broadcast, so callers can record it first. */
  beforeBroadcast?: (txid: string) => Promise<void>;
};

export type OmniSendResult = {
  txid: string;
  amount: number;
  to: string;
  from: string;
  propertyId: number;
  /** The signed carrier transaction, kept so the exact same send can be rebroadcast. */
  hex: string;
};

/** Confirmed UTXOs at an address, used to pay the carrier transaction's fee. */
async function carrierUtxos(address: string): Promise<Utxo[]> {
  const scan = await scanAddressUtxos("txc", [address]);
  if (!scan) throw new Error("Could not read the funding UTXOs for the Omni carrier transaction");
  return scan.utxos
    .map((u) => ({
      txid: u.txid,
      vout: u.vout,
      scriptPubKey: u.scriptPubKey,
      amount: u.amount,
      height: u.height,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Omni "simple send": the node builds the class-C carrier transaction
 * (OP_RETURN payload + reference output + change), we sign it locally and
 * broadcast. Requires a small TXC balance at `fromAddress` for the miner fee.
 */
export async function omniSimpleSend(params: OmniSendParams): Promise<OmniSendResult> {
  const propertyId = params.propertyId ?? TSD_PROPERTY_ID;
  if (!isValidTxcAddress(params.toAddress)) {
    throw new Error(`Not a valid TEXITcoin address: ${params.toAddress}`);
  }
  if (!(params.amount > 0)) throw new Error("Amount must be positive");

  const utxos = await carrierUtxos(params.fromAddress);
  if (!utxos.length) {
    throw new Error(
      `${params.fromAddress} holds no TXC — an Omni send needs a small TXC balance for the miner fee`,
    );
  }

  // Take just enough inputs to cover the fee; Omni carriers are tiny.
  const chosen: Utxo[] = [];
  let total = 0;
  for (const u of utxos) {
    chosen.push(u);
    total += u.amount;
    if (total >= OMNI_TX_FEE + 0.0001) break;
  }
  if (total < OMNI_TX_FEE) {
    throw new Error(
      `Insufficient TXC for the Omni miner fee: have ${total.toFixed(8)}, need ${OMNI_TX_FEE}`,
    );
  }

  const amountStr = params.amount.toFixed(8);
  const payload = await rpc<string>("txc", "omni_createpayload_simplesend", [
    propertyId,
    amountStr,
  ]);

  let raw = await rpc<string>("txc", "createrawtransaction", [
    chosen.map((u) => ({ txid: u.txid, vout: u.vout })),
    [],
  ]);
  raw = await rpc<string>("txc", "omni_createrawtx_opreturn", [raw, payload]);
  raw = await rpc<string>("txc", "omni_createrawtx_reference", [raw, params.toAddress]);
  raw = await rpc<string>("txc", "omni_createrawtx_change", [
    raw,
    chosen.map((u) => ({
      txid: u.txid,
      vout: u.vout,
      scriptPubKey: u.scriptPubKey,
      value: u.amount,
    })),
    params.fromAddress,
    OMNI_TX_FEE,
  ]);

  const prevScripts: Record<string, string> = {};
  for (const u of chosen) prevScripts[`${u.txid}:${u.vout}`] = u.scriptPubKey;
  const signed = signRawTxWithKey(raw, params.privateKeyHex, prevScripts);

  const accept = await tryRpc<Array<{ allowed: boolean; "reject-reason"?: string }>>(
    "txc",
    "testmempoolaccept",
    [[signed.hex]],
  );
  if (accept && accept[0] && !accept[0].allowed) {
    throw new Error(`The node rejected the TSD transfer: ${accept[0]["reject-reason"] ?? "unknown"}`);
  }

  if (params.beforeBroadcast) await params.beforeBroadcast(signed.txid);
  const txid = await rpc<string>("txc", "sendrawtransaction", [signed.hex]);
  return { txid, amount: params.amount, to: params.toAddress, from: params.fromAddress, propertyId, hex: signed.hex };
}

/** The node's Omni lookups are wallet-scoped RPCs; the wallet name is a finished value, safe to keep. */
let omniWalletPath: string | null = null;
async function omniPath(): Promise<string> {
  if (omniWalletPath) return omniWalletPath;
  const w = await rpc<string[]>("txc", "listwallets", []);
  if (!w.length) throw new Error("The TEXITcoin node has no wallet loaded for Omni lookups");
  omniWalletPath = `/wallet/${encodeURIComponent(w[0]!)}`;
  return omniWalletPath;
}

/**
 * Confirmation depth of an Omni transaction, plus whether Omni accepted it.
 * `found`: true = the node knows it, false = the node answered "no such transaction",
 * null = the node didn't answer (never read as "gone").
 */
export async function fetchOmniTx(txid: string): Promise<{
  confirmations: number | null;
  valid: boolean | null;
  invalidReason: string | null;
  found: boolean | null;
} > {
  try {
    const tx = await rpc<{ confirmations?: number; valid?: boolean; invalidreason?: string }>(
      "txc", "omni_gettransaction", [txid], 12_000, await omniPath(),
    );
    return { confirmations: tx.confirmations ?? 0, valid: tx.valid ?? null, invalidReason: tx.invalidreason ?? null, found: true };
  } catch (e) {
    const code = (e as { code?: number }).code;
    if (code === -5) return { confirmations: null, valid: null, invalidReason: null, found: false };
    if (code === -18 || code === -19) omniWalletPath = null; // wallet unloaded/renamed: look it up again next time
    console.error("[omni] gettransaction", (e as Error).message);
    return { confirmations: null, valid: null, invalidReason: null, found: null };
  }
}
