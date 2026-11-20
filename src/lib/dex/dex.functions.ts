import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEX_NETWORK_IDS, DEX_NETWORKS, isAddress, isNative, NATIVE, tokenRisk, type DexNetwork, type TokenRisk } from "./venues";
import { BRIDGE_USDC_ETH, isTsdDex, MAX_SLIPPAGE_BPS, tsdPairProblem } from "./swap-rules";

const net = z.enum(DEX_NETWORK_IDS as unknown as [DexNetwork, ...DexNetwork[]]);
/** Audit 2026-11-19 L3: public lookups fan out to blockchain providers, so each connection is rate-limited. */
async function limitQuotes() {
  const { requireIpAllowance } = await import("@/lib/ip-rate.server");
  const { IP_LIMITS } = await import("@/lib/ip-rate");
  await requireIpAllowance("quote", IP_LIMITS.quote);
}

const tokenAddr = z.string().max(64).refine((a) => isAddress(a), "Not a coin address");

/** Find coins by name, symbol or pasted contract address on Ethereum, Base, BNB Chain and PulseChain. */
export const searchDexCoins = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ q: z.string().max(80), network: net.optional() }).parse(i))
  .handler(async ({ data }) => {
    await limitQuotes();
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
  /** TSD side: TSD Bridge converts TSD <-> Ethereum USDC; the pool swaps that USDC. */
  tsd: { side: "buy" | "sell"; usdc: number; bridgeFeeBps: number } | null;
  quotedAt: number;
};

/** Live price from every pool Seeds knows on that network, plus a sell-straight-back check. Read-only. */
export const quoteDexSwap = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ network: net, tokenIn: tokenAddr, tokenOut: tokenAddr, amount: z.string().regex(/^\d+(\.\d+)?$/).max(40) }).parse(i),
  )
  .handler(async ({ data }): Promise<DexQuote> => {
    await limitQuotes();
    const { fromUnits, quoteExactRoute, quoteRoutes, reverseRoute, toUnits, tokenInfo } = await import("./quote.server");
    const { tokenMarket } = await import("./market.server");
    if (data.tokenIn.toLowerCase() === data.tokenOut.toLowerCase()) throw new Error("Pick two different coins");
    const tsdProblem = tsdPairProblem(data.network, data.tokenIn, data.tokenOut);
    if (tsdProblem) throw new Error(tsdProblem);
    const side = isTsdDex(data.tokenIn) ? "buy" : isTsdDex(data.tokenOut) ? "sell" : null;
    // The pool step trades USDC in place of TSD.
    const legIn = side === "buy" ? BRIDGE_USDC_ETH : data.tokenIn;
    const legOut = side === "sell" ? BRIDGE_USDC_ETH : data.tokenOut;
    const tsdTok = { address: data.tokenIn, symbol: "TSD", name: "TSD", decimals: 8 };
    const [ia0, ib0, ma, mb] = await Promise.all([
      side === "buy" ? Promise.resolve(tsdTok) : tokenInfo(data.network, data.tokenIn),
      side === "sell" ? Promise.resolve({ ...tsdTok, address: data.tokenOut }) : tokenInfo(data.network, data.tokenOut),
      // A TSD side trades as Ethereum USDC in the pool, so the pool risk is judged on USDC.
      tokenMarket(data.network, legIn),
      tokenMarket(data.network, legOut),
    ]);
    const ia = ia0, ib = ib0;
    if (!ia || !ib) throw new Error(`That address isn't a coin on ${DEX_NETWORKS[data.network].name}`);
    let bridgeFeeBps = 0;
    if (side) {
      const { bridgeSettings, tsdBridgeConfigured } = await import("@/lib/xchain/tsd-bridge.server");
      if (!tsdBridgeConfigured()) throw new Error("TSD Bridge isn't connected.");
      const st = await bridgeSettings();
      if (!st.live) throw new Error("TSD Bridge is paused right now.");
      bridgeFeeBps = side === "buy" ? st.redeemFeeBps : st.mintFeeBps;
    }
    const { afterBridgeFeeUnits } = await import("./swap-rules");
    const amountIn = toUnits(data.amount, ia.decimals);
    if (amountIn <= 0n) throw new Error("Enter an amount above zero");
    const legInUnits = side === "buy" ? afterBridgeFeeUnits(toUnits(data.amount, 6), bridgeFeeBps) : amountIn;
    const routes = await quoteRoutes(data.network, legIn, legOut, legInUnits);
    const best = routes[0] ?? null;
    const back = best ? await quoteExactRoute(data.network, reverseRoute(best), best.amountOut) : null;
    const roundTripLoss = back === null ? null : Math.max(0, 1 - Number(back) / Number(legInUnits));
    // What the member ends with: the coin, or (sell to TSD) the USDC less the bridge fee.
    const finalUnits = !best ? 0n : side === "sell" ? afterBridgeFeeUnits(best.amountOut, bridgeFeeBps) : best.amountOut;
    const finalDecimals = side === "sell" ? 6 : ib.decimals;
    const inNum = fromUnits(amountIn, ia.decimals);
    const outNum = best ? fromUnits(finalUnits, finalDecimals) : 0;
    const valueInUsd = side === "buy" ? inNum : ma?.priceUsd != null ? inNum * ma.priceUsd : null;
    const valueOutUsd = side === "sell" ? (best ? outNum : null) : mb?.priceUsd != null && best ? outNum * mb.priceUsd : null;
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
        ? { venueId: best.venueId, venueName: best.venueName, hops: best.path.length - 1, via: viaOf(best.path), amountOut: outNum, amountOutUnits: finalUnits.toString() }
        : null,
      others: (() => {
        // Best price per venue, excluding the winner, for the comparison list.
        const seen = new Set<string>([best?.venueId ?? ""]);
        const out: DexQuote["others"] = [];
        for (const r of routes) {
          if (seen.has(r.venueId)) continue;
          seen.add(r.venueId);
          const u = side === "sell" ? afterBridgeFeeUnits(r.amountOut, bridgeFeeBps) : r.amountOut;
          out.push({ venueName: r.venueName, hops: r.path.length - 1, amountOut: fromUnits(u, finalDecimals) });
        }
        return out;
      })(),
      routesChecked: routes.length,
      valueInUsd,
      valueOutUsd,
      roundTripLoss,
      risk,
      tsd: side && best ? { side, usdc: fromUnits(side === "buy" ? legInUnits : best.amountOut, 6), bridgeFeeBps } : null,
      quotedAt: Date.now(),
    };
  });

