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

import { resendOutcome } from "./confirm-rules";
describe("a dropped payment is resent once before anyone is blamed (auditor follow-up)", () => {
  const MIN = 60_000;
  test("not found after 20 minutes, Seeds still has the signed send: resend, don't freeze", () =>
    expect(sentLegState({ kind: "utxo", found: false, confirmations: null, rejected: false, ageMs: 21 * MIN, canResend: true }, 2)).toBe("resend"));
  test("already resent and still not found 20 minutes later: vanished", () =>
    expect(sentLegState({ kind: "utxo", found: false, confirmations: null, rejected: false, ageMs: 21 * MIN, canResend: false }, 2)).toBe("vanished"));
  test("EVM slot taken by another send: vanished without resending", () =>
    expect(sentLegState({ kind: "evm", found: false, confirmations: null, rejected: false, ageMs: 21 * MIN, canResend: true, replaced: true }, 3)).toBe("vanished"));
  test("resend answers", () => {
    expect(resendOutcome(null)).toBe("accepted");
    expect(resendOutcome("txn-already-in-mempool")).toBe("accepted");
    expect(resendOutcome("bad-txns-inputs-missingorspent")).toBe("spent_elsewhere");
    expect(resendOutcome("Broadcast rejected: nonce too low")).toBe("spent_elsewhere");
    expect(resendOutcome("No txc server answered (timeout)")).toBe("retry");
  });
});

import { lookupVerdict, resendDue, RESEND_RETRY_AFTER_MS, txIndexCacheMs } from "./confirm-rules";

describe("auditor follow-up 2 (Bobby: yes, all three, Nov 20)", () => {
  test("one server saying 'no such payment' is not enough to blame anyone", () => {
    expect(lookupVerdict(["missing"])).toBeNull();
    expect(lookupVerdict(["missing", "error"])).toBeNull();
    expect(lookupVerdict(["error", "error"])).toBeNull();
  });
  test("two different servers saying 'no such payment' counts as not found", () => {
    expect(lookupVerdict(["missing", "missing"])).toBe(false);
    expect(lookupVerdict(["error", "missing", "missing"])).toBe(false);
  });
  test("any server that has the payment wins over the ones that don't", () => {
    expect(lookupVerdict(["missing", "missing", "found"])).toBe(true);
  });
  test("a single-server network (ZCU) can never reach 'not found' on its own", () => {
    expect(lookupVerdict(["missing"])).not.toBe(false);
  });
  test("an unanswered resend waits 5 minutes before trying again", () => {
    const now = 1_000_000_000;
    expect(RESEND_RETRY_AFTER_MS).toBe(5 * MIN);
    expect(resendDue(null, now)).toBe(true);
    expect(resendDue(now - 1 * MIN, now)).toBe(false);
    expect(resendDue(now - 4 * MIN, now)).toBe(false);
    expect(resendDue(now - 5 * MIN, now)).toBe(true);
  });
  test("a failed TXC/ISK index check is retried after 1 minute, a real answer kept 10", () => {
    expect(txIndexCacheMs(true)).toBe(1 * MIN);
    expect(txIndexCacheMs(false)).toBe(10 * MIN);
  });
});
