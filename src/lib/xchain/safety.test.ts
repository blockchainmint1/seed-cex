import { describe, expect, test as it } from "bun:test";
import { swapCoin, SWAP_COINS } from "./assets";
import {
  destinationValid, limitOk, memoAssetMatches, memoSafe, pickBest, toBaseUnits, toleranceBps, vaultMembership,
} from "./safety";

const BTC = swapCoin("BTC")!;
const ETH = swapCoin("ETH")!;
const USDC = swapCoin("USDC")!;
const SOL = swapCoin("SOL")!;
const ethDest = "0x718f6c9df785bc4e323086de024ca822efbe8ab9";
const base = { protocol: "thorchain" as const, from: BTC, to: ETH, destination: ethDest, maxStreaming: 1, affiliate: null };

describe("swap memo safety", () => {
  it("accepts the live THORChain BTC->ETH memo shape", () => {
    expect(memoSafe(`=:e:${ethDest}:35313013/1/0`, base).ok).toBe(true);
  });
  it("rejects a zero price limit (no protection)", () => {
    expect(memoSafe(`=:e:${ethDest}:0/1/0`, base).ok).toBe(false);
  });
  it("rejects a memo paying a different coin", () => {
    expect(memoSafe(`=:b:${ethDest}:35313013`, base).ok).toBe(false);
  });
  it("rejects a memo paying a different address", () => {
    expect(memoSafe(`=:e:0x0000000000000000000000000000000000000001:35313013`, base).ok).toBe(false);
  });
  it("rejects an affiliate we did not configure", () => {
    expect(memoSafe(`=:e:${ethDest}:35313013:t:50`, base).ok).toBe(false);
  });
  it("requires our configured affiliate exactly", () => {
    const aff = { ...base, affiliate: { name: "seeds", bps: 30 } };
    expect(memoSafe(`=:e:${ethDest}:35313013:seeds:30`, aff).ok).toBe(true);
    expect(memoSafe(`=:e:${ethDest}:35313013:seeds:31`, aff).ok).toBe(false);
  });
  it("rejects streaming quantity above the quote cap", () => {
    expect(memoSafe(`=:e:${ethDest}:35313013/1/5`, { ...base, maxStreaming: 3 }).ok).toBe(false);
  });
  it("rejects a memo over 80 bytes when sending a UTXO coin", () => {
    const long = `=:e:${ethDest}:35313013/1/0:${"x".repeat(40)}`;
    expect(memoSafe(long, base).ok).toBe(false);
  });
  it("treats Solana addresses as case-sensitive", () => {
    const d = "4jUDa9gFRtwua6GDHhfnLRZRv7XZr1dLexxEbQ6VeR3M";
    const c = { ...base, to: SOL, destination: d };
    expect(memoSafe(`=:o:${d}:882034415`, c).ok).toBe(true);
    expect(memoSafe(`=:o:${d.toLowerCase()}:882034415`, c).ok).toBe(false);
  });
  it("matches USDC short, full and contract-tail forms only for our contract", () => {
    expect(memoAssetMatches("ETH.USDC", USDC, "thorchain")).toBe(true);
    expect(memoAssetMatches("ETH.USDC-6EB48", USDC, "thorchain")).toBe(true);
    expect(memoAssetMatches("ETH.USDC-12345", USDC, "thorchain")).toBe(false);
  });
  it("never accepts the same ticker on a different network", () => {
    expect(memoAssetMatches("BSC.USDC", USDC, "thorchain")).toBe(false);
    expect(memoAssetMatches("ETH.USDC", swapCoin("USDC.BSC")!, "thorchain")).toBe(false);
    expect(memoAssetMatches("ARB.USDC", swapCoin("USDC.ARB")!, "maya")).toBe(true);
  });
  it("trusts a shortcode only on the protocol it was verified for", () => {
    const AVAX = swapCoin("AVAX")!;
    const ARBETH = swapCoin("ETH.ARB")!;
    expect(memoAssetMatches("a", AVAX, "thorchain")).toBe(true);
    expect(memoAssetMatches("a", AVAX, "maya")).toBe(false);
    expect(memoAssetMatches("a", ARBETH, "maya")).toBe(true);
    expect(memoAssetMatches("a", ARBETH, "thorchain")).toBe(false);
    expect(memoAssetMatches("d", swapCoin("DOGE")!, "maya")).toBe(false);
    expect(memoAssetMatches("d", swapCoin("DASH")!, "maya")).toBe(true);
  });
  it("gives every coin a unique id and a known network", () => {
    const ids = SWAP_COINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const assets = SWAP_COINS.map((c) => c.asset);
    expect(new Set(assets).size).toBe(assets.length);
  });
});

