import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The scheduled writer must always record a fresh THORChain reading.
 *
 * The pages read Seeds' own history first, so if the job used the same entry
 * point it would store its own previous slice over and over and the history
 * would freeze at the first value ever written. Nothing else in the app would
 * look wrong, so this is checked at the source.
 */
describe("the scheduled market writer", () => {
  const src = readFileSync(join(import.meta.dir, "snapshot.server.ts"), "utf8");
  // Comments mention both names on purpose; only the code is checked.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  test("imports the live-only market reader, not the one that prefers Seeds' history", () => {
    const imp = code.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/thor-markets\.server"/);
    expect(imp).not.toBeNull();
    const names = imp![1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    expect(names).toContain("fetchThorMarketsLive");
    expect(names).not.toContain("fetchThorMarkets");
  });

  test("calls the live reader and never the stored-preferring one", () => {
    expect(code).toContain("fetchThorMarketsLive()");
    expect(code).not.toContain("fetchThorMarkets()");
  });

  test("still records the pool detail, chain state and network state", () => {
    expect(code).toContain('from("market_snapshots_5min")');
    expect(code).toContain('from("chain_snapshots")');
    expect(code).toContain('from("network_snapshots")');
  });
});
