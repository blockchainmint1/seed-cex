import { describe, expect, test } from "bun:test";
import { callerId } from "./supabase";
import listMarkets from "./tools/list-markets";
import getMarketCandles from "./tools/get-market-candles";
import getMyAccount from "./tools/get-my-account";
import listMyOrders from "./tools/list-my-orders";
import listMyTrades from "./tools/list-my-trades";
import listMySwaps from "./tools/list-my-swaps";
import listMyP2pListings from "./tools/list-my-p2p-listings";

const tools = [listMarkets, getMarketCandles, getMyAccount, listMyOrders, listMyTrades, listMySwaps, listMyP2pListings];

// Minimal stand-in for the SDK's verified-caller context.
const ctx = (authed: boolean, sub?: string) =>
  ({ isAuthenticated: () => authed, getUserId: () => sub }) as unknown as Parameters<typeof callerId>[0];

describe("Seeds MCP rules", () => {
  test("every assistant tool is read-only (nothing can trade or move coins)", () => {
    for (const t of tools) {
      const a = (t as unknown as { annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }).annotations;
      expect(a?.readOnlyHint).toBe(true);
      expect(a?.destructiveHint ?? false).toBe(false);
    }
  });

  test("no tool accepts a member id from the caller", () => {
    for (const t of tools) {
      const schema = (t as unknown as { inputSchema?: Record<string, unknown> }).inputSchema ?? {};
      expect(Object.keys(schema).some((k) => /user|member|owner|seller/i.test(k))).toBe(false);
    }
  });

  test("a signed-out caller is refused", () => {
    expect(() => callerId(ctx(false))).toThrow();
  });

  test("a token whose member id isn't a UUID is refused", () => {
    expect(() => callerId(ctx(true, "x) or (1=1"))).toThrow();
  });

  test("a verified member id passes through unchanged", () => {
    const id = "b387945a-8438-40b7-9328-ea65771c3122";
    expect(callerId(ctx(true, id))).toBe(id);
  });
});
