import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Cloudflare Workers throw on fetch(..., { redirect: "error" }) — it only fails after publish.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("Workers-safe fetch options", () => {
  test("no source file uses redirect: \"error\"", () => {
    const bad = files(join(import.meta.dir, "..")).filter((f) => /redirect:\s*["']error["']/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
