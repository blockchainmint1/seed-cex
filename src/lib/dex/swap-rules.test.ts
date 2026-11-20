import { describe, expect, test } from "bun:test";
import {
  afterBridgeFeeUnits, approvalSteps, buildSwapCall, dexStepIndex, dexSwapBlocker, feeProblem, isDexTerminal, minOutUnits, receivedFromLogs,
  requoteUnitsOk, scaledReference, sendMinOut, settleFees, TRANSFER_TOPIC, TSD_DEX, tsdPairProblem, WITHDRAWAL_TOPIC, BRIDGE_USDC_ETH,
} from "./swap-rules";
import { DEX_NETWORKS, NATIVE } from "./venues";
import { SEL } from "./abi";

const ME = "0x1111111111111111111111111111111111111111";
const PEPE = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";
const WETH = DEX_NETWORKS.ethereum.wrapped;
const V3 = DEX_NETWORKS.ethereum.venues[0];
const V2 = DEX_NETWORKS.ethereum.venues[1];
const pad = (a: string) => `0x${"0".repeat(24)}${a.slice(2).toLowerCase()}`;

describe("price protection", () => {
  test("1% protection on 1,000,000 units accepts 990,000", () => {
    expect(minOutUnits(1_000_000n, 100)).toBe(990_000n);
    expect(minOutUnits(1_000_000n, 1001)).toBe(0n); // over 10%: refused
  });
  test("the minimum sent is the agreed floor, or tighter when the live price is better", () => {
    expect(sendMinOut(990n, 1000n, 100)).toBe(990n);
    expect(sendMinOut(990n, 1100n, 100)).toBe(1089n);
  });
  test("the server's fresh quote may be at most 1% below what was shown", () => {
    expect(requoteUnitsOk(1000n, 990n)).toBe(true);
    expect(requoteUnitsOk(1000n, 989n)).toBe(false);
    expect(requoteUnitsOk(1000n, 980n, 200)).toBe(true); // TSD swaps: 2% after the bridge step
  });
  test("a TSD buy's reference scales with the USDC the bridge actually paid", () => {
    expect(scaledReference(2000n, 100n, 99n)).toBe(1980n);
  });
});

describe("TSD", () => {
  test("TSD only on Ethereum, never TSD<->USDC (main Swap page does that)", () => {
    expect(tsdPairProblem("base", TSD_DEX, NATIVE)).toMatch(/Ethereum/);
    expect(tsdPairProblem("ethereum", TSD_DEX, BRIDGE_USDC_ETH)).toMatch(/main Swap page/);
    expect(tsdPairProblem("ethereum", TSD_DEX, PEPE)).toBeNull();
    expect(tsdPairProblem("ethereum", PEPE, NATIVE)).toBeNull();
  });
  test("TSD Bridge's 1% fee on 100 USDC leaves 99 USDC", () => {
    expect(afterBridgeFeeUnits(100_000_000n, 100)).toBe(99_000_000n);
  });
});

describe("transactions", () => {
  const base = { network: "ethereum" as const, amountIn: 10n ** 18n, minOut: 5n, recipient: ME, deadline: 1_900_000_000 };
  test("v3 ETH in: carries the ETH, pays the member's own pocket, inside a deadline multicall", () => {
    const c = buildSwapCall({ ...base, venue: V3, tokenIn: NATIVE, tokenOut: PEPE, path: [WETH, PEPE], fees: [3000] });
    expect(c.to).toBe(V3.router);
    expect(c.value).toBe(10n ** 18n);
    expect(c.data.startsWith(`0x${SEL.v3Multicall}`)).toBe(true);
    expect(c.data).toContain(SEL.v3ExactInputSingle);
    expect(c.data).toContain(ME.slice(2));
  });
  test("v3 coin out to ETH: router keeps the wrapped coin, then unwraps straight to the pocket", () => {
    const c = buildSwapCall({ ...base, venue: V3, tokenIn: PEPE, tokenOut: NATIVE, path: [PEPE, WETH], fees: [3000] });
    expect(c.value).toBe(0n);
    expect(c.data).toContain(SEL.v3UnwrapWeth);
    expect(c.data).toContain("0".repeat(63) + "2"); // ADDRESS_THIS
  });
  test("v2 uses the fee-on-transfer-safe calls", () => {
    expect(buildSwapCall({ ...base, venue: V2, tokenIn: NATIVE, tokenOut: PEPE, path: [WETH, PEPE], fees: [] }).data.slice(2, 10)).toBe(SEL.v2EthForTokens);
    expect(buildSwapCall({ ...base, venue: V2, tokenIn: PEPE, tokenOut: NATIVE, path: [PEPE, WETH], fees: [] }).data.slice(2, 10)).toBe(SEL.v2TokensForEth);
  });
  test("refuses a route that doesn't match the coins, or a zero minimum", () => {
    expect(() => buildSwapCall({ ...base, venue: V2, tokenIn: PEPE, tokenOut: NATIVE, path: [WETH, PEPE], fees: [] })).toThrow();
    expect(() => buildSwapCall({ ...base, minOut: 0n, venue: V2, tokenIn: NATIVE, tokenOut: PEPE, path: [WETH, PEPE], fees: [] })).toThrow();
  });
  test("pool permission is exactly the swap amount; a non-zero leftover is reset first", () => {
    expect(approvalSteps(PEPE, V2.router, 500n, 500n)).toEqual([]);
    const one = approvalSteps(PEPE, V2.router, 0n, 500n);
    expect(one.length).toBe(1);
    expect(one[0].data.endsWith((500).toString(16).padStart(64, "0"))).toBe(true);
    const two = approvalSteps(PEPE, V2.router, 1n, 500n);
    expect(two.map((x) => x.reset)).toEqual([true, false]);
    expect(two[0].data.endsWith("0".repeat(64))).toBe(true);
  });
});

