/**
 * ERC-20 tokens on Ethereum and Base shown on the Balances page (pure, tested).
 * Listed = every token Seeds can swap on those networks (the swap list) that isn't already a
 * main balance row, plus any other token the pocket actually holds (found by Seeds' paid node).
 * Found tokens are display only, labelled "not checked by Seeds", and junk-looking names are hidden.
 */
import { SWAP_COINS } from "@/lib/xchain/assets";

export type TokenChain = "ethereum" | "base";
export type ListedToken = { chain: TokenChain; contract: string; symbol: string; name: string; swappable: boolean };
export type HeldToken = { chain: TokenChain; contract: string; symbol: string | null; name: string | null; decimals: number | null; raw: string };
export type TokenRow = ListedToken & { balance: number | null };

/** Tokens that already have their own row (USDC, USDT, HEX). */
const MAIN_ROWS = new Set([
  "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "ethereum:0xdac17f958d2ee523a2206206994597c13d831ec7",
  "ethereum:0x2b591e99afe9f32eaa6214f7b7629768c40eeb39",
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "base:0xfde4c96c8593536e31f229ea8f37b2ada2699bb2",
]);

const key = (chain: string, contract: string) => `${chain}:${contract.toLowerCase()}`;

/** Swap-list tokens on Ethereum and Base. */
export const LISTED_TOKENS: ListedToken[] = SWAP_COINS.flatMap((c) => {
  const m = /^(ETH|BASE)\.[^-]+-(0X[0-9A-F]{40})$/.exec(c.asset);
  if (!m) return [];
  const chain: TokenChain = m[1] === "ETH" ? "ethereum" : "base";
  const contract = m[2]!.toLowerCase().replace(/^0x/, "0x");
  if (MAIN_ROWS.has(key(chain, contract))) return [];
  return [{ chain, contract, symbol: c.symbol, name: c.name, swappable: true }];
});

/** A held token's name looks like spam (links, "claim", odd characters) or is unreadable. */
export function looksLikeJunk(t: Pick<HeldToken, "symbol" | "name" | "decimals">): boolean {
  if (!t.symbol || t.decimals == null || t.decimals < 0 || t.decimals > 36) return true;
  const both = `${t.symbol} ${t.name ?? ""}`;
  if (t.symbol.length > 11 || !/^[A-Za-z0-9.$_-]+$/.test(t.symbol)) return true;
  return /https?:|www\.|\.com|\.io|\.org|\.xyz|claim|visit|reward|airdrop|\bt\.me\b/i.test(both);
}

export function tokenUnits(raw: string, decimals: number): number {
  const v = /^0x[0-9a-f]+$/i.test(raw) ? BigInt(raw) : /^\d+$/.test(raw) ? BigInt(raw) : 0n;
  return Number(v) / 10 ** decimals;
}

/**
 * Rows to show: every listed token (0 when not held, null when the network couldn't be read),
 * then held tokens that aren't listed or junk. `held` null = that network couldn't be read.
 */
export function tokenRows(held: Partial<Record<TokenChain, HeldToken[] | null>>): TokenRow[] {
  const byKey = new Map<string, HeldToken>();
  for (const ch of ["ethereum", "base"] as const) for (const h of held[ch] ?? []) byKey.set(key(ch, h.contract), h);
  const out: TokenRow[] = LISTED_TOKENS.map((t) => {
    if (held[t.chain] == null) return { ...t, balance: null };
    const h = byKey.get(key(t.chain, t.contract));
    return { ...t, balance: h && h.decimals != null ? tokenUnits(h.raw, h.decimals) : 0 };
  });
  const listed = new Set(LISTED_TOKENS.map((t) => key(t.chain, t.contract)));
  for (const [k, h] of byKey) {
    if (listed.has(k) || MAIN_ROWS.has(k) || looksLikeJunk(h)) continue;
    const balance = tokenUnits(h.raw, h.decimals!);
    if (!(balance > 0)) continue;
    out.push({ chain: h.chain, contract: h.contract.toLowerCase(), symbol: h.symbol!, name: h.name ?? h.symbol!, swappable: false, balance });
  }
  return out;
}