describe("price protection", () => {
  it("is 1% by default and capped at 3%", () => {
    expect(toleranceBps(10)).toBe(100);
    expect(toleranceBps(90)).toBe(180);
    expect(toleranceBps(900)).toBe(300);
  });
  it("rejects a memo limit far below the quote", () => {
    expect(limitOk(`=:e:${ethDest}:35313013/1/0`, 35669711, 100)).toBe(true);
    expect(limitOk(`=:e:${ethDest}:30000000`, 35669711, 100)).toBe(false);
  });
});

describe("vault agreement", () => {
  it("needs two independent servers listing the vault", () => {
    expect(vaultMembership("bc1qv", [["bc1qv"], null, ["bc1qx"]]).error).not.toBeNull();
    expect(vaultMembership("bc1qv", [["bc1qv"], ["bc1qx", "BC1QV"], null]).error).toBeNull();
  });
});

describe("amounts and addresses", () => {
  it("converts decimal strings to 1e8 units exactly", () => {
    expect(toBaseUnits("0.01")).toBe(1_000_000n);
    expect(toBaseUnits("1.23456789")).toBe(123_456_789n);
    expect(toBaseUnits("0")).toBeNull();
    expect(toBaseUnits("1.123456789")).toBeNull();
  });
  it("accepts each coin's live vault address format", () => {
    const samples: Record<string, string> = {
      BTC: "bc1qup236qj2mr87ml9388ydm33tuhtdckk33j68qx", ETH: ethDest, LTC: "ltc1qup236qj2mr87ml9388ydm33tuhtdckk34wqrck",
      DOGE: "DRbFs1GDf9F3MGnHy24vPP8h7wCE8nCBAU", BCH: "qrs928gzftvvlm0ukyuu3hwx90jadhz66y3f968clg",
      XRP: "rMTwKkK2MjLkFGb6NSnMqcyaNoTvuiZhzs", SOL: "4jUDa9gFRtwua6GDHhfnLRZRv7XZr1dLexxEbQ6VeR3M",
      ZEC: "t1Wk5v6TGRrCoRh2jf3K37eZbFn55asyabp", TRON: "TLKfB2goHRY1SykEpVbiGdsesACrkCxCeW",
      GAIA: "cosmos1hsk6jryyqjfhp5dhc55tc9jtckygx0eph6dd02",
      THOR: "thor1dheycdevq39qlkxs2a6wuuzyn4aqxhve4qxtxt",
      DASH: "XpESxaUmonkq8RaLLp46Brx2K39ggQe226",
      ADA: "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x",
    };
    for (const c of SWAP_COINS) expect(destinationValid(c, samples[c.chain] ?? ethDest)).toBe(true);
    expect(destinationValid(BTC, ethDest)).toBe(false);
    expect(destinationValid(swapCoin("ZEC")!, "zs1shieldedaddressnotsupported")).toBe(false);
  });
  it("picks the highest passing payout", () => {
    const best = pickBest([
      { protocol: "thorchain", ok: true, expectedOut: 1 },
      { protocol: "maya", ok: false, expectedOut: 2 },
    ]);
    expect(best?.protocol).toBe("thorchain");
  });
});
