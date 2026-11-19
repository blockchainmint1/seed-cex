import { describe, expect, it } from "bun:test";
import { coinGiveawayBudget, finderFee, listingRevenue } from "./business-plan";

describe("listing revenue", () => {
  it("prices packages at $1,000 / $2,500 / $5,000", () =>
    expect(listingRevenue({ seed: 1, sapling: 1, grove: 1 }).gross).toBe(8500));
  it("ten Sapling listings bring $25,000", () => expect(listingRevenue({ sapling: 10 }).gross).toBe(25000));
  it("a 20% finder's fee is $200 / $500 / $1,000", () => {
    expect(finderFee("seed")).toBe(200);
    expect(finderFee("sapling")).toBe(500);
    expect(finderFee("grove")).toBe(1000);
  });
  it("finder's fees only come out of the referred share", () =>
    expect(listingRevenue({ grove: 4 }, 0.5)).toEqual({ gross: 20000, finderFees: 2000, net: 18000 }));
  it("ignores negative counts", () => expect(listingRevenue({ seed: -3 }).gross).toBe(0));
});

describe("conference coin budget", () => {
  it("1,000 coins at $3.54 plus $150 setup cost $3,690 to make", () =>
    expect(coinGiveawayBudget({ coins: 1000, unitCost: 3.54, setup: 150, rewardUsd: 0, claimRate: 0.1 }).making).toBe(3690));
  it("adds rewards only for coins that get claimed", () => {
    const b = coinGiveawayBudget({ coins: 1000, unitCost: 3.54, setup: 150, rewardUsd: 5, claimRate: 0.1 });
    expect(b.claims).toBe(100);
    expect(b.rewards).toBe(500);
    expect(b.total).toBe(4190);
    expect(b.perSignup).toBe(41.9);
  });
  it("no claims means no cost per sign-up", () =>
    expect(coinGiveawayBudget({ coins: 500, unitCost: 3, setup: 0, rewardUsd: 5, claimRate: 0 }).perSignup).toBeNull());
});
