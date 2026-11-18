import { describe, expect, test } from "bun:test";
import { buildTree, growthEnd, SEED_Y, TREE_H, TREE_W } from "./tree-of-life";

describe("homepage Tree of Life drawing", () => {
  test("draws the same tree every time (server and browser must match)", () => {
    expect(JSON.stringify(buildTree())).toBe(JSON.stringify(buildTree()));
  });

  test("branches grow above the seed and roots below it, inside the drawing", () => {
    const art = buildTree();
    const end = (d: string) => d.split(/[ MQC]/).filter(Boolean).slice(-2).map(Number);
    for (const l of art.limbs) {
      const [x, y] = end(l.d);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(TREE_W);
      if (l.kind === "branch") expect(y).toBeLessThan(SEED_Y);
      else {
        expect(y).toBeGreaterThan(SEED_Y);
        expect(y).toBeLessThanOrEqual(TREE_H);
      }
    }
  });

  test("finishes growing in under ten seconds and stays light enough for phones", () => {
    const art = buildTree();
    expect(growthEnd(art)).toBeLessThan(10);
    expect(art.limbs.length + art.leaves.length + art.tips.length).toBeLessThan(4000);
  });
});
