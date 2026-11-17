import { describe, expect, test as it } from "bun:test";
import { PEER_EMAILS_PER_DAY, PEER_TOKEN_RE, emailsLeft, peerCheckoutBlock, peerLinkExpiry, peerLinkState, peerToken, peerTokenHash, selfCheckoutBlock, shortName } from "./ignite-peer";

const NOW = Date.parse("2026-11-17T18:00:00Z");
const link = { status: "active", expires_at: "2026-11-24T18:00:00Z", registrant_id: "reg-user", payer_id: null as string | null };
const reg = { status: "pending", payment_method: "peer", invoice_expires_at: null as string | null };
const base = { link, reg, payerId: "friend", payerHmeLinked: true, registrantFirstName: "Bobby", now: NOW };

describe("Peer Pay link", () => {
  it("lasts 7 days", () => expect(peerLinkExpiry(new Date(NOW)).getTime() - NOW).toBe(7 * 86_400_000));
  it("is expired after 7 days", () => expect(peerLinkState(link, Date.parse("2026-11-24T18:00:01Z"))).toBe("expired"));
  it("code depends on the server secret", () => {
    expect(peerToken("a", "id1")).not.toBe(peerToken("b", "id1"));
    expect(peerToken("a", "id1")).toMatch(PEER_TOKEN_RE);
  });
  it("stored fingerprint isn't the code itself", () => expect(peerTokenHash(peerToken("a", "id1"))).not.toBe(peerToken("a", "id1")));
  it("pay page shows only first name and last initial", () => expect(shortName("Bobby Ray Smith")).toBe("Bobby S."));
  it("allows 3 friend emails a day", () => {
    expect(PEER_EMAILS_PER_DAY).toBe(3);
    expect(emailsLeft(3)).toBe(0);
  });
});

describe("who can pay", () => {
  it("a signed-in Honest.Money member can pay", () => expect(peerCheckoutBlock(base)).toBeNull());
  it("payer can't be anonymous", () => expect(peerCheckoutBlock({ ...base, payerHmeLinked: false })).not.toBeNull());
  it("a cancelled link can't be paid", () => expect(peerCheckoutBlock({ ...base, link: { ...link, status: "cancelled" } })).not.toBeNull());
  it("an expired link can't be paid", () => expect(peerCheckoutBlock({ ...base, now: Date.parse("2026-11-25T00:00:00Z") })).not.toBeNull());
  it("an already-paid seat can't be paid again", () => expect(peerCheckoutBlock({ ...base, reg: { ...reg, status: "confirmed" } })).not.toBeNull());
  it("registrant can't pay their own link", () => expect(peerCheckoutBlock({ ...base, payerId: "reg-user" })).not.toBeNull());
  it("blocked while the registrant's own checkout is open", () =>
    expect(peerCheckoutBlock({ ...base, reg: { ...reg, payment_method: "nectarpay", invoice_expires_at: "2026-11-17T18:30:00Z" } })).not.toBeNull());
  it("blocked while a different friend is paying", () =>
    expect(peerCheckoutBlock({ ...base, link: { ...link, payer_id: "other" }, reg: { ...reg, invoice_expires_at: "2026-11-17T18:30:00Z" } })).not.toBeNull());
  it("the same friend can reopen their checkout", () =>
    expect(peerCheckoutBlock({ ...base, link: { ...link, payer_id: "friend" }, reg: { ...reg, invoice_expires_at: "2026-11-17T18:30:00Z" } })).toBeNull());
});

describe("paying yourself", () => {
  it("blocked while a Peer Pay link is active", () => expect(selfCheckoutBlock({ hasActivePeerLink: true, reg: null })).not.toBeNull());
  it("blocked while a friend's checkout is open", () =>
    expect(selfCheckoutBlock({ hasActivePeerLink: false, reg: { payment_method: "peer", invoice_expires_at: "2026-11-17T18:30:00Z" }, now: NOW })).not.toBeNull());
  it("allowed once the link is cancelled", () => expect(selfCheckoutBlock({ hasActivePeerLink: false, reg: { payment_method: "peer", invoice_expires_at: null } })).toBeNull());
});
