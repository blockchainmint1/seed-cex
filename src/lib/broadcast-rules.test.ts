import { describe, expect, test } from "bun:test";
import { maybeBroadcast } from "./broadcast-rules";

describe("a fail-over 'already have it' answer is never recorded as a failed send (deep scan D2)", () => {
  test.each([
    "Broadcast rejected: nonce too low",
    "Bitcoin broadcast rejected: txn-already-in-mempool",
    "txn-already-known",
    "transaction already in block chain",
    "XRP Ledger refused the payment: tefPAST_SEQ — This sequence number has already passed.",
    "XRP Ledger refused the payment: tefALREADY",
    "DUP_TRANSACTION_ERROR",
    "already known",
    "The operation timed out (timeout)",
    "HTTP 502",
  ])("%s → maybe sent", (m) => expect(maybeBroadcast(m)).toBe(true));
  test.each([
    "Broadcast rejected: insufficient funds for gas * price + value",
    "XRP Ledger refused the payment: tecUNFUNDED_PAYMENT",
    "Bitcoin broadcast rejected: bad-txns-inputs-missingorspent",
  ])("%s → definitely not sent", (m) => expect(maybeBroadcast(m)).toBe(false));
});
