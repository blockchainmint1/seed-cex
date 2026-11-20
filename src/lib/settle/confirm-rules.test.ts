import { describe, expect, test } from "bun:test";
import { confirmationsNeeded, nextSettleStep, sentLegState, NOT_FOUND_AFTER_MS, STUCK_AFTER_MS } from "./confirm-rules";

const MIN = 60_000;

describe("second side waits for the first side's confirmations (audit #3 A1, Bobby: yes, Nov 20)", () => {
  test("depth per network", () => {
    expect(confirmationsNeeded("txc")).toBe(2);
    expect(confirmationsNeeded("isk")).toBe(2);
    expect(confirmationsNeeded("ltc")).toBe(2);
    expect(confirmationsNeeded("ethereum")).toBe(3);
    expect(confirmationsNeeded("base")).toBe(12);
    expect(confirmationsNeeded("pulsechain")).toBe(12);
  });
  test("an unknown network waits the deepest listed depth", () => {
    expect(confirmationsNeeded("mystery")).toBe(15);
    expect(confirmationsNeeded(null)).toBe(15);
  });

  test("the seller isn't paid while the buyer's send has 0 or 1 of 2 blocks", () => {
    for (const confs of [0, 1]) {
      const first = sentLegState({ kind: "utxo", found: true, confirmations: confs, rejected: false, ageMs: 5 * MIN }, 2);
      expect(first).toBe("waiting");
      expect(nextSettleStep([{ leg: "usdc", sent: true, state: first }, { leg: "txc", sent: false, state: null }])).toEqual({ action: "wait" });
    }
  });
  test("the seller is paid once the buyer's send is 2 blocks deep", () => {
    const first = sentLegState({ kind: "utxo", found: true, confirmations: 2, rejected: false, ageMs: 5 * MIN }, 2);
    expect(first).toBe("confirmed");
    expect(nextSettleStep([{ leg: "tsd", sent: true, state: first }, { leg: "txc", sent: false, state: null }])).toEqual({ action: "send_second" });
  });

  test("a replaced send (network has never heard of it) becomes a dispute after 20 minutes, not before", () => {
    expect(sentLegState({ kind: "evm", found: false, confirmations: null, rejected: false, ageMs: NOT_FOUND_AFTER_MS - MIN }, 3)).toBe("waiting");
    const gone = sentLegState({ kind: "evm", found: false, confirmations: null, rejected: false, ageMs: NOT_FOUND_AFTER_MS + MIN }, 3);
    expect(gone).toBe("vanished");
    expect(nextSettleStep([{ leg: "usdc", sent: true, state: gone }, { leg: "txc", sent: false, state: null }])).toEqual({ action: "dispute", leg: "usdc" });
  });
  test("a send the network rejected is a dispute straight away", () => {
    expect(sentLegState({ kind: "omni", found: true, confirmations: 4, rejected: true, ageMs: MIN }, 2)).toBe("vanished");
  });
  test("our own servers being down never accuses anyone", () => {
    expect(sentLegState({ kind: "utxo", found: null, confirmations: null, rejected: false, ageMs: 48 * 60 * MIN }, 2)).toBe("waiting");
  });
  test("seen but slow (low fee) is never blamed on the payer: it waits, then goes to an admin as stuck", () => {
    expect(sentLegState({ kind: "evm", found: true, confirmations: 0, rejected: false, ageMs: 5 * 60 * MIN }, 3)).toBe("waiting");
    expect(sentLegState({ kind: "utxo", found: true, confirmations: 0, rejected: false, ageMs: 5 * 60 * MIN }, 2)).toBe("waiting");
    expect(nextSettleStep([{ leg: "usdc", sent: true, state: "waiting", ageMs: 6 * 60 * MIN + 1 }, { leg: "txc", sent: false, state: null }])).toEqual({ action: "stuck", leg: "usdc" });
  });

  test("a trade reads settled only when both sides are confirmed", () => {
    expect(nextSettleStep([{ leg: "usdc", sent: true, state: "confirmed" }, { leg: "txc", sent: true, state: "waiting" }])).toEqual({ action: "wait" });
    expect(nextSettleStep([{ leg: "usdc", sent: true, state: "confirmed" }, { leg: "txc", sent: true, state: "confirmed" }])).toEqual({ action: "settled" });
  });
  test("the second payer replacing their own send is caught too", () => {
    expect(nextSettleStep([{ leg: "usdc", sent: true, state: "confirmed" }, { leg: "txc", sent: true, state: "vanished" }])).toEqual({ action: "dispute", leg: "txc" });
  });

  test("a side our servers can't read for 6 hours goes to an admin as stuck, not as cheating", () => {
    const legs = [{ leg: "ltc", sent: true, state: "waiting" as const, ageMs: STUCK_AFTER_MS + MIN }, { leg: "tsd", sent: false, state: null }];
    expect(nextSettleStep(legs)).toEqual({ action: "stuck", leg: "ltc" });
    expect(nextSettleStep([{ ...legs[0], ageMs: STUCK_AFTER_MS - MIN }, legs[1]])).toEqual({ action: "wait" });
  });
});
