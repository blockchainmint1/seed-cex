import { expect, test } from "bun:test";
import { ECOSYSTEM_TOKENS } from "./ecosystem-tokens";
import { STARTER_COINS } from "./starters";
import { LISTED_TOKENS, looksLikeImpostor, tokenRows } from "@/lib/account/erc-tokens";
import { getChain } from "@/lib/chains";
import { withdrawCoin } from "@/lib/withdraw/catalog";
import { findAsset, findNetwork, depositState } from "@/lib/account/deposit-options";

test("wTXC, wISK and wZCU are offered on the Ethereum swap list and trusted in Balances", () => {
  for (const t of ECOSYSTEM_TOKENS) {
    expect(STARTER_COINS.ethereum.some((c) => c.address.toLowerCase() === t.address.toLowerCase())).toBe(true);
    expect(LISTED_TOKENS.some((l) => l.contract === t.address.toLowerCase())).toBe(false);
    expect(getChain("ethereum").assets.find((a) => a.symbol === t.symbol)?.contract).toBe(t.address);
    expect(/^0x[0-9a-fA-F]{40}$/.test(t.address)).toBe(true);
  }
  expect(ECOSYSTEM_TOKENS.map((t) => t.symbol)).toEqual(["wTXC", "wISK", "wZCU"]);
});

test("a fake token calling itself wTXC is flagged", () => {
  expect(looksLikeImpostor("WTXC")).toBe(true);
});

for (const [symbol, contract, decimals] of [
  ["wTXC", "0x9FC65df3997073B8551Ffd617154B5102fACbb88", 8],
  ["wISK", "0xFB38867D064Df981F159b886007F1273a346b0BB", 8],
  ["wZCU", "0x61b1F4D5db2436C089593828C26F21e25c4A9C9d", 18],
] as const) {
  test(`${symbol} withdraws only as its pinned Ethereum ERC-20, paying fees in ETH`, () => {
    expect(withdrawCoin(symbol, "ethereum")).toMatchObject({ kind: "evm", pocket: "EVM", decimals, feeCoin: "ETH" });
    expect(getChain("ethereum").assets.find((a) => a.symbol === symbol)).toEqual({ symbol, contract, decimals });
    expect(withdrawCoin(symbol, "base")).toBeNull();
    const net = findNetwork(findAsset(symbol), "ethereum");
    if (!net) throw new Error("Missing wrapped network");
    expect(depositState(net, true, { EVM: "0xpocket" }, null)).toEqual({ ok: true, address: "0xpocket" });
    expect(depositState(net, true, { EVM: "0xpocket" }, "needs Telegram").ok).toBe(false);
    expect(tokenRows({ ethereum: [{ chain: "ethereum", contract, symbol, name: symbol, decimals, raw: "100000000" }], base: [] }, true).some((r) => r.contract === contract.toLowerCase())).toBe(false);
  });
}
