/**
 * Prices straight from the pool contracts (Uniswap, PancakeSwap, PulseX) via one
 * Multicall3 eth_call per quote. Read-only: nothing here signs or sends.
 */
import type { ChainId } from "@/lib/chains";
import {
  decAggregate3, decString, decUint, decUintArray, encAggregate3, encDecimals, encGetAmountsOut, encName,
  encQuoteExactInput, encQuoteExactInputSingle, encSymbol, v3Path,
} from "./abi";
import { DEX_NETWORKS, MULTICALL3, candidatePaths, isNative, poolToken, sameAddr, type DexNetwork, type Venue } from "./venues";

export type TokenInfo = { address: string; symbol: string; name: string; decimals: number };

export type DexRoute = {
  venueId: string;
  venueName: string;
  kind: "v2" | "v3";
  /** Pool tokens, wrapped coin in place of the native one. */
  path: string[];
  /** v3 only. */
  fees: number[];
  amountOut: bigint;
};

async function ethCall(net: DexNetwork, to: string, data: string): Promise<string> {
  const { evmRpc } = await import("@/lib/evm.server");
  const r = await evmRpc<string>(net as ChainId, "eth_call", [{ to, data }, "latest"]);
  if (typeof r !== "string") throw new Error(`${DEX_NETWORKS[net].name} didn't answer`);
  return r;
}

async function multicall(net: DexNetwork, calls: Array<{ target: string; data: string }>) {
  if (!calls.length) return [];
  return decAggregate3(await ethCall(net, MULTICALL3, encAggregate3(calls)));
}

const infoCache = new Map<string, TokenInfo>();

/** Symbol / name / decimals read from the coin's own contract. Null if it doesn't look like a token. */
export async function tokenInfo(net: DexNetwork, address: string): Promise<TokenInfo | null> {
  if (isNative(address)) {
    const s = DEX_NETWORKS[net].nativeSymbol;
    return { address, symbol: s, name: s, decimals: 18 };
  }
  const key = `${net}:${address.toLowerCase()}`;
  const hit = infoCache.get(key);
  if (hit) return hit;
  try {
    const [d, s, n] = await multicall(net, [
      { target: address, data: encDecimals() },
      { target: address, data: encSymbol() },
      { target: address, data: encName() },
    ]);
    if (!d?.ok || d.data.length < 66) return null;
    const decimals = Number(decUint(d.data));
    if (!Number.isInteger(decimals) || decimals > 36) return null;
    const info = { address, decimals, symbol: (s?.ok && decString(s.data)) || "?", name: (n?.ok && decString(n.data)) || "" };
    infoCache.set(key, info);
    return info;
  } catch {
    return null;
  }
}

function v3FeeCombos(v: Venue, hops: number): number[][] {
  const all = [...(v.fees ?? [])];
  if (hops === 1) return all.map((f) => [f]);
  const common = all.filter((f) => f >= 500); // skip 0.01% pools on two-hop legs
  return common.flatMap((a) => common.map((b) => [a, b]));
}

type Probe = { venue: Venue; path: string[]; fees: number[]; target: string; data: string };

function probesFor(net: DexNetwork, tokenIn: string, tokenOut: string, amountIn: bigint): Probe[] {
  const paths = candidatePaths(net, tokenIn, tokenOut);
  const probes: Probe[] = [];
  for (const venue of DEX_NETWORKS[net].venues) {
    for (const path of paths) {
      if (venue.kind === "v2") {
        probes.push({ venue, path, fees: [], target: venue.router, data: encGetAmountsOut(amountIn, path) });
      } else {
        for (const fees of v3FeeCombos(venue, path.length - 1)) {
          const data = path.length === 2
            ? encQuoteExactInputSingle(path[0], path[1], amountIn, fees[0])
            : encQuoteExactInput(v3Path(path, fees), amountIn);
          probes.push({ venue, path, fees, target: venue.quoter as string, data });
        }
      }
    }
  }
  return probes;
}

/** Every route that returned a price, best first. */
export async function quoteRoutes(net: DexNetwork, tokenIn: string, tokenOut: string, amountIn: bigint): Promise<DexRoute[]> {
  if (amountIn <= 0n) return [];
  const probes = probesFor(net, tokenIn, tokenOut, amountIn);
  const res = await multicall(net, probes.map((p) => ({ target: p.target, data: p.data })));
  const routes: DexRoute[] = [];
  res.forEach((r, i) => {
    if (!r.ok || r.data.length < 66) return;
    const p = probes[i];
    try {
      const out = p.venue.kind === "v2" ? decUintArray(r.data).at(-1) ?? 0n : decUint(r.data);
      if (out > 0n) routes.push({ venueId: p.venue.id, venueName: p.venue.name, kind: p.venue.kind, path: p.path, fees: p.fees, amountOut: out });
    } catch {
      /* malformed answer: skip */
    }
  });
  return routes.sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));
}

/** Quote one exact route (used for the sell-back check and for re-quoting before a send). */
export async function quoteExactRoute(net: DexNetwork, r: Pick<DexRoute, "venueId" | "kind" | "path" | "fees">, amountIn: bigint): Promise<bigint | null> {
  const venue = DEX_NETWORKS[net].venues.find((v) => v.id === r.venueId);
  if (!venue || amountIn <= 0n) return null;
  try {
    if (venue.kind === "v2") return decUintArray(await ethCall(net, venue.router, encGetAmountsOut(amountIn, r.path))).at(-1) ?? null;
    const data = r.path.length === 2
      ? encQuoteExactInputSingle(r.path[0], r.path[1], amountIn, r.fees[0])
      : encQuoteExactInput(v3Path(r.path, r.fees), amountIn);
    return decUint(await ethCall(net, venue.quoter as string, data));
  } catch {
    return null;
  }
}

/** The same route, backwards. */
export function reverseRoute<T extends Pick<DexRoute, "path" | "fees">>(r: T): T {
  return { ...r, path: [...r.path].reverse(), fees: [...r.fees].reverse() };
}

export function toUnits(amount: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!m) throw new Error("Enter an amount like 12.5");
  const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
  return BigInt(m[1] + frac);
}

export function fromUnits(units: bigint, decimals: number): number {
  const s = units.toString().padStart(decimals + 1, "0");
  return Number(`${s.slice(0, s.length - decimals)}.${s.slice(s.length - decimals) || "0"}`);
}

export { poolToken, sameAddr };
