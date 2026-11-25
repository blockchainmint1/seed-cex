import { describe, expect, test } from "bun:test";
import { hmeIdentityFor } from "./hme-identity";

const UUID = "affe34e8-891b-41c2-8405-d31df4dadb8c";

describe("the HME tag in the account header", () => {
  test("shows the Honest.Money username when we have one", () => {
    const shown = hmeIdentityFor({ memberId: UUID, username: "mineTXC", memberNo: "1" });
    expect(shown?.label).toBe("mineTXC");
    expect(shown?.uuid).toBe(UUID);
    expect(shown?.memberNoLine).toBe("Member #1");
  });

  test("falls back to the member number when there is no username", () => {
    const shown = hmeIdentityFor({ memberId: UUID, username: null, memberNo: "1506" });
    expect(shown?.label).toBe("#1506");
    expect(shown?.uuid).toBe(UUID);
  });

  test("falls back to the short UUID when HME gave us nothing readable", () => {
    const shown = hmeIdentityFor({ memberId: UUID });
    expect(shown?.label).toBe("affe34e8");
    expect(shown?.uuid).toBe(UUID);
    expect(shown?.memberNoLine).toBeNull();
  });

  test("a junk username never reaches the screen", () => {
    expect(hmeIdentityFor({ memberId: UUID, username: "<script>alert(1)</script>" })?.label).toBe("affe34e8");
    expect(hmeIdentityFor({ memberId: UUID, username: "x".repeat(65) })?.label).toBe("affe34e8");
    expect(hmeIdentityFor({ memberId: UUID, username: "   " })?.label).toBe("affe34e8");
  });

  test("a junk member number is ignored", () => {
    expect(hmeIdentityFor({ memberId: UUID, memberNo: "12a" })?.label).toBe("affe34e8");
    expect(hmeIdentityFor({ memberId: UUID, memberNo: "12a" })?.memberNoLine).toBeNull();
  });

  test("an account with no Honest.Money identity shows nothing", () => {
    expect(hmeIdentityFor({})).toBeNull();
    expect(hmeIdentityFor({ memberId: null, username: null, memberNo: null })).toBeNull();
  });

  test("the username wins even without a UUID (coin/wallet account that joined HME later)", () => {
    const shown = hmeIdentityFor({ memberId: null, username: "bobby" });
    expect(shown?.label).toBe("bobby");
    expect(shown?.uuid).toBeNull();
  });
});
