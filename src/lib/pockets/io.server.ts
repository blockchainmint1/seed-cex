/**
 * Read-only network access for the newer pocket coins (no sending here yet).
 * DOGE/BCH/ZEC/DASH: NowNodes Blockbook (same key as Litecoin). XRP, TRON, Solana,
 * Cosmos: paid providers first (nodes.server.ts), public servers as backup. Cardano:
 * NowNodes Rosetta, then Koios. THORChain (RUNE): Liquify paid first, public nodes as backup (thornodeEndpoints). Monero
 * isn't here: reading it needs a private view-key scan Seeds doesn't run. Every function returns
 * null instead of throwing so a down network never breaks the Profile page.
 */
import type { PocketCoin } from "./coins";
import { cardanoRosetta, nodeEndpoints, thornodeEndpoints, type NodeEndpoint } from "@/lib/nodes.server";

export type ExtraCoin = Extract<PocketCoin, "DOGE" | "BCH" | "ZEC" | "XRP" | "TRX" | "SOL" | "DASH" | "ATOM" | "RUNE" | "ADA" | "XLM" | "TON" | "SUI">;
export const EXTRA_COINS: ExtraCoin[] = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL", "DASH", "ATOM", "RUNE", "ADA", "XLM", "TON", "SUI"];

const BOOK: Record<"DOGE" | "BCH" | "ZEC" | "DASH", string> = {
  DOGE: "https://dogebook.nownodes.io/api/v2",
  BCH: "https://bchbook.nownodes.io/api/v2",
  ZEC: "https://zecbook.nownodes.io/api/v2",
  DASH: "https://dashbook.nownodes.io/api/v2",
};
const KOIOS = ["https://api.koios.rest/api/v1"];
const asPublic = (urls: string[]): NodeEndpoint[] => urls.map((url) => ({ url, headers: {}, provider: "public" }));
const DECIMALS: Record<ExtraCoin, number> = { DOGE: 8, BCH: 8, ZEC: 8, XRP: 6, TRX: 6, SOL: 9, DASH: 8, ATOM: 6, RUNE: 8, ADA: 6, XLM: 7, TON: 9, SUI: 9 };
const HORIZON = ["https://horizon.stellar.org", "https://horizon.stellar.lobstr.co"];
const SUI_GRAPHQL = "https://graphql.mainnet.sui.io/graphql";
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

type BookCoin = keyof typeof BOOK;
const isBookCoin = (c: ExtraCoin): c is BookCoin => c in BOOK;

/** Blockbook's confirmed balance, plus coins on their way when it reports waiting transactions. */
async function bookReading(coin: BookCoin, address: string, withArriving: boolean): Promise<{ balance: number; arriving: number } | null> {
  const key = process.env.NOWNODES_API_KEY;
  if (!key) return null;
  const headers = { ...UA, "api-key": key };
  const r = await getJson<{ balance?: string; unconfirmedTxs?: number }>(`${BOOK[coin]}/address/${encodeURIComponent(address)}?details=basic`, { headers });
  if (r?.balance === undefined) return null;
  let arriving = 0;
  if (withArriving && Number(r.unconfirmedTxs ?? 0) > 0) {
    const { blockbookArriving } = await import("@/lib/account/arriving.server");
    arriving = await blockbookArriving(BOOK[coin], headers, address);
  }
  return { balance: toUnits(BigInt(r.balance), coin), arriving };
}

/**
 * Balance plus coins still waiting for a block (`arriving`, only for the grey note —
 * account/arriving.ts). Coins whose networks settle in seconds (XRP, TRX, SOL, ATOM,
 * RUNE, ADA) report 0 arriving.
 */
export async function fetchExtraReading(coin: ExtraCoin, address: string): Promise<{ balance: number | null; arriving: number }> {
  if (isBookCoin(coin)) {
    const r = await bookReading(coin, address, true);
    return r ?? { balance: null, arriving: 0 };
  }
  return { balance: await fetchExtraBalance(coin, address), arriving: 0 };
}

/** Confirmed balance in whole coins, or null when the network can't be read. */
export async function fetchExtraBalance(coin: ExtraCoin, address: string): Promise<number | null> {
  if (coin === "ATOM" || coin === "RUNE") {
    const [eps, denom] = coin === "ATOM" ? [nodeEndpoints("cosmos"), "uatom"] : [thornodeEndpoints(), "rune"];
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
  if (isBookCoin(coin)) return (await bookReading(coin, address, false))?.balance ?? null;
  if (coin === "XLM") return stellarBalance(address);
  if (coin === "TON") return tonBalance(address);
  if (coin === "SUI") {
    // Sui retired public JSON-RPC; its GraphQL service answers balance reads.
    const j = await getJson<{ data?: { address?: { balance?: { totalBalance?: string } | null } | null } }>(SUI_GRAPHQL, {
      method: "POST", headers: { ...UA, "content-type": "application/json" },
      body: JSON.stringify({ query: "query($a: SuiAddress!){ address(address:$a){ balance(coinType:\"0x2::sui::SUI\"){ totalBalance } } }", variables: { a: address } }),
    });
    if (!j?.data) return null;
    return toUnits(BigInt(j.data.address?.balance?.totalBalance ?? "0"), coin);
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
  // A server that answers with an error (e.g. Alchemy "not enabled", rate limit) counts as no answer: ask the next one.
  const r = await firstOk(nodeEndpoints("solana"), async (u, h) => {
    const j = await getJson<{ result?: { value: number } }>(u, rpc("getBalance", [address, { commitment: "finalized" }], h));
    return j?.result ? j : null;
  });
  return r?.result ? toUnits(BigInt(r.result.value), coin) : null;
}

/** Stellar: native XLM from Horizon; an account that was never funded doesn't exist yet (404 = 0). */
async function stellarBalance(address: string): Promise<number | null> {
  for (const base of HORIZON) {
    try {
      const res = await fetch(`${base}/accounts/${encodeURIComponent(address)}`, { headers: UA, signal: AbortSignal.timeout(8000) });
      if (res.status === 404) return 0;
      if (!res.ok) continue;
      const j = (await res.json()) as { balances?: { asset_type: string; balance: string }[] };
      const native = j.balances?.find((b) => b.asset_type === "native");
      if (j.balances) return native ? Number(native.balance) : 0;
    } catch { console.error(`[pockets] ${new URL(base).host} failed`); }
  }
  return null;
}

/** TON: balance in nanotons (an undeployed W5 wallet can still hold coins). toncenter's free key lifts its ~1 req/s public limit; sent as a header so it never lands in a URL or log. */
async function tonBalance(address: string): Promise<number | null> {
  const key = process.env.TONCENTER_API_KEY;
  const headers = key ? { ...UA, "X-API-Key": key } : UA;
  const a = await getJson<{ ok?: boolean; result?: string }>(`https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`, { headers });
  if (a?.ok && a.result !== undefined) return toUnits(BigInt(a.result), "TON");
  const b = await getJson<{ balance?: number | string }>(`https://tonapi.io/v2/accounts/${encodeURIComponent(address)}`, { headers: UA });
  return b?.balance !== undefined ? toUnits(BigInt(b.balance), "TON") : null;
}
