import { describe, expect, test } from "bun:test";
import { swapCoin } from "./assets";
import { approveData, depositWithExpiryData, roundTo1e8Units, selector, tokenContract, toTokenUnits } from "./evm-router";
import { landsOutsideHmeWallet, receivePocket, requoteOk, sendBlocker, sendSource, swapProgress, SWAP_LIMITS, swapLimitsFor, thorTxId, trackerUrl } from "./send-rules";

const c = (id: string) => swapCoin(id)!;
const link = { mode: "access", hasKey: true, pockets: ["BTC", "LTC", "EVM"] };

describe("which coins Seeds can send", () => {
  test("first batch: coins Seeds already signs", () => {
    for (const id of ["BTC", "LTC", "ETH", "DOGE", "BCH", "XRP", "TRX", "SOL", "USDC", "USDT"]) expect(sendSource(c(id))).not.toBeNull();
  });
  test("Zcash, other networks and TRON tokens are not sendable yet", () => {
    for (const id of ["ZEC", "BNB", "AVAX", "ETH.BASE", "USDT.TRON", "USDC.BSC", "ADA", "DASH"]) expect(sendSource(c(id))).toBeNull();
  });
  test("Ethereum tokens pay from the EVM pocket through the router", () => {
    expect(sendSource(c("USDC"))).toEqual({ pocket: "EVM", kind: "erc20" });
  });
  test("EVM-network coins come back to the same EVM pocket", () => {
    expect(receivePocket(c("USDC.BSC"))).toBe("EVM");
    expect(receivePocket(c("BTC"))).toBe("BTC");
    expect(receivePocket(c("ATOM"))).toBeNull();
  });
});

