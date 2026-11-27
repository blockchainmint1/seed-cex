import { afterEach, describe, expect, test } from "bun:test";
import { rpcBatch } from "./rpc.server";

const savedFetch = globalThis.fetch;
const keys = ["TXC_RPC_ADDRESS", "TXC_RPC_USER", "TXC_RPC_PASSWORD"] as const;
const saved = new Map(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = savedFetch;
  for (const key of keys) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

describe("wallet-scoped RPC batches", () => {
  test("QA-0011: Omni transaction batches use the selected node wallet path", async () => {
    process.env["TXC_RPC_ADDRESS"] = "https://node.invalid/";
    process.env["TXC_RPC_USER"] = "test";
    process.env["TXC_RPC_PASSWORD"] = "test";
    let requested = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested = String(input);
      return Response.json([{ id: 0, result: { amount: "1.20000000" }, error: null }]);
    }) as typeof fetch;
    const replies = await rpcBatch<{ amount: string }>("txc", [{ method: "omni_gettransaction", params: ["reported-tx"] }], 8000, "/wallet/history%20wallet");
    expect(requested).toBe("https://node.invalid/wallet/history%20wallet");
    expect(replies).toEqual([{ amount: "1.20000000" }]);
  });

  test("other RPC batches keep their original endpoint", async () => {
    process.env["TXC_RPC_ADDRESS"] = "https://node.invalid/";
    process.env["TXC_RPC_USER"] = "test";
    process.env["TXC_RPC_PASSWORD"] = "test";
    let requested = "";
    globalThis.fetch = (async (input: string | URL | Request) => {
      requested = String(input);
      return Response.json([{ id: 0, result: 387774, error: null }]);
    }) as typeof fetch;
    expect(await rpcBatch("txc", [{ method: "getblockcount", params: [] }])).toEqual([387774]);
    expect(requested).toBe("https://node.invalid/");
  });
});