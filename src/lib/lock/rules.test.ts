import { describe, expect, test as it } from "bun:test";
import { hexToBytes } from "@noble/hashes/utils.js";
import { FEE_RESERVE_SATS, MAX_LOCK_FEE_SATS, checkLockSpend, depositConfirmationsRequired, pairReady, tradableAmount, type ExpectedSpend, type LockUtxo } from "./rules";
import { COOP_SEQUENCE, type Tx } from "./script";

describe("deposit depth", () => {
  it("up to $1,000 needs 6 confirmations", () => expect(depositConfirmationsRequired(1_000)).toBe(6));
  it("up to $10,000 needs 12", () => expect(depositConfirmationsRequired(10_000)).toBe(12));
  it("above $10,000 needs 24", () => expect(depositConfirmationsRequired(10_001)).toBe(24));
});

describe("tradable amount", () => {
  it("subtracts tokens already promised by signed, unconfirmed spends", () => expect(tradableAmount(100n, 30n, [])).toBe(70n));
  it("holds back a $500 member deposit with 5 of 6 confirmations", () =>
    expect(tradableAmount(100n, 0n, [{ amount: 40n, confirmations: 5, usd: 500, fromLock: false }])).toBe(60n));
  it("releases it at 6 confirmations", () =>
    expect(tradableAmount(100n, 0n, [{ amount: 40n, confirmations: 6, usd: 500, fromLock: false }])).toBe(100n));
  it("co-signed trade receipts don't wait for depth", () =>
    expect(tradableAmount(100n, 0n, [{ amount: 40n, confirmations: 1, usd: 5_000, fromLock: true }])).toBe(100n));
  it("never goes negative", () => expect(tradableAmount(10n, 30n, [])).toBe(0n));
});

const LOCK = hexToBytes("a914" + "11".repeat(20) + "87");
const BUYER = hexToBytes("a914" + "22".repeat(20) + "87");
const OPRET = hexToBytes("6a14" + "00".repeat(20));
const coins: LockUtxo[] = [{ txid: "aa".repeat(32), vout: 0, value: 5_000_000n, confirmations: 10 }, { txid: "bb".repeat(32), vout: 1, value: 546n, confirmations: 3 }];
const exp: ExpectedSpend = { purpose: "trade", lockScriptPubKey: LOCK, toScriptPubKey: BUYER, lockAddress: "Tlock", toAddress: "Tbuyer", propertyId: 39, amount: "100.00000000" };
const decoded = { sendingaddress: "Tlock", referenceaddress: "Tbuyer", propertyid: 39, amount: "100.00000000", type_int: 0 };
const trade = (over: Partial<Tx> = {}): Tx => ({
  version: 2, locktime: 0,
  inputs: coins.map((c) => ({ txid: c.txid, vout: c.vout, sequence: COOP_SEQUENCE })),
  outputs: [{ value: 4_899_000n, script: LOCK }, { value: 0n, script: OPRET }, { value: 546n, script: BUYER }],
  ...over,
});

describe("Seeds co-sign check", () => {
  it("a well-formed trade passes", () => expect(checkLockSpend(trade(), coins, exp, decoded)).toEqual([]));
  it("refuses a spend that leaves an old coin behind (sweep every confirmed coin)", () =>
    expect(checkLockSpend(trade({ inputs: [{ txid: coins[0]!.txid, vout: 0, sequence: COOP_SEQUENCE }] }), coins, exp, decoded)).toContain("must spend exactly every confirmed coin at the lock"));
  it("refuses unconfirmed coins", () =>
    expect(checkLockSpend(trade(), [coins[0]!, { ...coins[1]!, confirmations: 0 }], exp, decoded)).toContain("must spend exactly every confirmed coin at the lock"));
  it("refuses replace-by-fee inputs", () =>
    expect(checkLockSpend(trade({ inputs: coins.map((c) => ({ txid: c.txid, vout: c.vout, sequence: 0xfffffffd })) }), coins, exp, decoded)).toContain("inputs must be final (no replace-by-fee)"));
  it("refuses an extra output", () =>
    expect(checkLockSpend(trade({ outputs: [...trade().outputs, { value: 1000n, script: hexToBytes("76a914" + "33".repeat(20) + "88ac") }] }), coins, exp, decoded)).toContain("unexpected output"));
  it(`refuses dipping below the ${FEE_RESERVE_SATS} sat (0.01 TXC) fee reserve`, () =>
    expect(checkLockSpend(trade({ outputs: [{ value: 900_000n, script: LOCK }, { value: 0n, script: OPRET }, { value: 546n, script: BUYER }] }), coins, exp, decoded)).toContain("would spend the lock's fee reserve"));
  it(`refuses a fee above ${MAX_LOCK_FEE_SATS} sats (0.005 TXC)`, () =>
    expect(checkLockSpend(trade({ outputs: [{ value: 4_000_000n, script: LOCK }, { value: 0n, script: OPRET }, { value: 546n, script: BUYER }] }), coins, exp, decoded)).toContain("fee out of range"));
  it("refuses when Omni says a different sender, recipient, token or amount", () => {
    expect(checkLockSpend(trade(), coins, exp, { ...decoded, sendingaddress: "Tother" })).toContain("Omni sender is not the lock");
    expect(checkLockSpend(trade(), coins, exp, { ...decoded, referenceaddress: "Tother" })).toContain("Omni recipient mismatch");
    expect(checkLockSpend(trade(), coins, exp, { ...decoded, propertyid: 43 })).toContain("Omni property mismatch");
    expect(checkLockSpend(trade(), coins, exp, { ...decoded, amount: "101.00000000" })).toContain("Omni amount mismatch");
  });
  it("refuses instant trades from a lock whose oldest coin is 13,440+ blocks old", () =>
    expect(checkLockSpend(trade(), [coins[0]!, { ...coins[1]!, confirmations: 13_440 }], exp, decoded)).toContain("lock too old: refresh first"));
  it("a refresh is one output back to the lock, sweeping everything", () => {
    const r: Tx = { version: 2, locktime: 0, inputs: trade().inputs, outputs: [{ value: 4_999_000n, script: LOCK }] };
    expect(checkLockSpend(r, coins, { purpose: "refresh", lockScriptPubKey: LOCK, lockAddress: "Tlock" }, null)).toEqual([]);
  });
});

describe("pair settlement", () => {
  it("waits until both members' signatures are verified", () => {
    expect(pairReady([{ memberSigsVerified: true }, { memberSigsVerified: false }])).toBe(false);
    expect(pairReady([{ memberSigsVerified: true }, { memberSigsVerified: true }])).toBe(true);
  });
});
