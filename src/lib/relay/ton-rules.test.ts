import { describe, expect, test } from "bun:test";
import { checkRelayQuote, fromUnits, quoteBody, RELAY_DEPOSITORY, TON_NATIVE, tonArrived, toUnits } from "./rules";
import { planSwap } from "@/lib/swap/plan";
import { chainEndSymbol, chainSteps, relayIsSecond } from "@/lib/hype-chain/rules";

const POCKET = "0x1111111111111111111111111111111111111111";
const TON = "UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI";
const RID = "0x1795550183f75bd121c72bcacaa1251828827b7ff14f223323fa587e6bfa4b8f";
const AMT = 10_000_000_000_000_000n;
const data = `0x49290c1c${POCKET.slice(2).padStart(64, "0")}225aa331bac2a405afd1de29d46f6c6ccd6897087673e3f160ab7e12b9f4cdc5`;
// Shaped like Relay's live ETH -> TON answer (Nov 25 2026): 0.01 ETH -> ~17.8 TON, 9 decimals.
const good = () => ({
  steps: [{ id: "deposit", kind: "transaction", requestId: RID, items: [{ data: { to: RELAY_DEPOSITORY, chainId: 1, from: POCKET, value: AMT.toString(), data } }] }],
  details: { recipient: TON, timeEstimate: 1, currencyOut: { amount: "17807217955", minimumAmount: "17451073596", currency: { chainId: 224235520, address: TON_NATIVE, decimals: 9 } } },
});
const ok = { direction: "to_ton" as const, pocket: POCKET, amountWei: AMT, recipient: TON };

describe("Relay ETH -> TON", () => {
  test("a live-shaped quote paying the member's own TON pocket passes", () => {
    const c = checkRelayQuote(good(), ok);
    expect(c.outWei).toBe(17807217955n);
    expect(fromUnits("ton", c.outWei)).toBeCloseTo(17.807217955, 9);
  });
  test("a payout to another TON address is refused", () => {
    const q = good(); q.details.recipient = "UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ";
    expect(() => checkRelayQuote(q, ok)).toThrow(/someone else/);
  });
  test("TON addresses are compared exactly (case matters)", () => {
    const q = good(); q.details.recipient = TON.toLowerCase();
    expect(() => checkRelayQuote(q, ok)).toThrow(/someone else/);
  });
  test("a token instead of native TON is refused", () => {
    const q = good(); q.details.currencyOut.currency.address = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
    expect(() => checkRelayQuote(q, ok)).toThrow(/different coin/);
  });
  test("wrong decimals are refused", () => {
    const q = good(); q.details.currencyOut.currency.decimals = 18;
    expect(() => checkRelayQuote(q, ok)).toThrow(/different coin/);
  });
  test("no TON pocket address means nothing is signed", () => {
    expect(() => checkRelayQuote(good(), { direction: "to_ton", pocket: POCKET, amountWei: AMT })).toThrow(/TON pocket/);
  });
  test("the quote request asks for native TON to the TON pocket", () => {
    const b = quoteBody("to_ton", POCKET, AMT, 100, TON);
    expect(b.recipient).toBe(TON);
    expect(b.destinationCurrency).toBe(TON_NATIVE);
    expect(b.destinationChainId).toBe(224235520);
  });
  test("TON amounts use 9 decimals", () => {
    expect(toUnits("ton", "1.5")).toBe(1_500_000_000n);
  });
  test("arrival needs the pocket to grow by the agreed minimum", () => {
    expect(tonArrived(2, 19.5, 17.45)).toBe(true);
    expect(tonArrived(2, 10, 17.45)).toBe(false);
    expect(tonArrived(null, 19.5, 17.45)).toBe(false);
  });
});

describe("TON routes", () => {
  test("ETH -> TON is a plain Relay swap", () => {
    expect(planSwap({ kind: "coin", id: "ETH" }, { kind: "ton" }).options).toEqual([{ kind: "relay", direction: "to_ton" }]);
  });
  test("TSD -> TON goes TSD -> ETH -> TON in one tap", () => {
    expect(planSwap({ kind: "tsd" }, { kind: "ton" }).options).toEqual([{ kind: "hype_chain", direction: "to_ton", via: "tsd", coin: "TSD" }]);
    expect(chainSteps("to_ton", "tsd", "TSD")).toEqual(["Telegram tap", "TSD Bridge: TSD → ETH", "Relay: ETH → TON"]);
    expect(relayIsSecond("to_ton")).toBe(true);
    expect(chainEndSymbol("to_ton")).toBe("TON");
  });
  test("TON can't be swapped out yet", () => {
    expect(planSwap({ kind: "ton" }, { kind: "tsd" }).options).toEqual([]);
  });
});
