import { describe, expect, test } from "bun:test";
import { readBlockbookTx, readKoiosStatus, readMoneroTransfer, readSolStatus, readTronTx, readXrpTx } from "./confirm-rules";

describe("withdrawal confirmation readings", () => {
  test("BTC/DOGE/BCH: confirmations count, missing waits", () => {
    expect(readBlockbookTx({ confirmations: 3 })).toEqual({ confirmations: 3, success: true });
    expect(readBlockbookTx({ confirmations: 0 })).toEqual({ confirmations: 0, success: true });
    expect(readBlockbookTx(null)).toBeNull();
    expect(readBlockbookTx({ error: "not found" })).toBeNull();
  });
  test("XRP: only a validated ledger decides", () => {
    expect(readXrpTx({ validated: true, meta: { TransactionResult: "tesSUCCESS" } })).toEqual({ confirmations: 1, success: true });
    expect(readXrpTx({ validated: true, meta: { TransactionResult: "tecNO_DST_INSUF_XRP" } })?.success).toBe(false);
    expect(readXrpTx({ validated: false, meta: { TransactionResult: "tecNO_DST" } })).toBeNull();
    expect(readXrpTx({ validated: true, meta: { TransactionResult: "terQUEUED" } })).toBeNull();
  });
  test("TRON: solidified SUCCESS confirms, other result refuses, empty waits", () => {
    expect(readTronTx({ ret: [{ contractRet: "SUCCESS" }] })?.success).toBe(true);
    expect(readTronTx({ ret: [{ contractRet: "OUT_OF_ENERGY" }] })?.success).toBe(false);
    expect(readTronTx({})).toBeNull();
  });
  test("Solana: only finalized counts", () => {
    expect(readSolStatus({ confirmationStatus: "finalized", err: null })).toEqual({ confirmations: 1, success: true });
    expect(readSolStatus({ confirmationStatus: "finalized", err: { InstructionError: [0, "x"] } })?.success).toBe(false);
    expect(readSolStatus({ confirmationStatus: "confirmed", err: { x: 1 } })).toEqual({ confirmations: 0, success: null });
    expect(readSolStatus(null)).toBeNull();
  });
  test("Cardano and Monero never fail, only wait", () => {
    expect(readKoiosStatus([{ num_confirmations: 4 }])).toEqual({ confirmations: 4, success: true });
    expect(readKoiosStatus([{ num_confirmations: null }])).toBeNull();
    expect(readMoneroTransfer({ transfer: { type: "out", confirmations: 12 } })).toEqual({ confirmations: 12, success: true });
    expect(readMoneroTransfer({ transfer: { type: "pending", confirmations: 0 } })).toBeNull();
  });
});
