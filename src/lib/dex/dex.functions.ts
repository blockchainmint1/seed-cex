import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEX_NETWORK_IDS, DEX_NETWORKS, isAddress, isNative, NATIVE, tokenRisk, type DexNetwork, type TokenRisk } from "./venues";

const net = z.enum(DEX_NETWORK_IDS as unknown as [DexNetwork, ...DexNetwork[]]);
const tokenAddr = z.string().refine((a) => isAddress(a), "Not a coin address");

/** Find coins by name, symbol or pasted contract address on Ethereum, Base, BNB Chain and PulseChain. */
export const searchDexCoins = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ q: z.string().max(80), network: net.optional() }).parse(i))
  .handler(async ({ data }) => {
    const { searchDexTokens } = await import("./market.server");
    const rows = await searchDexTokens(data.q, data.network);
    if (rows.length || !isAddress(data.q.trim())) return rows;
    // Brand-new coin with no tracked pools yet: read it straight from its contract.
    const { tokenInfo } = await import("./quote.server");
    const nets = data.network ? [data.network] : [...DEX_NETWORK_IDS];
    const found = await Promise.all(nets.map(async (n) => {
      const t = await tokenInfo(n, data.q.trim());
      return t ? { network: n, address: t.address, symbol: t.symbol, name: t.name, priceUsd: null, liquidityUsd: null, volume24hUsd: null, ageDays: null, imageUrl: null, venues: [] as string[] } : null;
    }));
    return found.filter((x) => x !== null);
  });

export type DexQuote = {
  network: DexNetwork;
  tokenIn: { address: string; symbol: string; decimals: number; priceUsd: number | null };
  tokenOut: { address: string; symbol: string; decimals: number; priceUsd: number | null };
  amountIn: number;
  best: { venueId: string; venueName: string; hops: number; via: string | null; amountOut: number; amountOutUnits: string } | null;
  others: Array<{ venueName: string; hops: number; amountOut: number }>;
  routesChecked: number;
  valueInUsd: number | null;
  valueOutUsd: number | null;
  roundTripLoss: number | null;
  risk: TokenRisk;
  quotedAt: number;
};

/** Live price from every pool Seeds knows on that network, plus a sell-straight-back check. Read-only. */
export const quoteDexSwap = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ network: net, tokenIn: tokenAddr, tokenOut: tokenAddr, amount: z.string().regex(/^\d+(\.\d+)?$/).max(40) }).parse(i),
  )
  .handler(async ({ data }): Promise<DexQuote> => {
    const { fromUnits, quoteExactRoute, quoteRoutes, reverseRoute, toUnits, tokenInfo } = await import("./quote.server");
    const { tokenMarket } = await import("./market.server");
    if (data.tokenIn.toLowerCase() === data.tokenOut.toLowerCase()) throw new Error("Pick two different coins");
    const [ia, ib, ma, mb] = await Promise.all([
      tokenInfo(data.network, data.tokenIn),
      tokenInfo(data.network, data.tokenOut),
      tokenMarket(data.network, data.tokenIn),
      tokenMarket(data.network, data.tokenOut),
    ]);
    if (!ia || !ib) throw new Error(`That address isn't a coin on ${DEX_NETWORKS[data.network].name}`);
    const amountIn = toUnits(data.amount, ia.decimals);
    if (amountIn <= 0n) throw new Error("Enter an amount above zero");
    const routes = await quoteRoutes(data.network, data.tokenIn, data.tokenOut, amountIn);
    const best = routes[0] ?? null;
    const back = best ? await quoteExactRoute(data.network, reverseRoute(best), best.amountOut) : null;
    const roundTripLoss = back === null ? null : Math.max(0, 1 - Number(back) / Number(amountIn));

    const inNum = fromUnits(amountIn, ia.decimals);
    const outNum = best ? fromUnits(best.amountOut, ib.decimals) : 0;
    const valueInUsd = ma?.priceUsd != null ? inNum * ma.priceUsd : null;
    const valueOutUsd = mb?.priceUsd != null && best ? outNum * mb.priceUsd : null;
    const priceImpact = valueInUsd && valueOutUsd ? Math.max(0, 1 - valueOutUsd / valueInUsd) : null;

    // Judge the riskier of the two coins (the network's own coin is never the risky one).
    const sides = [isNative(data.tokenIn) ? undefined : ma, isNative(data.tokenOut) ? undefined : mb].filter((m) => m !== undefined);
    const untracked = sides.some((m) => m === null);
    const thinnest = sides.reduce<NonNullable<typeof ma> | null>(
      (acc, m) => (!m ? acc : !acc || (m.liquidityUsd ?? 0) < (acc.liquidityUsd ?? 0) ? m : acc),
      null,
    );
    const risk = best
      ? tokenRisk({
          liquidityUsd: untracked ? null : (thinnest?.liquidityUsd ?? ma?.liquidityUsd ?? null),
          volume24hUsd: thinnest?.volume24hUsd ?? null,
          ageDays: thinnest?.ageDays ?? null,
          roundTripLoss,
          priceImpact,
        })
      : { level: "danger" as const, reasons: ["No pool on this network trades these two coins."] };

    const sym = (a: string) =>
      a.toLowerCase() === DEX_NETWORKS[data.network].wrapped.toLowerCase() ? DEX_NETWORKS[data.network].nativeSymbol : null;
    const viaOf = (p: string[]) => (p.length > 2 ? sym(p[1]) ?? "USD stablecoin" : null);

    return {
      network: data.network,
      tokenIn: { address: data.tokenIn, symbol: ia.symbol, decimals: ia.decimals, priceUsd: ma?.priceUsd ?? null },
      tokenOut: { address: data.tokenOut, symbol: ib.symbol, decimals: ib.decimals, priceUsd: mb?.priceUsd ?? null },
      amountIn: inNum,
      best: best
        ? { venueId: best.venueId, venueName: best.venueName, hops: best.path.length - 1, via: viaOf(best.path), amountOut: outNum, amountOutUnits: best.amountOut.toString() }
        : null,
      others: (() => {
        // Best price per venue, excluding the winner, for the comparison list.
        const seen = new Set<string>([best?.venueId ?? ""]);
        const out: DexQuote["others"] = [];
        for (const r of routes) {
          if (seen.has(r.venueId)) continue;
          seen.add(r.venueId);
          out.push({ venueName: r.venueName, hops: r.path.length - 1, amountOut: fromUnits(r.amountOut, ib.decimals) });
        }
        return out;
      })(),
      routesChecked: routes.length,
      valueInUsd,
      valueOutUsd,
      roundTripLoss,
      risk,
      quotedAt: Date.now(),
    };
  });

export { NATIVE };
