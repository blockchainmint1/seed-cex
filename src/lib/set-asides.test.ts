import { describe, expect, test } from "bun:test";
import { legForCoin, legForEvmToken, legForSwapAsset, ordersToCancel, rowSetAsides, setAsidesByLeg, spendProblem, type SetAside } from "./set-asides";

const order = (id: string, side: "buy" | "sell", amount: number, price: number, created_at: string, filled = 0) =>
  ({ id, pair: "TSD_TXC", side, amount, price, filled, created_at });

describe("what is set aside", () => {
  test("a sell of 100 TXC with 40 filled sets aside 60 TXC; a buy of 100 TXC at 0.10 sets aside 10 TSD", () => {
    const s = setAsidesByLeg({ orders: [order("a", "sell", 100, 0.1, "2026-11-22T10:00:00Z", 40), order("b", "buy", 100, 0.1, "2026-11-22T10:00:00Z")], unsentLegs: [], p2p: [] });
    expect(s.txc?.orders).toBe(60);
    expect(s.tsd?.orders).toBeCloseTo(10, 8);
    expect(s.txc?.openOrders).toBe(1);
  });
  test("trades still being paid and live P2P sales count too", () => {
    const s = setAsidesByLeg({ orders: [order("a", "sell", 50, 0.1, "2026-11-22T10:00:00Z")], unsentLegs: [{ leg: "txc", amount: 20 }], p2p: [{ leg: "txc", amount: 5 }] });
    expect(s.txc?.total).toBe(75);
  });
});

const held = (total: number): SetAside => ({ orders: total, trades: 0, p2p: 0, goingOut: 0, total, openOrders: 1 });

describe("sending while coins are set aside", () => {
  test("nothing set aside: never blocked", () => {
    expect(spendProblem({ symbol: "TXC", setAside: held(0), balances: null, amount: 1 })).toBeNull();
  });
  test("100 TXC held of 150: sending 50 is fine, 51 is refused", () => {
    const b = [{ network: null, balance: 150 }];
    expect(spendProblem({ symbol: "TXC", setAside: held(100), balances: b, amount: 50 })).toBeNull();
    expect(spendProblem({ symbol: "TXC", setAside: held(100), balances: b, amount: 51 })).toContain("up to 50 TXC");
  });
  test("an unreadable balance refuses while anything is set aside", () => {
    expect(spendProblem({ symbol: "TXC", setAside: held(1), balances: null, amount: 1 })).not.toBeNull();
  });
  test("USDC held 100 and Base holds 100: all 50 on Ethereum can go, nothing from Base", () => {
    const b = [{ network: "base", balance: 100 }, { network: "ethereum", balance: 50 }];
    expect(spendProblem({ symbol: "USDC", setAside: held(100), balances: b, amount: 50, network: "ethereum" })).toBeNull();
    expect(spendProblem({ symbol: "USDC", setAside: held(100), balances: b, amount: 1, network: "base" })).not.toBeNull();
  });
});

describe("coins left the pocket", () => {
  const orders = [order("old", "sell", 40, 0.1, "2026-11-20T00:00:00Z"), order("mid", "sell", 30, 0.1, "2026-11-21T00:00:00Z"), order("new", "sell", 30, 0.1, "2026-11-22T00:00:00Z")];
  test("100 TXC promised, 75 left: only the newest order comes off", () => {
    expect(ordersToCancel({ leg: "txc", balance: 75, fixed: 0, orders })).toEqual(["new"]);
  });
  test("still covered: nothing is cancelled", () => {
    expect(ordersToCancel({ leg: "txc", balance: 100, fixed: 0, orders })).toEqual([]);
  });
  test("a trade being paid keeps first call: 100 TXC with 60 owed to a trade cancels the two newest orders", () => {
    expect(ordersToCancel({ leg: "txc", balance: 100, fixed: 60, orders })).toEqual(["new", "mid"]);
  });
  test("buy orders pay TSD, so they never come off for missing TXC", () => {
    expect(ordersToCancel({ leg: "txc", balance: 0, fixed: 0, orders: [order("b", "buy", 100, 0.1, "2026-11-22T00:00:00Z")] })).toEqual([]);
  });
});

describe("which Seeds coin is it", () => {
  test("Ethereum USDC by contract is USDC; a look-alike contract is not", () => {
    expect(legForEvmToken("ethereum", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe("usdc");
    expect(legForEvmToken("ethereum", "0x0000000000000000000000000000000000000001")).toBeNull();
  });
  test("PulseChain's own coin is PLS; ETH on Ethereum isn't a Seeds market coin", () => {
    expect(legForEvmToken("pulsechain", null)).toBe("pls");
    expect(legForEvmToken("ethereum", null)).toBeNull();
  });
  test("THORChain assets", () => {
    expect(legForSwapAsset("ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48")).toBe("usdc");
    expect(legForSwapAsset("LTC.LTC")).toBe("ltc");
    expect(legForSwapAsset("BTC.BTC")).toBeNull();
  });
  test("withdraw / balance rows", () => {
    expect(legForCoin("TSD", "txc-omni")).toBe("tsd");
    expect(legForCoin("TXC", "txc")).toBe("txc");
    expect(legForCoin("USDC", "bsc")).toBe("usdc");
    expect(legForCoin("pHEX", "pulsechain")).toBe("phex");
    expect(legForCoin("ETH", "base")).toBeNull();
  });
  test("USDC set aside shows on the network holding the most", () => {
    const rows = [
      { key: "USDC-base", symbol: "USDC", network: "base", balance: 20 },
      { key: "USDC-ethereum", symbol: "USDC", network: "ethereum", balance: 80 },
    ];
    expect(rowSetAsides(rows, { usdc: held(50) })).toEqual({ "USDC-ethereum": 50 });
  });
});