describe("receipts", () => {
  test("counts only the coin's transfers into the member's pocket", () => {
    const logs = [
      { address: PEPE, topics: [TRANSFER_TOPIC, pad(V2.router), pad(ME)], data: `0x${(700n).toString(16).padStart(64, "0")}` },
      { address: PEPE, topics: [TRANSFER_TOPIC, pad(V2.router), pad("0x2222222222222222222222222222222222222222")], data: `0x${(5n).toString(16).padStart(64, "0")}` },
    ];
    expect(receivedFromLogs(logs, { network: "ethereum", tokenOut: PEPE, recipient: ME, router: V2.router })).toBe(700n);
  });
  test("native coin out = what the router unwrapped", () => {
    const logs = [{ address: WETH, topics: [WITHDRAWAL_TOPIC, pad(V2.router)], data: `0x${(42n).toString(16).padStart(64, "0")}` }];
    expect(receivedFromLogs(logs, { network: "ethereum", tokenOut: NATIVE, recipient: ME, router: V2.router })).toBe(42n);
  });
});

describe("fees", () => {
  test("a node suggesting a ~0 tip is floored (0.05 gwei on Ethereum)", () => {
    const f = settleFees("ethereum", { maxFeePerGas: 400_000_000n, maxPriorityFeePerGas: 20n }, 200_000_000n);
    expect(f.maxPriorityFeePerGas).toBe(50_000_000n);
    expect(f.maxFeePerGas).toBe(450_000_000n - 20n);
  });
  test("names the shortfall in the network's own fee coin", () => {
    expect(feeProblem("bsc", { needWei: 10n ** 15n, haveWei: 0n, valueWei: 0n })).toMatch(/0.001 BNB more on BNB Chain/);
    expect(feeProblem("ethereum", { needWei: 10n, haveWei: 10n, valueWei: 0n })).toBeNull();
  });
});

describe("who can swap", () => {
  const link = { mode: "access", hasKey: true, pockets: ["EVM", "TXC"] };
  test("beta testers only during the pilot, with Telegram connected", () => {
    expect(dexSwapBlocker({ tester: false, link, tsdSide: null, telegramVerified: true })).toMatch(/beta testers/);
    expect(dexSwapBlocker({ tester: true, link, tsdSide: null, telegramVerified: false })).toMatch(/Telegram/);
    expect(dexSwapBlocker({ tester: true, link, tsdSide: null, telegramVerified: true })).toBeNull();
  });
  test("approve-every-trade links and pockets without the EVM key can't swap", () => {
    expect(dexSwapBlocker({ tester: true, link: { ...link, mode: "approve" }, tsdSide: null, telegramVerified: true })).toMatch(/instant access/);
    expect(dexSwapBlocker({ tester: true, link: { ...link, pockets: ["TXC"] }, tsdSide: null, telegramVerified: true })).toMatch(/Ethereum-type/);
  });
  test("steps and finished states", () => {
    expect(dexStepIndex(null, "awaiting_approval")).toBe(0);
    expect(dexStepIndex("buy", "bridging")).toBe(1);
    expect(dexStepIndex(null, "swapping")).toBe(2);
    expect(isDexTerminal("kept_usdc")).toBe(true);
    expect(isDexTerminal("approving")).toBe(false);
  });
});
