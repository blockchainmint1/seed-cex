/**
 * Read-only network access for the newer pocket coins (no sending here yet).
 * DOGE/BCH/ZEC: NowNodes Blockbook (same key as Litecoin). XRP, TRON, Solana:
 * public JSON-RPC/HTTP endpoints with a fallback each. Every function returns
 * null instead of throwing so a down network never breaks the Profile page.
 */
import type { PocketCoin } from "./coins";

export type ExtraCoin = Extract<PocketCoin, "DOGE" | "BCH" | "ZEC" | "XRP" | "TRX" | "SOL">;
export const EXTRA_COINS: ExtraCoin[] = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL"];

const BOOK: Record<"DOGE" | "BCH" | "ZEC", string> = {
  DOGE: "https://dogebook.nownodes.io/api/v2",
  BCH: "https://bchbook.nownodes.io/api/v2",
  ZEC: "https://zecbook.nownodes.io/api/v2",
};
const XRP_RPC = ["https://xrplcluster.com", "https://s1.ripple.com:51234"];
const TRON_API = ["https://api.trongrid.io"];
const SOL_RPC = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const DECIMALS: Record<ExtraCoin, number> = { DOGE: 8, BCH: 8, ZEC: 8, XRP: 6, TRX: 6, SOL: 9 };
const UA = { "User-Agent": "seeds-exchange/1.0", accept: "application/json" };

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.error(`[pockets] ${new URL(url).host} ${res.status}`); return null; }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[pockets] ${new URL(url).host} failed`, err);
    return null;
  }
}

async function firstOk<T>(urls: string[], call: (u: string) => Promise<T | null>): Promise<T | null> {
  for (const u of urls) { const r = await call(u); if (r !== null) return r; }
  return null;
}

const rpc = (method: string, params: unknown) => ({
  method: "POST", headers: { ...UA, "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});

function toUnits(raw: bigint, coin: ExtraCoin): number {
  return Number(raw) / 10 ** DECIMALS[coin];
}

/** Confirmed balance in whole coins, or null when the network can't be read. */
export async function fetchExtraBalance(coin: ExtraCoin, address: string): Promise<number | null> {
  if (coin === "DOGE" || coin === "BCH" || coin === "ZEC") {
    const key = process.env.NOWNODES_API_KEY;
    if (!key) return null;
    const r = await getJson<{ balance?: string }>(`${BOOK[coin]}/address/${encodeURIComponent(address)}?details=basic`, { headers: { ...UA, "api-key": key } });
    return r?.balance !== undefined ? toUnits(BigInt(r.balance), coin) : null;
  }
  if (coin === "XRP") {
    const r = await firstOk(XRP_RPC, (u) => getJson<{ result?: { status?: string; error?: string; account_data?: { Balance: string } } }>(u,
      { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ method: "account_info", params: [{ account: address, ledger_index: "validated" }] }) }));
    if (!r?.result) return null;
    if (r.result.error === "actNotFound") return 0; // unfunded accounts don't exist on-ledger yet
    return r.result.account_data ? toUnits(BigInt(r.result.account_data.Balance), coin) : null;
  }
  if (coin === "TRX") {
    const r = await firstOk(TRON_API, (u) => getJson<{ balance?: number; address?: string }>(`${u}/wallet/getaccount`,
      { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ address, visible: true }) }));
    if (!r) return null;
    return toUnits(BigInt(r.balance ?? 0), coin); // {} = never-activated account
  }
  const r = await firstOk(SOL_RPC, (u) => getJson<{ result?: { value: number } }>(u, rpc("getBalance", [address, { commitment: "finalized" }])));
  return r?.result ? toUnits(BigInt(r.result.value), coin) : null;
}
