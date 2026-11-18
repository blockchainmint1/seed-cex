import { describe, expect, test } from "bun:test";
import { HME_WALLET_CANT_HOLD, hmeCantHoldWarning, hmeWalletCanHold, recoveryLines, revokeCheck } from "./hme-support";

describe("coins HME Wallet can't hold", () => {
  test("the six extra coins are flagged", () => {
    expect([...HME_WALLET_CANT_HOLD].sort()).toEqual(["BCH", "DOGE", "SOL", "TRX", "XRP", "ZEC"]);
  });
  test("the five wallet coins are not", () => {
    for (const c of ["TXC", "ISK", "BTC", "LTC", "EVM"] as const) expect(hmeWalletCanHold(c)).toBe(true);
    expect(hmeWalletCanHold("SOL")).toBe(false);
    expect(hmeWalletCanHold(null)).toBe(false);
  });
});

describe("revoke check", () => {
  test("a funded extra coin is stranded; empty ones pass; unread ones are unknown", () => {
    const r = revokeCheck([
      { coin: "DOGE", balance: 12.5 }, { coin: "SOL", balance: 0 }, { coin: "XRP", balance: null }, { coin: "BTC", balance: 1 },
    ]);
    expect(r.stranded).toEqual([{ coin: "DOGE", balance: 12.5 }]);
    expect(r.unknown).toEqual(["XRP"]);
  });
  test("coins HME Wallet moves back never block", () => {
    expect(revokeCheck([{ coin: "BTC", balance: 2 }, { coin: "LTC", balance: 3 }])).toEqual({ stranded: [], unknown: [] });
  });
});

describe("warning and recovery copy", () => {
  test("warning names only the extra coins and tells them to swap back to TSD", () => {
    const w = hmeCantHoldWarning(["TXC", "BTC", "DOGE", "SOL"])!;
    expect(w).toContain("DOGE and SOL");
    expect(w).toContain("TSD");
    expect(w).not.toContain("BTC");
    expect(hmeCantHoldWarning(["TXC", "BTC"])).toBeNull();
  });
  test("recovery lines give the pocket-1106 receive path", () => {
    const lines = recoveryLines(1106, { DOGE: "Dabc", SOL: "Sxyz", BTC: "bc1q" });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("m/44'/3'/1106'/0/0");
    expect(lines[1]).toContain("m/44'/501'/1106'/0'");
  });
});
