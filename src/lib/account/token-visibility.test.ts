import { expect, test } from "bun:test";
import type { TokenRow } from "./erc-tokens";
import { defaultTokenPreferences, hiddenReason, readTokenPreferences, tokenId } from "./token-visibility";

const token: TokenRow = { chain: "ethereum", contract: `0x${"1".repeat(40)}`, symbol: "NIZA", name: "Niza", swappable: false, balance: 5 };
test("unverified tokens are hidden by default; listed tokens remain visible", () => {
  expect(hiddenReason(token, defaultTokenPreferences())).toBe("Not checked by Seeds");
  expect(hiddenReason({ ...token, swappable: true }, defaultTokenPreferences())).toBeNull();
});
test("turning off spam protection reveals unverified tokens", () => {
  expect(hiddenReason(token, { hideSpam: false, choices: {} })).toBeNull();
});
test("restoring a token overrides the default filter without making it swappable", () => {
  expect(hiddenReason(token, { hideSpam: true, choices: { [tokenId(token)]: "show" } })).toBeNull();
  expect(token.swappable).toBe(false);
});
test("manual hide, spam and removal survive switching the default filter off", () => {
  for (const [choice, reason] of [["hide", "Hidden by you"], ["spam", "Marked as spam"], ["remove", "Removed from balances"]] as const) {
    expect(hiddenReason(token, { hideSpam: false, choices: { [tokenId(token)]: choice } })).toBe(reason);
  }
});
test("saved choices survive reload and are network-specific", () => {
  const prefs = readTokenPreferences(JSON.stringify({ hideSpam: true, choices: { [tokenId(token)]: "spam" } }));
  expect(hiddenReason(token, prefs)).toBe("Marked as spam");
  expect(hiddenReason({ ...token, chain: "base" }, prefs)).toBe("Not checked by Seeds");
});
test("invalid browser settings fall back safely", () => {
  expect(readTokenPreferences("garbage")).toEqual(defaultTokenPreferences());
  expect(readTokenPreferences('{"choices":{"__proto__":"show","ethereum:fake":"show"}}').choices).toEqual({});
});