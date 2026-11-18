import { describe, expect, test } from "bun:test";
import { DEX_NETWORKS, DEX_NETWORK_IDS, NATIVE, candidatePaths, isAddress, tokenRisk } from "./venues";
import { decAggregate3, decString, decUintArray, encAggregate3, encGetAmountsOut, encV2Swap, encV3ExactInputSingle, v3Path, word } from "./abi";
import { fromUnits, toUnits } from "./quote.server";

describe("pool registry", () => {
  test("every pool address is a well-formed address, v3 pools have a quoter", () => {
    for (const n of DEX_NETWORK_IDS) {
      const d = DEX_NETWORKS[n];
      expect(isAddress(d.wrapped)).toBe(true);
      for (const v of d.venues) {
        expect(isAddress(v.router)).toBe(true);
        if (v.kind === "v3") expect(isAddress(v.quoter)).toBe(true);
      }
    }
  });
  test("Uniswap on Ethereum and Base, PancakeSwap on BNB Chain, PulseX on PulseChain", () => {
    expect(DEX_NETWORKS.ethereum.venues.map((v) => v.dexId)).toEqual(["uniswap", "uniswap"]);
    expect(DEX_NETWORKS.base.venues.map((v) => v.dexId)).toEqual(["uniswap", "uniswap"]);
    expect(DEX_NETWORKS.bsc.venues.map((v) => v.dexId)).toEqual(["pancakeswap", "pancakeswap"]);
    expect(DEX_NETWORKS.pulsechain.venues.map((v) => v.dexId)).toEqual(["pulsex", "pulsex"]);
  });
  test("routes: native coin trades as its wrapped version, direct + through hubs, never through itself", () => {
    const usdc = DEX_NETWORKS.ethereum.hubs[0];
    const pepe = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
    const p = candidatePaths("ethereum", NATIVE, pepe);
    expect(p).toEqual([[DEX_NETWORKS.ethereum.wrapped, pepe], [DEX_NETWORKS.ethereum.wrapped, usdc, pepe]]);
    expect(candidatePaths("ethereum", NATIVE, DEX_NETWORKS.ethereum.wrapped)).toEqual([]);
  });
});

describe("encoding", () => {
  test("getAmountsOut calldata layout", () => {
    const a = "0x" + "11".repeat(20), b = "0x" + "22".repeat(20);
    const data = encGetAmountsOut(5n, [a, b]);
    expect(data.slice(0, 10)).toBe("0xd06ca61f");
    expect(data.length).toBe(10 + 64 * 5);
    expect(data.slice(10, 74)).toBe(word(5));
    expect(data.slice(74, 138)).toBe(word(64));
  });
  test("v3 path packs token + 3-byte fee + token", () => {
    const a = "0x" + "aa".repeat(20), b = "0x" + "bb".repeat(20);
    expect(v3Path([a, b], [3000])).toBe(`0x${"aa".repeat(20)}000bb8${"bb".repeat(20)}`);
  });
  test("multicall round trip: encode two calls, decode a matching answer", () => {
    const enc = encAggregate3([{ target: "0x" + "01".repeat(20), data: "0x1234" }, { target: "0x" + "02".repeat(20), data: "0x" }]);
    expect(enc.startsWith("0x82ad56cb")).toBe(true);
    // Hand-built answer: [(true, 0x…05), (false, 0x)]
    const elem1 = word(1) + word(64) + word(32) + word(5);
    const elem2 = word(0) + word(64) + word(0);
    const ans = "0x" + word(32) + word(2) + word(64) + word(64 + elem1.length / 2) + elem1 + elem2;
    expect(decAggregate3(ans)).toEqual([{ ok: true, data: "0x" + word(5) }, { ok: false, data: "0x" }]);
  });
  test("uint array and both string styles decode", () => {
    expect(decUintArray("0x" + word(32) + word(2) + word(7) + word(9))).toEqual([7n, 9n]);
    const mkr = "0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0");
    expect(decString(mkr)).toBe("MKR");
    const dyn = "0x" + word(32) + word(4) + Buffer.from("PEPE").toString("hex").padEnd(64, "0");
    expect(decString(dyn)).toBe("PEPE");
  });
  test("swap calls carry the minimum-received floor", () => {
    const to = "0x" + "33".repeat(20);
    const v2 = encV2Swap({ nativeIn: true, nativeOut: false, amountIn: 1n, minOut: 777n, path: [to, to], to, deadline: 100 });
    expect(v2.slice(0, 10)).toBe("0xb6f9de95");
    expect(v2.slice(10, 74)).toBe(word(777));
    const v3 = encV3ExactInputSingle({ tokenIn: to, tokenOut: to, fee: 500, recipient: to, amountIn: 10n, minOut: 9n });
    expect(v3.slice(0, 10)).toBe("0x04e45aaf");
    expect(v3.slice(10 + 64 * 5, 10 + 64 * 6)).toBe(word(9));
  });
  test("amounts convert exactly to coin units", () => {
    expect(toUnits("1.5", 6)).toBe(1_500_000n);
    expect(toUnits("0.123456789", 6)).toBe(123_456n);
    expect(fromUnits(1_500_000n, 6)).toBe(1.5);
    expect(() => toUnits("1e5", 18)).toThrow();
  });
});

describe("coin warnings (members may pick any coin; warnings only)", () => {
  const ok = { liquidityUsd: 5_000_000, volume24hUsd: 1_000_000, ageDays: 900, roundTripLoss: 0.006, priceImpact: 0.003 };
  test("a deep, old coin that sells back fine is ok", () => expect(tokenRisk(ok).level).toBe("ok"));
  test("can't confirm a sell-back → high risk", () => expect(tokenRisk({ ...ok, roundTripLoss: null }).level).toBe("danger"));
  test("selling back loses over 25% → high risk", () => expect(tokenRisk({ ...ok, roundTripLoss: 0.3 }).level).toBe("danger"));
  test("under $10k in pools → high risk; under $100k → careful", () => {
    expect(tokenRisk({ ...ok, liquidityUsd: 9_000 }).level).toBe("danger");
    expect(tokenRisk({ ...ok, liquidityUsd: 50_000 }).level).toBe("caution");
  });
  test("listed this week → careful", () => expect(tokenRisk({ ...ok, ageDays: 2 }).level).toBe("caution"));
  test("the hidden-tax disclaimer is always shown", () => expect(tokenRisk(ok).reasons.at(-1)).toContain("hidden taxes"));
});
