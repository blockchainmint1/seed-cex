import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/ton-usdt-confirmed.json";
import { tonMessageMatches } from "./ton-message-proof";
import { usdtTraceStatus } from "./ton-jetton";
import { tonTraceStatus } from "./ed-confirm-rules";

const sent = "fb128208ff53f5b75f2ed3724a1be2518c78fcb40e9e282925a60e920a98facd";
const own = "0:2148fee21a9b901e4889e23d821bb737140dbe0dcd49207b026fbb869bb301f3";
const dest = "0:e9912736c60473c3ee4a11c938c601dc53f7d0438b565311179c6792743ae094";

describe("TON confirmed message re-encoding", () => {
  test("real 12 USDT invoice confirms despite the validator's different external message hash", () => {
    expect(fixture.transaction.in_msg.hash).not.toBe(sent);
    expect(tonMessageMatches(fixture.transaction, sent)).toBe(true);
    expect(usdtTraceStatus(fixture, sent, own, dest, 12_000_000n)).toEqual({ success: true, confirmations: 1 });
  });
  test("raw transaction must match its reported transaction hash", () => {
    expect(tonMessageMatches({ ...fixture.transaction, hash: "0".repeat(64) }, sent)).toBe(false);
  });
  test("wallet account must match the raw transaction and message", () => {
    expect(tonMessageMatches({ ...fixture.transaction, account: { address: dest } }, sent)).toBe(false);
  });
  test("unrelated messages, malformed raw evidence and missing raw evidence stay waiting", () => {
    expect(tonMessageMatches(fixture.transaction, "1".repeat(64))).toBe(false);
    expect(tonMessageMatches({ ...fixture.transaction, raw: "aabb" }, sent)).toBe(false);
    expect(tonMessageMatches({ ...fixture.transaction, raw: "" }, sent)).toBe(false);
    expect(tonMessageMatches({ ...fixture.transaction, in_msg: { hash: "2".repeat(64) } }, sent)).toBe(false);
  });
  test("token amount, recipient and real delivery still required; simulations never confirm", () => {
    expect(usdtTraceStatus(fixture, sent, own, dest, 11_000_000n)).toBeNull();
    expect(usdtTraceStatus(fixture, sent, own, own, 12_000_000n)).toBeNull();
    expect(usdtTraceStatus({ ...fixture, emulated: true }, sent, own, dest, 12_000_000n)).toBeNull();
  });
  test("native TON uses the same identity proof but does not mistake jettons for native delivery", () => {
    expect(tonTraceStatus(fixture, sent, dest, 12_000_000n)).toBeNull();
  });
});