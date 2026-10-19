import { afterEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { authorizedHmeRequest, ecosystemHeaders, verifyHmeTicket } from "./hme-auth.server";

const fixtureKey = "test-only-ecosystem-credential";
const originalKey = process.env["HME_ECOSYSTEM"];
const now = 1_800_000_000_000;
const claims = { iss: "honest.money", site: "seeds", minerId: "03ee869f-8726-48a7-80f8-286221d6436e", email: "old@example.com", nonce: "test-nonce-unique", exp: now / 1000 + 120 };
async function ticket(overrides = {}) {
  const body = btoa(JSON.stringify({ ...claims, ...overrides })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(fixtureKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return body + "." + [...mac].map(b => b.toString(16).padStart(2, "0")).join("");
}
afterEach(() => {
  if (originalKey === undefined) delete process.env["HME_ECOSYSTEM"];
  else process.env["HME_ECOSYSTEM"] = originalKey;
});
describe("HME single site credential and permanent identity", () => {
  test("uses HME_ECOSYSTEM with the Seeds site identity", () => {
    process.env["HME_ECOSYSTEM"] = fixtureKey;
    assert.deepEqual(ecosystemHeaders(), { Authorization: `Bearer ${fixtureKey}`, "X-HME-Site": "seeds", "Content-Type": "application/json" });
  });
  test("receiver rejects the same key for another site", () => {
    process.env["HME_ECOSYSTEM"] = fixtureKey;
    assert.equal(authorizedHmeRequest(new Request("https://seeds.honest.money", { headers: ecosystemHeaders() })), true);
    assert.equal(authorizedHmeRequest(new Request("https://seeds.honest.money", { headers: { ...ecosystemHeaders(), "X-HME-Site": "tsd" } })), false);
    assert.equal(authorizedHmeRequest(new Request("https://seeds.honest.money", { headers: { "X-HME-Site": "seeds", Authorization: "Bearer wrong" } })), false);
  });
  test("email changes retain the same verified permanent UUID", async () => {
    const before = await verifyHmeTicket(await ticket(), fixtureKey, now);
    const after = await verifyHmeTicket(await ticket({ email: "new@example.com" }), fixtureKey, now);
    assert.equal(before.minerId, "03ee869f-8726-48a7-80f8-286221d6436e");
    assert.equal(after.minerId, before.minerId);
    assert.equal(after.email, "new@example.com");
  });
  test("rejects tickets for another issuer or destination", async () => {
    await assert.rejects(verifyHmeTicket(await ticket({ iss: "other.example" }), fixtureKey, now));
    await assert.rejects(verifyHmeTicket(await ticket({ site: "tsd" }), fixtureKey, now));
  });
  test("rejects expired, overlong and incorrectly signed tickets", async () => {
    await assert.rejects(verifyHmeTicket(await ticket({ exp: now / 1000 }), fixtureKey, now));
    await assert.rejects(verifyHmeTicket(await ticket({ exp: now / 1000 + 121 }), fixtureKey, now));
    await assert.rejects(verifyHmeTicket(await ticket(), "wrong-test-key", now));
  });
});