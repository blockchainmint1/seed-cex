import { expect, test } from "bun:test";
import { prepareUsdtTronSend, sendUsdtTron } from "./tron-usdt.server";

test("review gate refuses withdrawal/swap preparation before any node, recorder or key access", async () => {
  let networkCalls = 0, recorded = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { networkCalls++; throw new Error("Network must not be called during review"); }) as typeof fetch;
  try {
    await expect(prepareUsdtTronSend("not-an-address", "not-an-address", 12_000_000n, true)).rejects.toThrow();
    await expect(sendUsdtTron({ id: "not-a-link", ciphertext: null }, "not-an-address", "not-an-address", 12_000_000n, async () => { recorded++; }, true)).rejects.toThrow();
    expect(networkCalls).toBe(0);
    expect(recorded).toBe(0);
  } finally { globalThis.fetch = original; }
});