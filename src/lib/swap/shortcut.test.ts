import { describe, expect, it } from "bun:test";
import { tonShortcutAmount } from "./shortcut";

describe("tonShortcutAmount", () => {
  it("suggests the TON needed when the pocket covers it plus fees", () => {
    expect(tonShortcutAmount({ usd: 55, usdtPerTon: 1.6, balanceTon: 120, feeTon: 0.265 })).toBe("34.375");
  });
  it("stays quiet when the pocket can't cover amount plus fees", () => {
    expect(tonShortcutAmount({ usd: 55, usdtPerTon: 1.6, balanceTon: 34.5, feeTon: 0.265 })).toBeNull();
  });
  it("stays quiet without a price or balance", () => {
    expect(tonShortcutAmount({ usd: 55, usdtPerTon: null, balanceTon: 120, feeTon: 0.265 })).toBeNull();
    expect(tonShortcutAmount({ usd: 55, usdtPerTon: 1.6, balanceTon: null, feeTon: 0.265 })).toBeNull();
  });
});
