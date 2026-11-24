import { describe, expect, test } from "bun:test";
import { myReferralStats, type AffiliateRow } from "./affiliates";

const row = (o: Partial<AffiliateRow>): AffiliateRow => ({
  code: "x", ownerId: null, ownerName: "Someone", linkSeenAt: null,
  clicksAll: 0, clicksPeriod: 0, signupsAll: 0, signupsPeriod: 0, activeMembers: 0,
  trades: 0, tradedValue: 0, swaps: 0, swapUsd: 0, ignitePaid: 0, igniteStarted: 0, igniteUsd: 0,
  setupLinked: 0, setupDone: 0, listingsPaid: 0, listingsStarted: 0, listingUsd: 0, ...o,
});

describe("a member's own referral totals", () => {
  test("only codes the member owns are counted", () => {
    const s = myReferralStats([
      row({ code: "mineTXC", ownerId: "me", signupsAll: 3, clicksAll: 40, ignitePaid: 2, igniteUsd: 800 }),
      row({ code: "cory", ownerId: "other", signupsAll: 9, clicksAll: 99, ignitePaid: 3, igniteUsd: 1200 }),
    ], "me");
    expect(s).toMatchObject({ codes: ["mineTXC"], signupsAll: 3, clicksAll: 40, classSeats: 2, classUsd: 800 });
  });
  test("an old and a new code of the same member add up", () => {
    const s = myReferralStats([row({ ownerId: "me", signupsAll: 1, setupDone: 1 }), row({ ownerId: "me", signupsAll: 2, setupDone: 0 })], "me");
    expect(s.signupsAll).toBe(3);
    expect(s.setupDone).toBe(1);
  });
  test("never hands back trade amounts or the referred people's names", () => {
    const s = myReferralStats([row({ ownerId: "me", tradedValue: 5000, swapUsd: 700 })], "me") as Record<string, unknown>;
    expect(Object.keys(s)).not.toContain("tradedValue");
    expect(Object.keys(s)).not.toContain("swapUsd");
    expect(Object.keys(s)).not.toContain("ownerName");
  });
  test("a member with no code sees zeros", () => {
    expect(myReferralStats([], "me").signupsAll).toBe(0);
  });
});

import { MAX_MY_REFERRALS_LISTED, myReferralPeople } from "./affiliates";

describe("who joined through my link", () => {
  const refs = [
    { user_id: "a", recorded_at: "2026-11-20T10:00:00Z" },
    { user_id: "b", recorded_at: "2026-11-22T10:00:00Z" },
  ];
  const profs = [
    { id: "a", display_name: "rob", onboarding_status: "done" },
    { id: "b", display_name: null, onboarding_status: null },
  ];
  test("newest first, with username, wallet linked and setup finished", () => {
    expect(myReferralPeople(refs, profs, ["a"])).toEqual([
      { name: "New member", joinedAt: "2026-11-22T10:00:00Z", linkedWallet: false, setupDone: false },
      { name: "rob", joinedAt: "2026-11-20T10:00:00Z", linkedWallet: true, setupDone: true },
    ]);
  });
  test("only name, join date, wallet linked and setup — never balances or trades", () => {
    const [p] = myReferralPeople(refs, profs, []);
    expect(Object.keys(p ?? {}).sort()).toEqual(["joinedAt", "linkedWallet", "name", "setupDone"]);
  });
  test("lists at most 200 people", () => {
    expect(MAX_MY_REFERRALS_LISTED).toBe(200);
    const many = Array.from({ length: 250 }, (_, i) => ({ user_id: `u${i}`, recorded_at: `2026-11-01T00:00:${String(i % 60).padStart(2, "0")}Z` }));
    expect(myReferralPeople(many, [], []).length).toBe(200);
  });
});
