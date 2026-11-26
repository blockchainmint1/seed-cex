import { describe, expect, test } from "bun:test";
import { planSwap, type SwapSide } from "@/lib/swap/plan";
import { swapPairForCoinSymbol, swapPairForToken, swapPairForRow, sideFor } from "./swap-link";

/** The same words the swap page's URL accepts (src/routes/swap.tsx validateSearch). */
const toSide = (v: string): SwapSide =>
  v === "TSD" ? { kind: "tsd" } : v === "HYPE" ? { kind: "hype" } : v === "TON" ? { kind: "ton" } : v === "USDT_TON" ? { kind: "ton_usdt" } : { kind: "coin", id: v as never };

describe("balances Swap link", () => {
  for (const [symbol, address] of [
    ["wTXC", "0x9FC65df3997073B8551Ffd617154B5102fACbb88"],
    ["wISK", "0xFB38867D064Df981F159b886007F1273a346b0BB"],
    ["wZCU", "0x61b1F4D5db2436C089593828C26F21e25c4A9C9d"],
  ] as const) {
    test(`${symbol} main balance row preserves its pinned Ethereum swap route`, () => {
      const wrapped = sideFor(symbol, "ethereum");
      expect(wrapped?.side).toMatchObject({ kind: "token", network: "ethereum", address, symbol });
      expect(swapPairForRow(symbol, "ethereum", 0)).toEqual({ from: "TSD", to: symbol });
      expect(swapPairForRow(symbol, "ethereum", 1)).toEqual({ from: symbol, to: "TSD" });
      expect(sideFor(symbol, "base")).toBeNull();
      if (!wrapped) throw new Error("Missing wrapped side");
      expect(planSwap({ kind: "tsd" }, wrapped.side).options).toEqual([{ kind: "dex", network: "ethereum", tokenIn: "0x7e5d000000000000000000000000000000007e5d", tokenOut: address }]);
    });
  }
  test("a USD₮-on-TON row opens the form on TSD → USD₮ on TON", () => {
    expect(swapPairForRow("USDT", "ton", 0)).toEqual({ from: "TSD", to: "USDT_TON" });
  });

  test("USD₮ on TON stays on that pair even when you already hold some (it can't be sold yet)", () => {
    expect(swapPairForRow("USDT", "ton", 5)).toEqual({ from: "TSD", to: "USDT_TON" });
  });

  test("a TON row with nothing yet offers buying TON with TSD", () => {
    expect(swapPairForRow("TON", "ton", 0)).toEqual({ from: "TSD", to: "TON" });
  });

  test("a TON row you hold offers TON's only swap: into USD₮ on TON", () => {
    expect(swapPairForRow("TON", "ton", 3)).toEqual({ from: "TON", to: "USDT_TON" });
  });

  test("holding a coin offers selling it back to TSD", () => {
    expect(swapPairForRow("BTC", "btc", 0.5)).toEqual({ from: "BTC", to: "TSD" });
    expect(swapPairForRow("HYPE", "hyperevm", 2)).toEqual({ from: "HYPE", to: "TSD" });
  });

  test("no balance yet offers buying it with TSD", () => {
    expect(swapPairForRow("BTC", "btc", 0)).toEqual({ from: "TSD", to: "BTC" });
    expect(swapPairForRow("HYPE", "hyperevm", 0)).toEqual({ from: "TSD", to: "HYPE" });
    expect(swapPairForRow("ETH", "ethereum", 0)).toEqual({ from: "TSD", to: "ETH" });
    expect(swapPairForRow("LTC", "ltc", 0)).toEqual({ from: "TSD", to: "LTC" });
  });

  test("the TSD row itself gets no pair (nothing to sell into TSD)", () => {
    expect(swapPairForRow("TSD", "txc-omni", 100)).toBeNull();
  });

  test("coins Seeds can't swap get no pair", () => {
    for (const [symbol, net] of [["TXC", "txc"], ["ISK", "isk"], ["ZCU", "zcu"], ["XMR", "xmr"]] as const) {
      expect(swapPairForRow(symbol, net, 5)).toBeNull();
    }
    expect(sideFor("HEX", "ethereum")).toBeNull();
    expect(sideFor("pHEX", "pulsechain")).toBeNull();
    expect(sideFor("XLM", "xlm")).toBeNull();
  });

  test("a token row only gets a pair when Seeds can plan it", () => {
    // AAVE is on the swap list but has no TSD route, so its row keeps the plain Swap page.
    expect(swapPairForToken("ethereum", "0x7fc66500c84a768b601b22902396001d85125869", 0)).toBeNull();
    expect(swapPairForToken("ethereum", "0x0000000000000000000000000000000000000001", 0)).toBeNull();
  });

  test("a stranded-coin note offers the coin's own way back to TSD", () => {
    expect(swapPairForCoinSymbol("DOGE")).toEqual({ from: "DOGE", to: "TSD" });
    expect(swapPairForCoinSymbol("HEX")).toBeNull();
  });

  test("every pair the link offers is one the swap form can actually quote", () => {
    const rows: [string, string, number][] = [
      ["BTC", "btc", 1], ["BTC", "btc", 0], ["ETH", "ethereum", 0], ["ETH", "ethereum", 4],
      ["LTC", "ltc", 0], ["XRP", "xrp", 0], ["SOL", "sol", 2], ["DOGE", "doge", 2],
      ["HYPE", "hyperevm", 0], ["HYPE", "hyperevm", 1], ["TON", "ton", 0], ["TON", "ton", 2],
      ["USDT", "ethereum", 0], ["USDC", "ethereum", 1], ["TRX", "trx", 0], ["BCH", "bch", 0], ["USDT", "ton", 0],
    ];
    for (const [symbol, net, held] of rows) {
      const pair = swapPairForRow(symbol, net, held);
      expect(pair, `${symbol}/${net} held ${held}`).not.toBeNull();
      const plan = planSwap(toSide(pair!.from), toSide(pair!.to));
      expect(plan.options.length, `${symbol}/${net} held ${held}: ${plan.problem}`).toBeGreaterThan(0);
    }
  });

  test("TSD → USD₮ on TON is one tap: a three-step chain through ETH and TON", () => {
    const plan = planSwap({ kind: "tsd" }, { kind: "ton_usdt" });
    expect(plan.options).toEqual([{ kind: "hype_chain", direction: "to_ton_usdt", via: "tsd", coin: "TSD" }]);
  });
});
