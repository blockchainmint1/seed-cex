import { afterEach, describe, expect, test } from "bun:test";
import { midgardEndpoints, nodeEndpoints, shouldFailOver, thornodeEndpoints } from "./nodes.server";

const saved = { a: process.env.ALCHEMY_KEY, n: process.env.NOWNODES_API_KEY, l: process.env.LIQUIFY_API_KEY, m: process.env.LIQUIFY_MIDGARD };
const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
afterEach(() => { restore("ALCHEMY_KEY", saved.a); restore("NOWNODES_API_KEY", saved.n); restore("LIQUIFY_API_KEY", saved.l); restore("LIQUIFY_MIDGARD", saved.m); });
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

describe("THORChain node servers", () => {
  test("with the Liquify key, the paid plan is asked first and the key travels in a header", () => {
    process.env.LIQUIFY_API_KEY = "secret-l";
    const list = thornodeEndpoints();
    expect(list[0]!.provider).toBe("liquify");
    expect(list[0]!.headers["x-api-key"]).toBe("secret-l");
    for (const e of list) expect(e.url).not.toContain("secret-l");
  });
  test("Liquify's free tier stays only as a read backup, so one machine never confirms a vault twice", () => {
    process.env.LIQUIFY_API_KEY = "secret-l";
    const list = thornodeEndpoints();
    const confirming = list.filter((e) => !e.backupOnly);
    expect(confirming.length).toBe(3);
    expect(confirming.filter((e) => e.url.includes("liquify")).length).toBe(1);
    expect(list.at(-1)!.backupOnly).toBe(true);
  });
  test("without the key, the three free servers are used as before and none is a backup copy", () => {
    delete process.env.LIQUIFY_API_KEY;
    const list = thornodeEndpoints();
    expect(list.length).toBe(3);
    expect(list.every((e) => e.provider === "public" && !e.backupOnly && !e.headers["x-api-key"])).toBe(true);
  });
});

describe("THORChain history (Midgard) servers", () => {
  test("with the Midgard key, Liquify paid is asked first, key in a header, free servers kept as backup", () => {
    process.env.LIQUIFY_MIDGARD = "secret-m";
    const list = midgardEndpoints();
    expect(list[0]!.provider).toBe("liquify");
    expect(list[0]!.headers["x-api-key"]).toBe("secret-m");
    expect(list.slice(1).every((e) => e.provider === "public")).toBe(true);
    for (const e of list) expect(e.url).not.toContain("secret-m");
  });
  test("without the key, only the free servers are used", () => {
    delete process.env.LIQUIFY_MIDGARD;
    expect(midgardEndpoints().every((e) => e.provider === "public")).toBe(true);
  });
});
