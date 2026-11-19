import { describe, expect, test } from "bun:test";
import { balanceKey, CACHE_TIMES, forceAllowed, leaseMs, memoryMs, planRead } from "./shared-cache-rules";

const T = { freshMs: 60_000, maxStaleMs: 3_600_000 };
const now = 1_800_000_000_000;

describe("shared display cache", () => {
  test("a copy under a minute old is served as is", () => {
    expect(planRead(now, now - 59_000, T)).toBe("fresh");
  });
  test("an older copy is still shown while one caller refreshes it", () => {
    expect(planRead(now, now - 61_000, T)).toBe("refresh");
  });
  test("past the stale limit, or with no copy, the live lookup runs", () => {
    expect(planRead(now, now - 3_600_001, T)).toBe("load");
    expect(planRead(now, null, T)).toBe("load");
    expect(planRead(now, Number.NaN, T)).toBe("load");
  });
  test("a copy stamped slightly in the future (clock skew) counts as fresh", () => {
    expect(planRead(now, now + 2_000, T)).toBe("fresh");
  });
  test("Refresh skips a copy only once it is 10 seconds old", () => {
    expect(forceAllowed(now, now - 9_999)).toBe(false);
    expect(forceAllowed(now, now - 10_000)).toBe(true);
    expect(forceAllowed(now, null)).toBe(true);
  });
  test("each server keeps its own copy 1–5 seconds; refresh claims last 5–30 seconds", () => {
    expect(memoryMs(3_000)).toBe(3_000);
    expect(memoryMs(60_000)).toBe(5_000);
    expect(memoryMs(200)).toBe(1_000);
    expect(leaseMs(3_000)).toBe(5_000);
    expect(leaseMs(300_000)).toBe(30_000);
  });
  test("balances keep a minute, ISK five minutes; order books three seconds", () => {
    expect(CACHE_TIMES.balance.freshMs).toBe(60_000);
    expect(CACHE_TIMES.iskBalance.freshMs).toBe(300_000);
    expect(CACHE_TIMES.book.freshMs).toBe(3_000);
    expect(CACHE_TIMES.summary.freshMs).toBe(5_000);
    expect(CACHE_TIMES.nodeStatus.freshMs).toBe(30_000);
  });
  test("one key per coin and address; EVM addresses ignore letter case", () => {
    expect(balanceKey("evm-base", "0xABCDEF0000000000000000000000000000000001")).toBe(balanceKey("evm-base", "0xabcdef0000000000000000000000000000000001"));
    expect(balanceKey("btc", "bc1qAbC")).toBe("bal:btc:bc1qAbC");
    expect(balanceKey("tsd", "T1")).not.toBe(balanceKey("txc", "T1"));
  });
});
