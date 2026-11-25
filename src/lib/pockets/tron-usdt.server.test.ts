import { expect, test } from "bun:test";
import { prepareUsdtTronSend, sendUsdtTron, tronTxAbsent, usdtTronTxStatus } from "./tron-usdt.server";

test("non-testers are refused before any node, recorder or key access; bad destinations too", async () => {
  let networkCalls = 0, recorded = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { networkCalls++; throw new Error("Network must not be called"); }) as typeof fetch;
  try {
    await expect(prepareUsdtTronSend("not-an-address", "not-an-address", 12_000_000n, false)).rejects.toThrow(/beta testers/);
    await expect(prepareUsdtTronSend("not-an-address", "not-an-address", 12_000_000n, true)).rejects.toThrow();
    await expect(sendUsdtTron({ id: "not-a-link", ciphertext: null }, "not-an-address", "not-an-address", 12_000_000n, async () => { recorded++; }, true)).rejects.toThrow();
    expect(networkCalls).toBe(0);
    expect(recorded).toBe(0);
  } finally { globalThis.fetch = original; }
});

test("TR1: only an empty answer counts as absent", () => {
  expect(tronTxAbsent({}, {})).toBe(true);
  expect(tronTxAbsent({ id: "x" }, {})).toBe(false);
  expect(tronTxAbsent(null, {})).toBe(false);
});

function nodes(nowMs: number) {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    const body = u.endsWith("/getnowblock") ? { block_header: { raw_data: { timestamp: nowMs } } } : {};
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}
const ev = (expiresAt: number) => ({ chain: "TRON", rawDataHex: "00", expiresAt });
const T = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

test("TR1: missing tx past expiry + 60 s on finalized servers closes as failed; before that stays unknown", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = nodes(Date.now());
    expect(await usdtTronTxStatus("ab".repeat(32), T, T, 1n, ev(Date.now() - 120_000))).toEqual({ success: false, confirmations: 1 });
    expect(await usdtTronTxStatus("ab".repeat(32), T, T, 1n, ev(Date.now() - 30_000))).toBeNull();
    globalThis.fetch = nodes(Date.now() - 200_000); // finalized servers lagging behind expiry
    expect(await usdtTronTxStatus("ab".repeat(32), T, T, 1n, ev(Date.now() - 120_000))).toBeNull();
    expect(await usdtTronTxStatus("ab".repeat(32), T, T, 1n, { chain: "TRON", rawDataHex: "00" })).toBeNull();
  } finally { globalThis.fetch = original; }
});
