import { describe, expect, test } from "bun:test";
import { ACCEPTED_CHAINS, ONLY_POCKET_1106, OPTIONAL_CHAINS, REFUSE_OTHER_POCKET, coinsToAdd, linkCoins, pocketNumberProblem, replaceProblem, requestPaths } from "./hme-link-rules";
import { accountPath, type PocketCoin } from "./pockets/coins";

const core: PocketCoin[] = ["TXC", "ISK", "BTC", "LTC", "EVM"];
const all = [...ACCEPTED_CHAINS] as PocketCoin[];
const link = (account: number, coins: PocketCoin[]) => ({ account, paths: coins.map((c) => accountPath(c, account)) });

describe("Add new coins", () => {
  test("a 5-coin link is offered the 11 extra coins", () => {
    expect(coinsToAdd(link(1106, core))).toEqual([...OPTIONAL_CHAINS]);
  });
  test("a 16-coin link has nothing to add", () => {
    expect(coinsToAdd(link(1106, all))).toEqual([]);
  });
  test("every link request asks for pocket 1106", () => {
    expect(requestPaths(link(1106, core)).core.BTC).toBe(accountPath("BTC", 1106));
    expect(requestPaths(link(1106, core)).optional.XMR).toBe(accountPath("XMR", 1106));
    expect(requestPaths(null).core.TXC).toBe(accountPath("TXC", 1106));
  });
  test("paths on another pocket number don't count as held", () => {
    expect(linkCoins({ account: 1106, paths: [accountPath("BTC", 1107)] })).toEqual([]);
  });
});

describe("replacing an active link", () => {
  test("first link is always allowed", () => {
    expect(replaceProblem(null, { account: 1300, chains: core })).toBeNull();
  });
  test("same pocket, 5 coins -> 16 coins is allowed", () => {
    expect(replaceProblem(link(1106, core), { account: 1106, chains: all })).toBeNull();
  });
  test("a different pocket number is refused while a link is active", () => {
    expect(replaceProblem(link(1106, core), { account: 1107, chains: all })).toBe(REFUSE_OTHER_POCKET);
  });
  test("an older 5-coin wallet can't replace a 16-coin link", () => {
    const msg = replaceProblem(link(1106, all), { account: 1106, chains: core });
    expect(msg).toContain("DOGE");
    expect(msg).toContain("XMR");
  });
  test("instant access -> approve-each-trade is refused while the link holds coins HME Wallet can't move", () => {
    const active = { ...link(1106, ["TXC", "EVM", "DOGE", "SOL"]), mode: "access", hasKey: true };
    const msg = replaceProblem(active, { account: 1106, chains: ["TXC", "EVM", "DOGE", "SOL"], mode: "approve" });
    expect(msg).toContain("DOGE");
    expect(msg).toContain("SOL");
    expect(replaceProblem(active, { account: 1106, chains: ["TXC", "EVM", "DOGE", "SOL"], mode: "access" })).toBeNull();
  });
  test("instant access -> approve-each-trade is fine when every coin is one HME Wallet holds", () => {
    const active = { ...link(1106, core), mode: "access", hasKey: true };
    expect(replaceProblem(active, { account: 1106, chains: core, mode: "approve" })).toBeNull();
  });
  test("dropping even one coin is refused", () => {
    const msg = replaceProblem(link(1106, ["TXC", "SOL"]), { account: 1106, chains: ["TXC"] });
    expect(msg).toContain("SOL");
  });
});

describe("pocket 1106 only", () => {
  test("a wallet reporting pocket 1106 is accepted", () => {
    expect(pocketNumberProblem(1106)).toBeNull();
  });
  test("a wallet reporting pocket 1107 is refused", () => {
    expect(pocketNumberProblem(1107)).toBe(ONLY_POCKET_1106);
  });
  test("a wallet reporting pocket 2105 is refused", () => {
    expect(pocketNumberProblem(2105)).toBe(ONLY_POCKET_1106);
  });
});
