import { describe, expect, test } from "bun:test";
import { assertDeliverer, delivererOf, legAmount, type TradeShape } from "./leg-roles";

const trade: TradeShape = {
  id: "t", status: "matched", side: "buy", amount: 10, price: 2,
  pair: "TSD_TXC", maker_id: "seller", taker_id: "buyer",
};

describe("audit C1/C2", () => {
  test("leg amount ignores a tampered stored amount", () => {
    expect(legAmount(trade, "base", 999999)).toBe(10);
    expect(legAmount(trade, "quote", 999999)).toBe(20);
  });
  test("only the payer may send a leg", () => {
    expect(delivererOf(trade, "base")).toBe("seller");
    expect(() => assertDeliverer("buyer", "seller", "TXC")).toThrow();
    expect(() => assertDeliverer("seller", "seller", "TXC")).not.toThrow();
  });
});
