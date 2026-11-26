import { expect, test } from "bun:test";
import { positionsFrom } from "./positions";
test("buy 100 TSD of BTC at 50k, price 60k → worth 120, up 20 (+20%)", () => {
  const s = positionsFrom([{ side: "buy", coin: "btc", amountIn: 100, amountOut: 0.002 }], { btc: 60000 });
  expect(s.value).toBeCloseTo(120, 6); expect(s.unrealized).toBeCloseTo(20, 6); expect(s.positions[0]!.unrealizedPct).toBeCloseTo(20, 6);
});
test("selling half at 70k realizes 20 and keeps half the cost", () => {
  const s = positionsFrom([{ side: "buy", coin: "btc", amountIn: 100, amountOut: 0.002 }, { side: "sell", coin: "btc", amountIn: 0.001, amountOut: 70 }], { btc: 70000 });
  expect(s.realized).toBeCloseTo(20, 6); expect(s.cost).toBeCloseTo(50, 6); expect(s.total).toBeCloseTo(40, 6);
});
test("no price → value unknown, never shown as a loss", () => {
  const s = positionsFrom([{ side: "buy", coin: "x", amountIn: 10, amountOut: 5 }], {});
  expect(s.value).toBeNull(); expect(s.unrealized).toBeNull();
});