export { NATIVE };

/* ------------------------------ swapping (signed in) ------------------------------ */

const coinAddr = z.string().max(64).refine((a) => isAddress(a), "Not a coin address");

/** Signed-in: can I swap here, what's in my pocket for this coin, and my fee coin balance. */
export const getDexSwapContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ network: net, tokenIn: coinAddr }).parse(i))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const tester = await pilotTesterAccess(context as never);
    const { dexSwapContext } = await import("./swap.server");
    return dexSwapContext(context.userId, tester, data.network, data.tokenIn);
  });

/** Signed-in: ask for a swap from my own pocket. It waits for my Approve tap in Telegram. */
export const startDexSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      network: net,
      tokenIn: coinAddr,
      tokenOut: coinAddr,
      amount: z.string().regex(/^\d+(\.\d+)?$/).max(40),
      shownOut: z.number().positive(),
      slippageBps: z.number().int().min(10).max(MAX_SLIPPAGE_BPS),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const tester = await pilotTesterAccess(context as never);
    const { requestDexSwap } = await import("./swap.server");
    return requestDexSwap(context.userId, tester, data);
  });

/** Signed-in: my recent token swaps (moves open ones along first). */
export const getDexSwaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDexSwaps } = await import("./swap.server");
    return { swaps: await listDexSwaps(context.userId) };
  });

/** Signed-in: call off a swap that is still waiting for my Telegram tap. */
export const cancelMyDexSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { cancelDexSwap } = await import("./swap.server");
    await cancelDexSwap(context.userId, data.id);
    return { ok: true };
  });
