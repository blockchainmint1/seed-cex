import { describe, expect, test } from "bun:test";
import { assetLane, dexLanes, ETH_LANE, hypeChainLanes, laneBlocker, MAX_OPEN_SWAPS, relayLanes, stonLanes, TON_LANE, twoStepLanes, USDT_TON_LANE } from "./lanes";

describe("several swaps at once — lanes", () => {
  test("TSD has its own accounting and never takes a lane", () => {
    expect(assetLane("TSD")).toBeNull();
    expect(assetLane("ETH.ETH")).toBe(ETH_LANE);
    expect(assetLane("ETH.USDC-0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48")).toBe("ETH:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  });
  test("two chains through ETH can't overlap while both need ETH", () => {
    const a = { kind: "hype_chain" as const, lanes: hypeChainLanes("to_ton_usdt", "leg1", null) };
    const b = { kind: "hype_chain" as const, lanes: hypeChainLanes("to_hype", "awaiting_approval", null) };
    expect(laneBlocker(b, [a])).not.toBeNull();
  });
  test("once a chain is on its TON step, a chain to HYPE may start", () => {
    const a = { kind: "hype_chain" as const, lanes: hypeChainLanes("to_ton_usdt", "mid2", null) };
    expect(a.lanes).toEqual([TON_LANE, USDT_TON_LANE]);
    expect(laneBlocker({ kind: "hype_chain", lanes: hypeChainLanes("to_hype", "awaiting_approval", null) }, [a])).toBeNull();
  });
  test("a STON.fi swap waits while a chain is on its TON step", () => {
    const a = { kind: "hype_chain" as const, lanes: hypeChainLanes("to_ton_usdt", "leg3", null) };
    expect(laneBlocker({ kind: "ston", lanes: stonLanes() }, [a])).not.toBeNull();
  });
  test("TSD → BTC runs next to a chain to USD₮ on TON", () => {
    const a = { kind: "hype_chain" as const, lanes: hypeChainLanes("to_ton_usdt", "leg1", null) };
    expect(laneBlocker({ kind: "tsd", lanes: [assetLane("BTC.BTC")!] }, [a])).toBeNull();
  });
  test("TSD → ETH waits while a chain is counting arriving ETH", () => {
    const a = { kind: "hype_chain" as const, lanes: hypeChainLanes("to_ton", "leg1", null) };
    expect(laneBlocker({ kind: "tsd", lanes: [ETH_LANE] }, [a])).not.toBeNull();
  });
  test("exact-amount swaps may share coins with each other", () => {
    expect(laneBlocker({ kind: "tsd", lanes: [ETH_LANE] }, [{ kind: "send", lanes: [ETH_LANE] }])).toBeNull();
    expect(laneBlocker({ kind: "dex", lanes: dexLanes("base", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "0x1111111111111111111111111111111111111111") }, [{ kind: "tsd", lanes: ["BASE:ETH"] }])).toBeNull();
  });
  test("two two-step swaps with different middle coins can run together", () => {
    const a = { kind: "two_step" as const, lanes: twoStepLanes("base", "0x1111111111111111111111111111111111111111", "BTC:BTC", "BASE:ETH") };
    const b = { kind: "two_step" as const, lanes: twoStepLanes("ethereum", "0x2222222222222222222222222222222222222222", "DOGE:DOGE", ETH_LANE) };
    expect(laneBlocker(b, [a])).toBeNull();
    expect(laneBlocker({ kind: "relay", lanes: relayLanes("to_hype") }, [b])).not.toBeNull();
  });
  test("at most 5 swaps open", () => {
    expect(MAX_OPEN_SWAPS).toBe(5);
    const open = Array.from({ length: 5 }, () => ({ kind: "tsd" as const, lanes: ["BTC:BTC"] }));
    expect(laneBlocker({ kind: "tsd", lanes: ["DOGE:DOGE"] }, open)).not.toBeNull();
    expect(laneBlocker({ kind: "tsd", lanes: ["DOGE:DOGE"] }, open.slice(1))).toBeNull();
  });
});
