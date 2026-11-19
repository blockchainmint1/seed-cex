import { describe, expect, test } from "bun:test";
import { APPLY_LIMIT_PER_DAY, canApply, cleanApplication, LISTING_PACKAGES, packageById } from "./listing";

const good = {
  package: "sapling", coinName: "Example", ticker: "$exm", network: "pulsechain",
  contract: "0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39", website: "example.org",
  community: "t.me/example", contactName: "Ana", contactEmail: "Ana@Example.org", contactTelegram: "@ana_team", notes: "",
};

describe("listing packages", () => {
  test("three packages at $1,000, $2,500 and $5,000", () => {
    expect(LISTING_PACKAGES.map((p) => [p.id, p.priceUsd])).toEqual([["seed", 1000], ["sapling", 2500], ["grove", 5000]]);
  });
  test("markets grow 1 → 2 → 3", () => {
    expect(LISTING_PACKAGES.map((p) => p.markets)).toEqual([1, 2, 3]);
  });
  test("trading contests come only with Sapling and Grove, and are marked as starting later", () => {
    expect(packageById("seed")!.later ?? []).toEqual([]);
    expect(packageById("sapling")!.later!.join(" ")).toContain("1 trading contest");
    expect(packageById("grove")!.later!.join(" ")).toContain("3 trading contests");
    expect(LISTING_PACKAGES.flatMap((p) => p.features).some((f) => /contest/i.test(f))).toBe(false);
  });
  test("every package opens the coin to Seeds AI baskets", () => {
    expect(packageById("seed")!.features.some((f) => f.includes("AI basket"))).toBe(true);
  });
});

describe("cleanApplication", () => {
  test("tidies a good application", () => {
    const a = cleanApplication(good);
    expect(a.ticker).toBe("EXM");
    expect(a.website).toBe("https://example.org/");
    expect(a.community).toBe("https://t.me/example");
    expect(a.contactEmail).toBe("ana@example.org");
    expect(a.contactTelegram).toBe("ana_team");
    expect(a.notes).toBeNull();
  });
  test("refuses an unknown package", () => {
    expect(() => cleanApplication({ ...good, package: "platinum" })).toThrow("Pick a package.");
  });
  test("refuses a malformed EVM contract", () => {
    expect(() => cleanApplication({ ...good, contract: "0x1234" })).toThrow(/0x followed by 40/);
  });
  test("an Omni token is a property number", () => {
    expect(cleanApplication({ ...good, network: "texitcoin", contract: "39" }).contract).toBe("39");
    expect(() => cleanApplication({ ...good, network: "texitcoin", contract: "0xabc" })).toThrow(/property number/);
  });
  test("refuses a non-web website", () => {
    expect(() => cleanApplication({ ...good, website: "javascript:alert(1)" })).toThrow(/web address/);
  });
  test("needs a reachable email", () => {
    expect(() => cleanApplication({ ...good, contactEmail: "nope" })).toThrow(/email/);
  });
});

describe("apply limit", () => {
  test("3 applications per account per day", () => {
    expect(APPLY_LIMIT_PER_DAY).toBe(3);
    expect(canApply(2)).toBe(true);
    expect(canApply(3)).toBe(false);
  });
});
