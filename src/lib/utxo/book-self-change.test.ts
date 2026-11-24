import { describe, expect, test } from "bun:test";
import { MAX_BOOK_CHANGE_TXS, bookCoinsWithOwnChange, waitingTxids, type BookTx } from "./book-self-change";

const ME = "ltc1qme";
const T1 = "a".repeat(64);
const PARENT = "b".repeat(64);
const OLD = "c".repeat(64);

const changeTx = (vinAddr = ME): BookTx => ({
  txid: T1,
  vin: [{ txid: OLD, vout: 0, addresses: [vinAddr], isAddress: true }],
  vout: [
    { n: 0, value: "50000000", addresses: ["ltc1qbuyer"], isAddress: true },
    { n: 1, value: "949990000", addresses: [ME], isAddress: true },
  ],
});

describe("Litecoin/Bitcoin/Dogecoin/Bitcoin Cash pockets: own change counts while it waits", () => {
  test("a 10 LTC coin paying 0.5 LTC: the 9.4999 LTC change counts, the spent 10 LTC coin doesn't", () => {
    const rows = [
      { txid: OLD, vout: 0, value: "1000000000", height: 100, confirmations: 5 },
      { txid: T1, vout: 1, value: "949990000", confirmations: 0 },
    ];
    const out = bookCoinsWithOwnChange(rows, { [T1]: changeTx() }, ME, new Set([T1]));
    expect(out).toEqual([{ txid: T1, vout: 1, value: "949990000", confirmations: 0 }]);
  });
  test("an incoming payment from someone else still waits for a block", () => {
    const rows = [{ txid: T1, vout: 1, value: "949990000", confirmations: 0 }];
    expect(bookCoinsWithOwnChange(rows, { [T1]: changeTx("ltc1qsomeoneelse") }, ME, new Set([T1]))).toEqual([]);
  });
  test("a waiting coin whose transaction couldn't be looked up doesn't count", () => {
    const rows = [{ txid: PARENT, vout: 0, value: "100", confirmations: 0 }, { txid: OLD, vout: 3, value: "7", height: 9 }];
    expect(bookCoinsWithOwnChange(rows, {}, ME, new Set([T1]))).toEqual([{ txid: OLD, vout: 3, value: "7", height: 9 }]);
  });
  test("a size that doesn't match the transaction → not counted", () => {
    const rows = [{ txid: T1, vout: 1, value: "999999999", confirmations: 0 }];
    expect(bookCoinsWithOwnChange(rows, { [T1]: changeTx() }, ME, new Set([T1]))).toEqual([]);
  });
  test("X1: change from a payment the member made themselves waits for a block, and its spent coin is still dropped", () => {
    const rows = [
      { txid: OLD, vout: 0, value: "1000000000", height: 100, confirmations: 5 },
      { txid: T1, vout: 1, value: "949990000", confirmations: 0 },
    ];
    expect(bookCoinsWithOwnChange(rows, { [T1]: changeTx() }, ME, new Set())).toEqual([]);
  });
  test("too many waiting transactions → none are looked up", () => {
    const rows = Array.from({ length: MAX_BOOK_CHANGE_TXS + 1 }, (_, i) => ({ txid: i.toString(16).padStart(64, "0"), vout: 0, value: "1", confirmations: 0 }));
    expect(waitingTxids(rows)).toEqual([]);
    expect(waitingTxids(rows.slice(0, 2))).toHaveLength(2);
  });
});
