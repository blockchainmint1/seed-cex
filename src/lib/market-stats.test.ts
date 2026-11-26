import { expect, test } from "bun:test";
import { statsFromTape } from "./market-stats";
const now = Date.parse("2026-11-26T14:37:00Z");
const old = [
  { createdAt: "2026-11-25T02:45:00Z", price: 0.12, amount: 40 },
  { createdAt: "2026-11-24T10:00:00Z", price: 0.15, amount: 40 },
  { createdAt: "2026-11-23T10:00:00Z", price: 0.2, amount: 40 },
];
test("QA-0015: trades older than 24h never count as 24h change or volume", () => {
  const s = statsFromTape(old, now);
  expect(s.last).toBe(0.12);
  expect(s.changePct).toBe(0);
  expect(s.volume24h).toBe(0);
  expect(s.high24h).toBeNull();
});
test("only trades inside 24h add to volume; change is against the last earlier price", () => {
  const s = statsFromTape([{ createdAt: "2026-11-26T12:00:00Z", price: 0.18, amount: 10 }, ...old], now);
  expect(s.volume24h).toBe(10);
  expect(s.changePct).toBeCloseTo(50, 6);
  expect(s.high24h).toBe(0.18);
});
