/**
 * ERC-20 holdings on Ethereum and Base through Seeds' paid Alchemy node (display only).
 * Sends, swaps and set-asides never use this; they read token balances live elsewhere.
 */
import type { HeldToken, TokenChain } from "./erc-tokens";

const HOST: Record<TokenChain, string> = { ethereum: "eth-mainnet", base: "base-mainnet" };
const MAX_TOKENS = 60;

async function alchemy<T>(chain: TokenChain, method: string, params: unknown[]): Promise<T | null> {
  const key = process.env["ALCHEMY_KEY"];
  if (!key) return null;
  try {
    const r = await fetch(`https://${HOST[chain]}.g.alchemy.com/v2/${key}`, {
      method: "POST", redirect: "manual", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: T };
    return j.result ?? null;
  } catch {
    return null;
  }
}

/** Every ERC-20 with a non-zero balance at `address`, or null when the network couldn't be read. */
export async function fetchHeldTokens(chain: TokenChain, address: string): Promise<HeldToken[] | null> {
  const res = await alchemy<{ tokenBalances?: { contractAddress: string; tokenBalance: string | null }[] }>(chain, "alchemy_getTokenBalances", [address, "erc20"]);
  if (!res || !Array.isArray(res.tokenBalances)) return null;
  const held = res.tokenBalances.filter((t) => t.tokenBalance && /^0x[0-9a-f]+$/i.test(t.tokenBalance) && BigInt(t.tokenBalance) > 0n).slice(0, MAX_TOKENS);
  return Promise.all(held.map(async (t) => {
    const m = await alchemy<{ symbol?: string | null; name?: string | null; decimals?: number | null }>(chain, "alchemy_getTokenMetadata", [t.contractAddress]);
    return { chain, contract: t.contractAddress.toLowerCase(), symbol: m?.symbol ?? null, name: m?.name ?? null, decimals: m?.decimals ?? null, raw: t.tokenBalance! };
  }));
}
