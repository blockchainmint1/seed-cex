import { describe, expect, test } from "bun:test";
import { agreedMinimum, bestIndex, coinForToken, dexTwin, floorAmount, normalizeSide, planSwap, twoStepMids, type SwapSide } from "./plan";
import { swapCoin } from "@/lib/xchain/assets";
import { NATIVE } from "@/lib/dex/venues";
import { TSD_DEX } from "@/lib/dex/swap-rules";

const PEPE = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const coin = (id: string): SwapSide => ({ kind: "coin", id });
const token = (network: "ethereum" | "base" | "bsc" | "pulsechain", address: string, symbol = "X"): SwapSide => ({ kind: "token", network, address, symbol });

describe("pool twins", () => {
  test("Ether is Ethereum's native coin; Base USDC is its contract", () => {
    expect(dexTwin(swapCoin("ETH")!)).toEqual({ network: "ethereum", address: NATIVE });
    expect(dexTwin(swapCoin("USDC.BASE")!)).toEqual({ network: "base", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" });
    expect(dexTwin(swapCoin("BTC")!)).toBeNull();
  });
  test("a listed token is the same coin", () => {
    expect(coinForToken("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")?.id).toBe("USDC");
    expect(normalizeSide(token("ethereum", TSD_DEX))).toEqual({ kind: "tsd" });
    expect(normalizeSide(token("ethereum", PEPE)).kind).toBe("token");
  });
});

describe("planSwap", () => {
  test("BTC → ETH goes through THORChain/Maya", () => {
    expect(planSwap(coin("BTC"), coin("ETH")).options).toEqual([{ kind: "xchain", from: "BTC", to: "ETH" }]);
  });
  test("ETH → USDC on Ethereum is offered both ways, so the better price can win", () => {
    const kinds = planSwap(coin("ETH"), coin("USDC")).options.map((o) => o.kind);
    expect(kinds).toEqual(["xchain", "dex"]);
  });
  test("ETH → PEPE is a pool swap", () => {
    expect(planSwap(coin("ETH"), token("ethereum", PEPE)).options).toEqual([{ kind: "dex", network: "ethereum", tokenIn: NATIVE, tokenOut: PEPE }]);
  });
  test("PEPE on Ethereum → Bitcoin is two steps through a plain Ethereum coin", () => {
    const p = planSwap(token("ethereum", PEPE, "PEPE"), coin("BTC"));
    expect(p.options).toHaveLength(1);
    const o = p.options[0]!;
    expect(o.kind).toBe("two");
    if (o.kind === "two") {
      expect(o.direction).toBe("dex_then_x");
      expect(o.mids).toContain("ETH");
      expect(o.mids).toContain("USDC");
      expect(o.mids.every((m) => ["ETH", "USDC", "USDT"].includes(m))).toBe(true);
    }
  });
  test("Bitcoin → a Base token is two steps landing in the pocket on Base", () => {
    const o = planSwap(coin("BTC"), token("base", AERO, "AERO")).options[0]!;
    expect(o.kind).toBe("two");
    if (o.kind === "two") {
      expect(o.direction).toBe("x_then_dex");
      expect(o.network).toBe("base");
      expect(o.mids).toEqual(expect.arrayContaining(["ETH.BASE"]));
    }
  });
  test("a token on Base can't start a two-step swap (Seeds sends into THORChain from Ethereum only)", () => {
    const p = planSwap(token("base", AERO), coin("BTC"));
    expect(p.options).toEqual([]);
    expect(p.problem).toMatch(/Ethereum only/);
  });
  test("PulseChain coins stay on PulseChain", () => {
    expect(planSwap(coin("BTC"), token("pulsechain", "0x95B303987A60C71504D99Aa1b13B4DA07b0790ab")).problem).toMatch(/PulseChain/);
  });
  test("tokens on two different pool networks need a coin in between", () => {
    expect(planSwap(token("ethereum", PEPE), token("base", AERO)).problem).toMatch(/different networks/);
  });
  test("TSD → BTC is a TSD Bridge route; TSD → PEPE is the Ethereum pool route", () => {
    expect(planSwap({ kind: "tsd" }, coin("BTC")).options).toEqual([{ kind: "tsd", direction: "buy", coin: "BTC" }]);
    expect(planSwap({ kind: "tsd" }, token("ethereum", PEPE)).options).toEqual([{ kind: "dex", network: "ethereum", tokenIn: TSD_DEX, tokenOut: PEPE }]);
  });
  test("TSD → ETH compares the bridge route with the pool route", () => {
    expect(planSwap({ kind: "tsd" }, coin("ETH")).options.map((o) => o.kind)).toEqual(["tsd", "dex"]);
  });
  test("TSD → USDC stays the plain bridge conversion", () => {
    expect(planSwap({ kind: "tsd" }, coin("USDC")).options).toEqual([{ kind: "tsd", direction: "buy", coin: "USDC" }]);
  });
  test("the same coin twice is refused, even under two names", () => {
    expect(planSwap(coin("ETH"), token("ethereum", NATIVE)).problem).toBe("Pick two different coins.");
  });
});

describe("two-step helpers", () => {
  test("the middle coin is never the coin being bought", () => {
    expect(twoStepMids("dex_then_x", "ethereum", swapCoin("ETH")!)).not.toContain("ETH");
  });
  test("agreed minimum = shown less price protection", () => {
    expect(agreedMinimum(100, 100)).toBe(99);
    expect(agreedMinimum(0, 100)).toBe(0);
  });
  test("best output wins; empty quotes are skipped", () => {
    expect(bestIndex([null, 5, 7, 7])).toBe(2);
    expect(bestIndex([null, 0])).toBeNull();
  });
  test("amounts handed on are rounded down, never up", () => {
    expect(floorAmount(1.23456789, 6)).toBe("1.234567");
    expect(floorAmount(0.1 + 0.2, 8)).toBe("0.3");
    expect(floorAmount(-1, 8)).toBe("0");
  });
});

describe("HYPE through Relay", () => {
  test("ETH → HYPE and HYPE → ETH go through Relay", () => {
    expect(planSwap(coin("ETH"), { kind: "hype" }).options).toEqual([{ kind: "relay", direction: "to_hype" }]);
    expect(planSwap({ kind: "hype" }, coin("ETH")).options).toEqual([{ kind: "relay", direction: "from_hype" }]);
  });
  test("HYPE with anything but ETH says to go through ETH", () => {
    const p = planSwap({ kind: "hype" }, coin("BTC"));
    expect(p.options).toEqual([]);
    expect(p.problem).toMatch(/ETH/);
    expect(planSwap({ kind: "tsd" }, { kind: "hype" }).options).toEqual([]);
  });
});
