import { describe, expect, test } from "bun:test";
import { agreeAdaUtxos, rosettaAdaUtxos } from "./cardano-sources";

const H = "a".repeat(64);
const k = [{ txHash: H, index: 0, lovelace: 5_000_000n, hasTokens: false }];

describe("Cardano coins from two services (Z4)", () => {
  test("both agree → the coins are used", () => {
    expect(agreeAdaUtxos(k, [{ ...k[0]! }])).toEqual(k);
  });
  test("a different size or a missing coin → refused", () => {
    expect(() => agreeAdaUtxos(k, [{ ...k[0]!, lovelace: 6_000_000n }])).toThrow("disagree");
    expect(() => agreeAdaUtxos(k, [])).toThrow("disagree");
  });
  test("either service saying a coin holds tokens keeps it from being spent", () => {
    expect(agreeAdaUtxos(k, [{ ...k[0]!, hasTokens: true }])[0]!.hasTokens).toBe(true);
  });
  test("one service down → the other is enough; both down → refused", () => {
    expect(agreeAdaUtxos(null, k)).toEqual(k);
    expect(() => agreeAdaUtxos(null, null)).toThrow("couldn't be read");
  });
  test("Rosetta answer is read, with token metadata flagged", () => {
    const r = rosettaAdaUtxos({ coins: [
      { coin_identifier: { identifier: `${H}:1` }, amount: { value: "18500000", currency: { symbol: "ADA" } } },
      { coin_identifier: { identifier: `${H}:2` }, amount: { value: "2000000", currency: { symbol: "ADA" } }, metadata: { [`${H}:2`]: [{}] } },
    ] });
    expect(r).toEqual([{ txHash: H, index: 1, lovelace: 18_500_000n, hasTokens: false }, { txHash: H, index: 2, lovelace: 2_000_000n, hasTokens: true }]);
    expect(rosettaAdaUtxos({ coins: [{ coin_identifier: { identifier: "bad" }, amount: { value: "1" } }] })).toBeNull();
  });
});
