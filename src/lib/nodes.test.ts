import { afterEach, describe, expect, test } from "bun:test";
import { nodeEndpoints, shouldFailOver } from "./nodes.server";

const saved = { a: process.env.ALCHEMY_KEY, n: process.env.NOWNODES_API_KEY };
afterEach(() => { process.env.ALCHEMY_KEY = saved.a; process.env.NOWNODES_API_KEY = saved.n; });
const set = (a?: string, n?: string) => {
  if (a) process.env.ALCHEMY_KEY = a; else delete process.env.ALCHEMY_KEY;
  if (n) process.env.NOWNODES_API_KEY = n; else delete process.env.NOWNODES_API_KEY;
};

describe("paid node providers come first", () => {
  test("Ethereum, Base, BNB Chain, TRON and Solana ask Alchemy, then NowNodes, then free servers", () => {
    set("a", "n");
    for (const net of ["ethereum", "base", "bsc", "tron", "solana"] as const) {
      expect(nodeEndpoints(net).map((e) => e.provider).slice(0, 3)).toEqual(["alchemy", "nownodes", "public"]);
    }
  });
  test("PulseChain, XRP and Cosmos ask NowNodes first (Alchemy doesn't serve them)", () => {
    set("a", "n");
    for (const net of ["pulsechain", "xrp", "cosmos"] as const) {
      const p = nodeEndpoints(net).map((e) => e.provider);
      expect(p[0]).toBe("nownodes");
      expect(p).not.toContain("alchemy");
    }
  });
  test("a provider without a key is skipped, and free servers always remain as backup", () => {
    set(undefined, undefined);
    const p = nodeEndpoints("ethereum").map((e) => e.provider);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x === "public")).toBe(true);
  });
  test("the NowNodes key travels in a header, never in the address", () => {
    set(undefined, "secret-n");
    const e = nodeEndpoints("xrp")[0]!;
    expect(e.headers["api-key"]).toBe("secret-n");
    expect(e.url).not.toContain("secret-n");
  });
});

describe("when to try the next server", () => {
  test("no answer, rate limits, refused keys and server errors move on", () => {
    for (const s of [null, 401, 403, 404, 408, 429, 500, 502, 503]) expect(shouldFailOver(s)).toBe(true);
  });
  test("a real answer is final", () => {
    for (const s of [200, 400]) expect(shouldFailOver(s)).toBe(false);
  });
});
