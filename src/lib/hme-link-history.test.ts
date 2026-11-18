import { describe, expect, test } from "bun:test";
import { buildLinkHistory, linkEventTitle, type LinkRow } from "./hme-link-history";

const P = (acct: number, coins: string[]) => {
  const ids: Record<string, string> = { TXC: "696969", ISK: "969696", BTC: "0", LTC: "2", EVM: "60", DOGE: "3" };
  return coins.map((c) => `m/44'/${ids[c]}'/${acct}'`);
};
const row = (o: Partial<LinkRow> & { id: string; created_at: string }): LinkRow => ({
  mode: "access", account: 1106, paths: P(1106, ["TXC", "ISK", "BTC", "LTC", "EVM"]), identity_address: "TwalletAAAAAAAAAAAA1234",
  status: "revoked", revoked_at: null, revoked_by: null, ...o,
});

describe("wallet link history", () => {
  test("link then revoke on Seeds shows two entries, newest first", () => {
    const h = buildLinkHistory([row({ id: "a", created_at: "2026-11-01T10:00:00Z", revoked_at: "2026-11-02T10:00:00Z", revoked_by: "seeds" })]);
    expect(h.map((e) => e.kind)).toEqual(["revoked_seeds", "linked"]);
    expect(linkEventTitle(h[0])).toBe("Revoked on Seeds");
  });

  test("a revoke from HME Wallet is labelled as such", () => {
    const h = buildLinkHistory([row({ id: "a", created_at: "2026-11-01T10:00:00Z", revoked_at: "2026-11-03T10:00:00Z", revoked_by: "wallet" })]);
    expect(linkEventTitle(h[0])).toBe("Revoked in HME Wallet");
  });

  test("'Add new coins' shows as one update listing the added coins, not a revoke", () => {
    const h = buildLinkHistory([
      row({ id: "a", created_at: "2026-11-01T10:00:00Z", revoked_at: "2026-11-05T10:00:00.000Z", revoked_by: "replaced" }),
      row({ id: "b", created_at: "2026-11-05T10:00:00.300Z", status: "active", paths: P(1106, ["TXC", "ISK", "BTC", "LTC", "EVM", "DOGE"]) }),
    ]);
    expect(h.map((e) => e.kind)).toEqual(["updated", "linked"]);
    expect(h[0].added).toEqual(["DOGE"]);
    expect(h[0].current).toBe(true);
    expect(linkEventTitle(h[0])).toBe("Updated: new coins added");
  });

  test("a revoke followed by a fresh link later stays two separate events", () => {
    const h = buildLinkHistory([
      row({ id: "a", created_at: "2026-11-01T10:00:00Z", revoked_at: "2026-11-05T10:00:00Z", revoked_by: "seeds" }),
      row({ id: "b", created_at: "2026-11-05T10:05:00Z", status: "active", account: 1107, paths: P(1107, ["TXC"]) }),
    ]);
    expect(h.map((e) => e.kind)).toEqual(["linked", "revoked_seeds", "linked"]);
    expect(h[0].account).toBe(1107);
    expect(h[0].current).toBe(true);
    expect(h[2].current).toBe(false);
  });

  test("a link from a different wallet is never shown as an 'update' of the old one", () => {
    const h = buildLinkHistory([
      row({ id: "a", created_at: "2026-11-01T10:00:00Z", revoked_at: "2026-11-05T10:00:00.000Z", revoked_by: "replaced" }),
      row({ id: "b", created_at: "2026-11-05T10:00:00.300Z", status: "active", identity_address: "TotherWalletBBBBBB9999" }),
    ]);
    expect(h.map((e) => e.kind)).toEqual(["linked", "replaced", "linked"]);
    expect(linkEventTitle(h[1])).toBe("Replaced by a new link");
  });

  test("no links means no history", () => {
    expect(buildLinkHistory([])).toEqual([]);
  });
});
