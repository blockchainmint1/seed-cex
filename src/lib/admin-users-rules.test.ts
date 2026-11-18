import { describe, expect, test } from "bun:test";
import { adminChangeProblem, adminResultMessage, matchesUserSearch } from "./admin-users-rules";

const base = { actorId: "a", targetId: "b", targetIsAdmin: false, targetHasHme: true, adminCount: 2 };

describe("giving admin access", () => {
  test("an HME member who isn't an admin can be given access", () => {
    expect(adminChangeProblem({ ...base, grant: true })).toBeNull();
  });
  test("an account without an HME membership can't be made admin", () => {
    expect(adminChangeProblem({ ...base, grant: true, targetHasHme: false })).toBe("no_hme");
  });
  test("someone who isn't an admin can't give access", () => {
    expect(adminChangeProblem({ ...base, grant: true, actorIsAdmin: false })).toBe("not_admin");
  });
});

describe("removing admin access", () => {
  test("an admin can remove another admin when two or more exist", () => {
    expect(adminChangeProblem({ ...base, grant: false, targetIsAdmin: true, adminCount: 2 })).toBeNull();
  });
  test("you can't remove your own access", () => {
    expect(adminChangeProblem({ ...base, grant: false, targetId: "a", targetIsAdmin: true, adminCount: 3 })).toBe("self");
  });
  test("the last admin can't be removed", () => {
    expect(adminChangeProblem({ ...base, grant: false, targetIsAdmin: true, adminCount: 1 })).toBe("last_admin");
  });
  test("removing someone who isn't an admin changes nothing", () => {
    expect(adminChangeProblem({ ...base, grant: false })).toBe("unchanged");
  });
});

describe("messages and search", () => {
  test("unknown result codes get a safe fallback", () => {
    expect(adminResultMessage("weird")).toContain("Try again");
  });
  test("search matches name, email or member id, ignoring case", () => {
    const row = { name: "Jennifer Hommel", email: "jen@example.com", hmMemberId: "9f2c1a" };
    expect(matchesUserSearch(row, "HOMMEL")).toBe(true);
    expect(matchesUserSearch(row, "jen@")).toBe(true);
    expect(matchesUserSearch(row, "9f2c")).toBe(true);
    expect(matchesUserSearch(row, "bobby")).toBe(false);
  });
});