describe("who can send", () => {
  test("pilot: members who aren't admins are blocked", () => {
    expect(sendBlocker({ from: c("BTC"), link, isAdmin: false, amountUsd: 50 })).toMatch(/test/);
  });
  test("approve-every-trade links can't send", () => {
    expect(sendBlocker({ from: c("BTC"), link: { ...link, mode: "approve", hasKey: false }, isAdmin: true, amountUsd: 50 })).toMatch(/instant access/);
  });
  test("pocket must include the coin's network", () => {
    expect(sendBlocker({ from: c("DOGE"), link, isAdmin: true, amountUsd: 50 })).toMatch(/doesn't include/);
  });
  test("beta testers (isAdmin = tester) have no Seeds swap limit; others keep $250 / $1,000 a day", () => {
    expect(SWAP_LIMITS.perSwapUsd).toBe(250);
    expect(SWAP_LIMITS.dailyUsd).toBe(1000);
    expect(swapLimitsFor(false)).toEqual({ perSwapUsd: 250, dailyUsd: 1000 });
    expect(swapLimitsFor(true).perSwapUsd).toBeGreaterThan(1e9);
    expect(sendBlocker({ from: c("BTC"), link, isAdmin: true, amountUsd: 50_000 })).toBeNull();
  });
  test("no price, no send", () => {
    expect(sendBlocker({ from: c("BTC"), link, isAdmin: true, amountUsd: null })).toMatch(/price/);
  });
  test("a fresh quote may be at most 1% worse than the one shown", () => {
    expect(requoteOk(100, 99)).toBe(true);
    expect(requoteOk(100, 98.99)).toBe(false);
  });
});

describe("THORChain router calldata", () => {
  test("known selectors", () => {
    expect(selector("depositWithExpiry(address,address,uint256,string,uint256)")).toBe("44bc937b");
    expect(approveData("0x" + "11".repeat(20), 5n).slice(0, 10)).toBe("0x095ea7b3");
  });
  test("encodes the memo as a dynamic string after five head words", () => {
    const d = depositWithExpiryData("0x" + "aa".repeat(20), "0x" + "00".repeat(20), 10n ** 16n, "=:b:bc1qxyz:0/1/0", 1_700_000_000n);
    const body = d.slice(10);
    expect(body.length % 64).toBe(0);
    expect(BigInt("0x" + body.slice(192, 256))).toBe(160n);
    expect(BigInt("0x" + body.slice(320, 384))).toBe(17n);
    expect(Buffer.from(body.slice(384, 384 + 34), "hex").toString()).toBe("=:b:bc1qxyz:0/1/0");
  });
  test("token contract and decimals", () => {
    expect(tokenContract("ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48")).toBe("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
    expect(tokenContract("ETH.ETH")).toBeNull();
    expect(toTokenUnits(100_000_000n, 6)).toBe(1_000_000n);
    expect(toTokenUnits(100_000_000n, 18)).toBe(10n ** 18n);
    expect(roundTo1e8Units(123_456_789n, 6)).toBe(123_456_700n);
  });
});

describe("swap progress", () => {
  test("done only after the outbound is signed", () => {
    expect(swapProgress({ out_txs: [{ id: "AB", memo: "OUT:XYZ" }], stages: { outbound_signed: { completed: true } } })).toEqual({ status: "done", outTxid: "AB" });
    expect(swapProgress({ out_txs: [{ id: "AB", memo: "OUT:XYZ" }], stages: { outbound_signed: { completed: false } } }).status).toBe("sent");
  });
  test("refunds are reported as refunds", () => {
    expect(swapProgress({ out_txs: [{ id: "CD", memo: "REFUND:XYZ" }], stages: { outbound_signed: { completed: true } } }).status).toBe("refunded");
  });
  test("EVM hashes lose 0x for THORNode", () => {
    expect(thorTxId("0xabc")).toBe("ABC");
  });
});

describe("coins that land outside HME Wallet", () => {
  test("DOGE, SOL, XRP, TRX, BCH and ZEC are flagged; BTC, LTC and ETH are not", () => {
    for (const id of ["DOGE", "SOL", "XRP", "TRX", "BCH", "ZEC"]) expect(landsOutsideHmeWallet(swapCoin(id)!)).toBe(true);
    for (const id of ["BTC", "LTC", "ETH"]) expect(landsOutsideHmeWallet(swapCoin(id)!)).toBe(false);
  });
});

describe("sending into Maya", () => {
  test("Bitcoin, Ether, USDC and USDT can be sent into Maya", () => {
    expect(sendSource(c("BTC"), "maya")).toEqual({ pocket: "BTC", kind: "btc" });
    expect(sendSource(c("ETH"), "maya")).toEqual({ pocket: "EVM", kind: "evm" });
    expect(sendSource(c("USDC"), "maya")).toEqual({ pocket: "EVM", kind: "erc20" });
    expect(sendSource(c("USDT"), "maya")).toEqual({ pocket: "EVM", kind: "erc20" });
  });
  test("other coins are not sent into Maya, even ones Seeds sends into THORChain", () => {
    for (const id of ["LTC", "DOGE", "XRP", "SOL", "ZEC", "DASH", "ADA", "WSTETH", "MOCA", "ETH.ARB", "USDC.ARB"]) expect(sendSource(c(id), "maya")).toBeNull();
    expect(sendSource(c("LTC"))).not.toBeNull();
  });
  test("a coin THORChain can send but Maya can't says so", () => {
    expect(sendBlocker({ from: c("LTC"), link, isAdmin: true, amountUsd: 10, protocol: "maya" })).toBe("Seeds sends LTC through THORChain only for now.");
  });
  test("Maya sends keep the same pilot rules (testers, no size limit)", () => {
    expect(sendBlocker({ from: c("BTC"), link, isAdmin: false, amountUsd: 10, protocol: "maya" })).toMatch(/small test/);
    expect(sendBlocker({ from: c("BTC"), link, isAdmin: true, amountUsd: SWAP_LIMITS.perSwapUsd + 1, protocol: "maya" })).toBeNull();
    expect(sendBlocker({ from: c("BTC"), link, isAdmin: true, amountUsd: 10, protocol: "maya" })).toBeNull();
  });
  test("a Maya CACAO payout is not delivery; only a payout on the coin's own chain is", () => {
    const signed = { outbound_signed: { completed: true } };
    expect(swapProgress({ out_txs: [{ id: "M1", memo: "OUT:AB", chain: "MAYA" }], stages: signed }, "BTC").status).toBe("sent");
    expect(swapProgress({ out_txs: [{ id: "M1", memo: "OUT:AB", chain: "MAYA" }, { id: "B1", memo: "OUT:AB", chain: "BTC" }], stages: signed }, "BTC")).toEqual({ status: "done", outTxid: "B1" });
  });
  test("a Maya refund with no payout on the coin's chain is a refund", () => {
    const signed = { outbound_signed: { completed: true } };
    expect(swapProgress({ out_txs: [{ id: "R1", memo: "REFUND:AB", chain: "ETH" }], stages: signed }, "BTC")).toEqual({ status: "refunded", outTxid: "R1" });
  });
  test("Maya swaps are tracked on MayaScan, THORChain swaps on RuneScan", () => {
    expect(trackerUrl("maya", "0xabc")).toBe("https://www.mayascan.org/tx/ABC");
    expect(trackerUrl("thorchain", "0xabc")).toBe("https://runescan.io/tx/ABC");
  });
});

import { isOwnPocketDestination, outsideSwapProblem, SWAP_CODE_NEEDED } from "./send-rules";

describe("swaps paying an outside address (audit #2 H2)", () => {
  const btc = swapCoin("BTC")!;
  const eth = swapCoin("ETH")!;
  const pockets = { BTC: "bc1qown", EVM: "0xAbCdEf0000000000000000000000000000000001" };
  test("the member's own pocket is not outside; EVM ignores letter case", () => {
    expect(isOwnPocketDestination(btc, pockets, "bc1qown")).toBe(true);
    expect(isOwnPocketDestination(eth, pockets, "0xabcdef0000000000000000000000000000000001")).toBe(true);
  });
  test("any other address is outside, and so is a coin with no pocket", () => {
    expect(isOwnPocketDestination(btc, pockets, "bc1qsomeoneelse")).toBe(false);
    expect(isOwnPocketDestination(btc, {}, "bc1qown")).toBe(false);
  });
  test("outside needs two-factor on, a fresh code, then a Telegram tap", () => {
    expect(outsideSwapProblem({ twoFactorOn: false, fresh: true, telegramVerified: true })).toContain("two-factor");
    expect(outsideSwapProblem({ twoFactorOn: true, fresh: false, telegramVerified: true })).toBe(SWAP_CODE_NEEDED);
    expect(outsideSwapProblem({ twoFactorOn: true, fresh: true, telegramVerified: false })).toContain("Telegram");
    expect(outsideSwapProblem({ twoFactorOn: true, fresh: true, telegramVerified: true })).toBeNull();
  });
});
