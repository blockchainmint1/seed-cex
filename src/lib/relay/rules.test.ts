import { describe, expect, test } from "bun:test";
import { agreedMinWei, checkRelayQuote, quoteBody, relayProgress, requoteOk, RELAY_DEPOSITORY, toWei } from "./rules";

const POCKET = "0x1111111111111111111111111111111111111111";
const RID = "0x1795550183f75bd121c72bcacaa1251828827b7ff14f223323fa587e6bfa4b8f";
const AMT = 50_000_000_000_000_000n;
const data = `0x49290c1c${POCKET.slice(2).padStart(64, "0")}225aa331bac2a405afd1de29d46f6c6ccd6897087673e3f160ab7e12b9f4cdc5`;
const good = () => ({
  steps: [{ id: "deposit", kind: "transaction", requestId: RID, items: [{ data: { to: RELAY_DEPOSITORY, chainId: 1, from: POCKET, value: AMT.toString(), data } }] }],
  details: { recipient: POCKET, timeEstimate: 2, currencyOut: { amount: "1388371483428423294", minimumAmount: "1360604053759854828", currency: { chainId: 999, address: "0x0000000000000000000000000000000000000000", decimals: 18 } } },
});
const ok = { direction: "to_hype" as const, pocket: POCKET, amountWei: AMT };

describe("Relay deposit check", () => {
  test("a live-shaped ETH -> HYPE quote passes", () => {
    const c = checkRelayQuote(good(), ok);
    expect(c.requestId).toBe(RID);
    expect(c.chainId).toBe(1);
    expect(c.outWei).toBe(1388371483428423294n);
  });
  test("another contract is refused", () => {
    const q = good(); q.steps[0]!.items[0]!.data.to = "0x2222222222222222222222222222222222222222";
    expect(() => checkRelayQuote(q, ok)).toThrow(/unknown contract/);
  });
  test("another recipient is refused", () => {
    const q = good(); q.details.recipient = "0x3333333333333333333333333333333333333333";
    expect(() => checkRelayQuote(q, ok)).toThrow(/someone else/);
  });
  test("a deposit credited to someone else in the calldata is refused", () => {
    const q = good(); q.steps[0]!.items[0]!.data.data = data.replace("1111111111111111111111111111111111111111", "4444444444444444444444444444444444444444");
    expect(() => checkRelayQuote(q, ok)).toThrow(/instruction/);
  });
  test("extra calldata after the order id is refused", () => {
    const q = good(); q.steps[0]!.items[0]!.data.data = `${data}00`;
    expect(() => checkRelayQuote(q, ok)).toThrow(/instruction/);
  });
  test("a different amount is refused", () => {
    const q = good(); q.steps[0]!.items[0]!.data.value = (AMT + 1n).toString();
    expect(() => checkRelayQuote(q, ok)).toThrow(/amount/);
  });
  test("the wrong network is refused", () => {
    const q = good(); q.steps[0]!.items[0]!.data.chainId = 999;
    expect(() => checkRelayQuote(q, ok)).toThrow(/wrong network/);
  });
  test("extra steps (approvals, signatures) are refused", () => {
    const q = good(); (q.steps as unknown[]).push({ id: "approve", kind: "transaction", items: [] });
    expect(() => checkRelayQuote(q, ok)).toThrow(/more than one step/);
  });
  test("a payout in another coin is refused", () => {
    const q = good(); q.details.currencyOut.currency.address = "0xb88339cb7199b77e23db6e890353e22632ba630f";
    expect(() => checkRelayQuote(q, ok)).toThrow(/different coin/);
  });
});

describe("Relay amounts and progress", () => {
  test("agreed minimum is shown less protection", () => { expect(agreedMinWei(10_000n, 100)).toBe(9_900n); });
  test("re-quote may be at most 1% worse", () => {
    expect(requoteOk(10_000n, 9_900n)).toBe(true);
    expect(requoteOk(10_000n, 9_899n)).toBe(false);
  });
  test("quotes always pay the same pocket", () => {
    const b = quoteBody("from_hype", POCKET, 1n, 100);
    expect(b.recipient).toBe(POCKET);
    expect(b.originChainId).toBe(999);
    expect(b.destinationChainId).toBe(1);
  });
  test("Relay status words map to ours", () => {
    expect(relayProgress({ status: "success", txHashes: ["0xab"] })).toEqual({ status: "done", outTxid: "0xab" });
    expect(relayProgress({ status: "refund" })?.status).toBe("refunded");
    expect(relayProgress({ status: "pending" })).toBeNull();
    expect(relayProgress({ status: "unknown" })).toBeNull();
  });
  test("amounts become wei, 8 decimals at most", () => {
    expect(toWei("0.05")).toBe(AMT);
    expect(toWei("1.123456789")).toBe(1_123_456_780_000_000_000n);
    expect(toWei("0")).toBeNull();
  });
});
