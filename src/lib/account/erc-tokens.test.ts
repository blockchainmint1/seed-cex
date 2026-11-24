import { describe, expect, test } from "bun:test";
import { LISTED_TOKENS, looksLikeJunk, tokenRows } from "./erc-tokens";

const DAI = "0x6b175474e89094c44da98b954eedeac495271d0f";

describe("Ethereum and Base tokens on the Balances page", () => {
  test("every swappable Ethereum/Base token is listed, but USDC/USDT/HEX keep their own rows", () => {
    const syms = LISTED_TOKENS.map((t) => `${t.chain}:${t.symbol}`);
    expect(syms).toContain("ethereum:DAI");
    expect(syms).toContain("ethereum:WBTC");
    expect(syms).toContain("base:VVV");
    expect(syms).not.toContain("ethereum:USDC");
    expect(syms).not.toContain("base:USDC");
  });
  test("a listed token not held shows 0; unreadable network shows unknown", () => {
    const rows = tokenRows({ ethereum: [], base: null });
    expect(rows.find((r) => r.symbol === "DAI")!.balance).toBe(0);
    expect(rows.find((r) => r.symbol === "VVV")!.balance).toBeNull();
  });
  test("held DAI shows its amount; an unknown held token is added as not swappable", () => {
    const rows = tokenRows({
      ethereum: [
        { chain: "ethereum", contract: DAI, symbol: "DAI", name: "Dai", decimals: 18, raw: "0x" + (25n * 10n ** 18n).toString(16) },
        { chain: "ethereum", contract: "0x" + "1".repeat(40), symbol: "PEPE", name: "Pepe", decimals: 18, raw: "0x" + (10n ** 18n).toString(16) },
      ],
      base: [],
    });
    expect(rows.find((r) => r.symbol === "DAI")!.balance).toBe(25);
    expect(rows.find((r) => r.symbol === "PEPE")).toMatchObject({ balance: 1, swappable: false });
  });
  test("spam airdrops are hidden", () => {
    expect(looksLikeJunk({ symbol: "Visit claim-eth.com", name: "x", decimals: 18 })).toBe(true);
    expect(looksLikeJunk({ symbol: "USDC", name: "Get rewards at usdc.io", decimals: 6 })).toBe(true);
    expect(looksLikeJunk({ symbol: "PEPE", name: "Pepe", decimals: 18 })).toBe(false);
    expect(looksLikeJunk({ symbol: null, name: "x", decimals: 18 })).toBe(true);
  });
});

import { describe as dT2, expect as eT2, test as tT2 } from "bun:test";
import { looksLikeImpostor, shortContract, tokenRows as rowsT2 } from "./erc-tokens";
dT2("audit T2: impostor tokens", () => {
  tT2("an unlisted token calling itself USDT or WBTC is hidden", () => {
    eT2(looksLikeImpostor("USDT")).toBe(true);
    eT2(looksLikeImpostor("wbtc")).toBe(true);
    eT2(looksLikeImpostor("NIZA")).toBe(false);
    const rows = rowsT2({ ethereum: [{ chain: "ethereum", contract: "0x" + "1".repeat(40), symbol: "USDT", name: "Tether USD", decimals: 6, raw: "10000000000" }], base: [] });
    eT2(rows.some((r) => r.contract === "0x" + "1".repeat(40))).toBe(false);
  });
  tT2("unknown rows show a short contract", () => {
    eT2(shortContract("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });
});

import { describe as dT3, expect as eT3, test as tT3 } from "bun:test";
import { capName, tokenRows as rowsT3 } from "./erc-tokens";
dT3("audit T3: token names are capped before rendering", () => {
  tT3("a very long name from the contract is shortened", () => {
    eT3(capName("x".repeat(200)).length).toBe(40);
    eT3(capName("Pepe")).toBe("Pepe");
    const rows = rowsT3({ ethereum: [{ chain: "ethereum", contract: "0x" + "2".repeat(40), symbol: "PEPE", name: "P".repeat(500), decimals: 18, raw: "0x" + (10n ** 18n).toString(16) }], base: [] });
    eT3(rows.find((r) => r.symbol === "PEPE")!.name.length).toBe(40);
  });
});
