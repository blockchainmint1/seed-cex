import { describe, expect, test } from "bun:test";
import { concurrentRouteBlocker, MAX_OPEN_TSD_ROUTES, usdcOwedToOthers, type OpenRouteLike } from "./tsd-route";

const row = (o: Partial<OpenRouteLike>): OpenRouteLike => ({ id: "a", direction: "buy", stage: "bridging", resume_stage: null, amount_in: 50, usdc_amount: null, tsd_txid: "t", usdc_txid: null, swap_send_id: null, ...o });

describe("several TSD swaps at once", () => {
  test("a second buy may start once the first has sent its TSD", () => {
    expect(concurrentRouteBlocker([row({ stage: "bridging" })])).toBeNull();
  });
  test("a second swap waits while the first hasn't sent its TSD yet", () => {
    expect(concurrentRouteBlocker([row({ stage: "sending_tsd", tsd_txid: null })])).not.toBeNull();
    expect(concurrentRouteBlocker([row({ stage: "gas_pending", resume_stage: "reserved", tsd_txid: null })])).not.toBeNull();
  });
  test("a sell that hasn't sent its coin blocks", () => {
    expect(concurrentRouteBlocker([row({ direction: "sell", stage: "swapping", tsd_txid: null })])).not.toBeNull();
  });
  test("at most 5 open at once", () => {
    const five = Array.from({ length: MAX_OPEN_TSD_ROUTES }, (_, i) => row({ id: String(i) }));
    expect(MAX_OPEN_TSD_ROUTES).toBe(5);
    expect(concurrentRouteBlocker(five)).not.toBeNull();
    expect(concurrentRouteBlocker(five.slice(1))).toBeNull();
  });
  test("finished swaps don't count", () => {
    expect(concurrentRouteBlocker([row({ stage: "done", tsd_txid: null })])).toBeNull();
  });
  test("USDC waiting for another swap's next step is not spendable", () => {
    const open = [row({ id: "me", stage: "swapping", usdc_amount: 40 }), row({ id: "b", stage: "swapping", usdc_amount: 45 }), row({ id: "c", stage: "swap_sent", usdc_amount: 30, swap_send_id: "s" })];
    expect(usdcOwedToOthers(open, "me")).toBe(45);
  });
});
