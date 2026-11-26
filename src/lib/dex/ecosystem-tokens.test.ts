import { expect, test } from "bun:test";
import { ECOSYSTEM_TOKENS } from "./ecosystem-tokens";
import { STARTER_COINS } from "./starters";
import { LISTED_TOKENS, looksLikeImpostor } from "@/lib/account/erc-tokens";

test("wTXC, wISK and wZCU are offered on the Ethereum swap list and trusted in Balances", () => {
  for (const t of ECOSYSTEM_TOKENS) {
    expect(STARTER_COINS.ethereum.some((c) => c.address.toLowerCase() === t.address.toLowerCase())).toBe(true);
    expect(LISTED_TOKENS.find((l) => l.contract === t.address.toLowerCase())?.swappable).toBe(true);
    expect(/^0x[0-9a-fA-F]{40}$/.test(t.address)).toBe(true);
  }
  expect(ECOSYSTEM_TOKENS.map((t) => t.symbol)).toEqual(["wTXC", "wISK", "wZCU"]);
});

test("a fake token calling itself wTXC is flagged", () => {
  expect(looksLikeImpostor("WTXC")).toBe(true);
});
