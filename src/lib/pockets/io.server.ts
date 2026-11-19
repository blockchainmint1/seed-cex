/**
 * Read-only network access for the newer pocket coins (no sending here yet).
 * DOGE/BCH/ZEC/DASH: NowNodes Blockbook (same key as Litecoin). XRP, TRON, Solana,
 * Cosmos: paid providers first (nodes.server.ts), public servers as backup. Cardano:
 * NowNodes Rosetta, then Koios. THORChain (RUNE): public nodes (no paid provider serves it). Monero
 * isn't here: reading it needs a private view-key scan Seeds doesn't run. Every function returns
 * null instead of throwing so a down network never breaks the Profile page.
 */
import type { PocketCoin } from "./coins";
import { cardanoRosetta, nodeEndpoints, type NodeEndpoint } from "@/lib/nodes.server";

export type ExtraCoin = Extract<PocketCoin, "DOGE" | "BCH" | "ZEC" | "XRP" | "TRX" | "SOL" | "DASH" | "ATOM" | "RUNE" | "ADA">;
export const EXTRA_COINS: ExtraCoin[] = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL", "DASH", "ATOM", "RUNE", "ADA"];

const BOOK: Record<"DOGE" | "BCH" | "ZEC" | "DASH", string> = {
  DOGE: "https://dogebook.nownodes.io/api/v2",
  BCH: "https://bchbook.nownodes.io/api/v2",
  ZEC: "https://zecbook.nownodes.io/api/v2",
  DASH: "https://dashbook.nownodes.io/api/v2",
};
const THORNODE = ["https://gateway.liquify.com/chain/thorchain_api", "https://thorchain.ibs.team/api", "https://api-thorchain.rorcual.xyz"]; // same public nodes the swap router reads
const KOIOS = ["https://api.koios.rest/api/v1"];
const asPublic = (urls: string[]): NodeEndpoint[] => urls.map((url) => ({ url, headers: {}, provider: "public" }));
const DECIMALS: Record<ExtraCoin, number> = { DOGE: 8, BCH: 8, ZEC: 8, XRP: 6, TRX: 6, SOL: 9, DASH: 8, ATOM: 6, RUNE: 8, ADA: 6 };
const UA = { "User-Agent": "seeds-exchange/1.0", accept: "application/json" };

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
    if (!res.ok) { console.error(`[pockets] ${new URL(url).host} ${res.status}`); return null; }
    return (await res.json()) as T;
  } catch (err) {
    // Name only: an error message could echo the address, and Alchemy's key lives in it.
    console.error(`[pockets] ${new URL(url).host} failed: ${err instanceof Error ? err.name : "error"}`);
    return null;
  }
}

async function firstOk<T>(eps: NodeEndpoint[], call: (u: string, headers: Record<string, string>) => Promise<T | null>): Promise<T | null> {
  for (const e of eps) { const r = await call(e.url, e.headers); if (r !== null) return r; }
  return null;
}

const rpc = (method: string, params: unknown, headers: Record<string, string>) => ({
  method: "POST", headers: { ...UA, ...headers, "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
});

function toUnits(raw: bigint, coin: ExtraCoin): number {
  return Number(raw) / 10 ** DECIMALS[coin];
}

/** Confirmed balance in whole coins, or null when the network can't be read. */
export async function fetchExtraBalance(coin: ExtraCoin, address: string): Promise<number | null> {
  if (coin === "ATOM" || coin === "RUNE") {
    const [eps, denom] = coin === "ATOM" ? [nodeEndpoints("cosmos"), "uatom"] : [asPublic(THORNODE), "rune"];
    const r = await firstOk(eps, (u, h) => getJson<{ balance?: { amount?: string } }>(
      `${u}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}/by_denom?denom=${denom}`, { headers: { ...UA, ...h } }));
    return r?.balance ? toUnits(BigInt(r.balance.amount ?? "0"), coin) : null;
  }
  if (coin === "ADA") {
    const ros = cardanoRosetta();
    if (ros) {
      const r = await getJson<{ balances?: { value: string; currency?: { symbol?: string } }[] }>(`${ros.url}/account/balance`, {
        method: "POST", headers: { ...UA, ...ros.headers },
        body: JSON.stringify({ network_identifier: { blockchain: "cardano", network: "mainnet" }, account_identifier: { address } }),
      });
      const ada = r?.balances?.find((b) => !b.currency?.symbol || b.currency.symbol === "ADA");
      if (r?.balances) return toUnits(BigInt(ada?.value ?? "0"), coin);
    }
    const r = await firstOk(asPublic(KOIOS), (u) => getJson<{ balance?: string }[]>(`${u}/address_info`,
      { method: "POST", headers: { ...UA, "content-type": "application/json" }, body: JSON.stringify({ _addresses: [address] }) }));
    if (!r) return null;
    return toUnits(BigInt(r[0]?.balance ?? "0"), coin); // [] = address never used on-chain
  }
  if (coin === "DOGE" || coin === "BCH" || coin === "ZEC" || coin === "DASH") {
    const key = process.env.NOWNODES_API_KEY;
    if (!key) return null;
    const r = await getJson<{ balance?: string }>(`${BOOK[coin]}/address/${encodeURIComponent(address)}?details=basic`, { headers: { ...UA, "api-key": key } });
    return r?.balance !== undefined ? toUnits(BigInt(r.balance), coin) : null;
  }
  if (coin === "XRP") {
    const r = await firstOk(nodeEndpoints("xrp"), (u, h) => getJson<{ result?: { status?: string; error?: string; account_data?: { Balance: string } } }>(u,
      { method: "POST", headers: { ...UA, ...h, "content-type": "application/json" }, body: JSON.stringify({ method: "account_info", params: [{ account: address, ledger_index: "validated" }] }) }));
    if (!r?.result) return null;
    if (r.result.error === "actNotFound") return 0; // unfunded accounts don't exist on-ledger yet
    return r.result.account_data ? toUnits(BigInt(r.result.account_data.Balance), coin) : null;
  }
  if (coin === "TRX") {
    const r = await firstOk(nodeEndpoints("tron"), (u, h) => getJson<{ balance?: number; address?: string; Error?: string }>(`${u}/wallet/getaccount`,
      { method: "POST", headers: { ...UA, ...h, "content-type": "application/json" }, body: JSON.stringify({ address, visible: true }) }));
    if (!r || r.Error) return null;
    return toUnits(BigInt(r.balance ?? 0), coin); // {} = never-activated account
  }
  const r = await firstOk(nodeEndpoints("solana"), (u, h) => getJson<{ result?: { value: number } }>(u, rpc("getBalance", [address, { commitment: "finalized" }], h)));
  return r?.result ? toUnits(BigInt(r.result.value), coin) : null;
}
