import { describe, expect, test as it } from "bun:test";
import { parseRevokeData, revokeButtonData, revokeDecision, revokeSignatureOk } from "./telegram-actions";

const KEY = "test-key";
const LINK = "0f8fad5b-d9cb-469f-a165-70867728950e";
const USER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

describe("Telegram revoke buttons", () => {
  it("fit Telegram's 64-byte button limit", async () =>
    expect((await revokeButtonData(KEY, "yes", LINK, USER)).length).toBeLessThanOrEqual(64));

  it("a genuine button checks out for its owner", async () => {
    const d = parseRevokeData(await revokeButtonData(KEY, "yes", LINK, USER))!;
    expect(d.step).toBe("yes");
    expect(await revokeSignatureOk(KEY, d, USER)).toBe(true);
  });

  it("the same button fails for a different member", async () => {
    const d = parseRevokeData(await revokeButtonData(KEY, "yes", LINK, USER))!;
    expect(await revokeSignatureOk(KEY, d, "11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("the first tap's button can't be relabelled into the final 'Yes, revoke'", async () => {
    const ask = await revokeButtonData(KEY, "ask", LINK, USER);
    const forged = parseRevokeData(ask.replace(/^rv1/, "rv2"))!;
    expect(await revokeSignatureOk(KEY, forged, USER)).toBe(false);
  });

  it("pointing a button at another link fails", async () => {
    const d = parseRevokeData((await revokeButtonData(KEY, "yes", LINK, USER)).replace(LINK, "9b2f4d1e-1111-4222-8333-444455556666"))!;
    expect(await revokeSignatureOk(KEY, d, USER)).toBe(false);
  });

  it("junk button data is ignored", () => {
    expect(parseRevokeData("rv2:not-a-uuid:abc")).toBeNull();
    expect(parseRevokeData(123)).toBeNull();
  });
});

describe("what a tap may do", () => {
  const base = { step: "yes" as const, signatureOk: true, privateChat: true, tapChatId: "42", ownerChatId: "42", ownerChatVerified: true, linkActive: true };
  it("the owner's own chat revokes on 'Yes'", () => expect(revokeDecision(base)).toBe("revoke"));
  it("the first tap only asks to confirm", () => expect(revokeDecision({ ...base, step: "ask" })).toBe("confirm"));
  it("a tap from a different chat is refused", () => expect(revokeDecision({ ...base, tapChatId: "43" })).toBe("refuse"));
  it("a group chat is refused", () => expect(revokeDecision({ ...base, privateChat: false })).toBe("refuse"));
  it("an unverified Telegram link is refused", () => expect(revokeDecision({ ...base, ownerChatVerified: false })).toBe("refuse"));
  it("a bad signature is refused", () => expect(revokeDecision({ ...base, signatureOk: false })).toBe("refuse"));
  it("an old button on a link already gone changes nothing", () => expect(revokeDecision({ ...base, linkActive: false })).toBe("already_revoked"));
  it("'Keep it' never revokes", () => expect(revokeDecision({ ...base, step: "no" })).toBe("cancel"));
});
