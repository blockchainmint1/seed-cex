/**
 * Tree of Life artwork for the homepage hero: a deterministic branch/root
 * generator (same seed → same drawing on the server and in the browser, so
 * the SVG hydrates without a mismatch). Pure geometry, no DOM.
 *
 * Coordinates live in a fixed viewBox (TREE_W × TREE_H). The Seeds symbol
 * sits at SEED_X/SEED_Y; the canopy grows up from its top edge and the roots
 * grow down from its bottom edge.
 */

export const TREE_W = 600;
export const TREE_H = 1100;
export const SEED_X = 300;
export const SEED_Y = 400;
export const SEED_SIZE = 92;

export type Limb = {
  d: string;
  width: number;
  depth: number;
  /** seconds before this limb starts drawing */
  delay: number;
  /** seconds this limb takes to draw */
  duration: number;
  kind: "branch" | "root";
};

export type Leaf = {
  x: number;
  y: number;
  /** degrees, along the twig it hangs from */
  angle: number;
  size: number;
  delay: number;
  /** inside the crown (drawn softer, for depth) rather than on the rim */
  inner?: boolean;
};

export type RootTip = { x: number; y: number; r: number; delay: number };

export type TreeArt = { limbs: Limb[]; leaves: Leaf[]; tips: RootTip[] };

/** Small seeded PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const DEG = Math.PI / 180;

type Opts = {
  kind: "branch" | "root";
  maxDepth: number;
  shrink: [number, number];
  spread: [number, number];
  /** pull toward this heading (deg) each generation, 0..1 */
  bias: { angle: number; amount: number };
  curl: number;
  /** seconds per 100 units of length */
  pace: number;
  threeWay: number;
  bounds: { minY: number; maxY: number };
  /** optional crown shape the limb ends must stay inside */
  crown?: { cx: number; cy: number; rx: number; ry: number };
  /** chance an inner (depth ≥ 3) fork also carries a leaf */
  innerLeaf?: number;
};

export function buildTree(seed = 1106): TreeArt {
  const rand = rng(seed);
  const between = (a: number, b: number) => a + rand() * (b - a);
  const limbs: Limb[] = [];
  const leaves: Leaf[] = [];
  const tips: RootTip[] = [];

  function grow(x: number, y: number, angle: number, len: number, width: number, depth: number, start: number, o: Opts) {
    // Lean toward the bias heading, then keep inside the drawing.
    angle += (o.bias.angle - angle) * o.bias.amount * (depth / o.maxDepth);
    // Roots never turn back up toward the canopy.
    if (o.kind === "root") angle = Math.min(155, Math.max(25, angle));
    let ex = x + Math.cos(angle * DEG) * len;
    let ey = y + Math.sin(angle * DEG) * len;
    const pad = 18;
    if (ex < pad || ex > TREE_W - pad || ey < o.bounds.minY || ey > o.bounds.maxY) {
      const sx = ex < pad ? (pad - x) / (ex - x) : ex > TREE_W - pad ? (TREE_W - pad - x) / (ex - x) : 1;
      const sy = ey < o.bounds.minY ? (o.bounds.minY - y) / (ey - y) : ey > o.bounds.maxY ? (o.bounds.maxY - y) / (ey - y) : 1;
      const s = Math.max(0.15, Math.min(sx, sy));
      ex = x + (ex - x) * s;
      ey = y + (ey - y) * s;
      len *= s;
    }
    if (o.crown) {
      const { cx, cy, rx, ry } = o.crown;
      const out = (px: number, py: number) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 > 1;
      if (out(ex, ey)) {
        let lo = 0.1;
        let hi = 1;
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) / 2;
          if (out(x + (ex - x) * mid, y + (ey - y) * mid)) hi = mid;
          else lo = mid;
        }
        ex = x + (ex - x) * lo;
        ey = y + (ey - y) * lo;
        len *= lo;
      }
    }
    // Gentle S-curve: control point offset perpendicular to the limb.
    const bend = between(-o.curl, o.curl) * len;
    const mx = (x + ex) / 2 + Math.cos((angle + 90) * DEG) * bend;
    const my = (y + ey) / 2 + Math.sin((angle + 90) * DEG) * bend;
    const duration = Math.max(0.25, (len / 100) * o.pace);
    limbs.push({
      d: `M${r1(x)} ${r1(y)}Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}`,
      width: r1(Math.max(0.6, width)),
      depth,
      delay: r1(start * 100) / 100,
      duration: r1(duration * 100) / 100,
      kind: o.kind,
    });
    const next = start + duration * 0.82;
    // End direction follows the curve's tangent at the tip.
    const endAngle = Math.atan2(ey - my, ex - mx) / DEG;

    if (depth >= o.maxDepth || len < 9) {
      if (o.kind === "branch") {
        const n = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) {
          leaves.push({
            x: r1(ex + between(-6, 6)),
            y: r1(ey + between(-6, 6)),
            angle: r1(endAngle + between(-70, 70)),
            size: r1(between(7, 13)),
            delay: r1((next + between(0, 0.5)) * 100) / 100,
          });
        }
      } else {
        if (rand() < 0.45) tips.push({ x: r1(ex), y: r1(ey), r: r1(between(1.2, 2.4)), delay: r1((next + 0.1) * 100) / 100 });
      }
      return;
    }
    if (o.kind === "branch" && depth >= 2) {
      // Foliage along the inner twigs, so the crown reads full, not bare.
      for (const at of [0.5, 1]) {
        if (rand() >= (o.innerLeaf ?? 0)) continue;
        const px = x + (ex - x) * at + (mx - (x + ex) / 2) * (at === 0.5 ? 0.5 : 0);
        const py = y + (ey - y) * at + (my - (y + ey) / 2) * (at === 0.5 ? 0.5 : 0);
        leaves.push({
          x: r1(px),
          y: r1(py),
          angle: r1(endAngle + (rand() < 0.5 ? -1 : 1) * between(30, 80)),
          size: r1(between(6, 11)),
          delay: r1((start + duration * at + between(0.1, 0.5)) * 100) / 100,
        });
      }
    }
    if (o.kind === "branch" && depth >= 1 && depth <= 3) {
      // A few softer leaves deep inside the crown give it volume.
      const n = depth === 1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const at = between(0.35, 0.95);
        leaves.push({
          x: r1(x + (ex - x) * at + between(-5, 5)),
          y: r1(y + (ey - y) * at + between(-5, 5)),
          angle: r1(angle + (rand() < 0.5 ? -1 : 1) * between(35, 85)),
          size: r1(between(6, 10)),
          delay: r1((start + duration * at + between(0.2, 0.7)) * 100) / 100,
          inner: true,
        });
      }
    }
    const kids = rand() < o.threeWay ? 3 : 2;
    for (let i = 0; i < kids; i++) {
      const side = kids === 2 ? (i === 0 ? -1 : 1) : i - 1;
      const turn = side * between(o.spread[0], o.spread[1]) + between(-6, 6);
      grow(ex, ey, endAngle + turn, len * between(o.shrink[0], o.shrink[1]), width * 0.66, depth + 1, next, o);
    }
  }

  const canopy: Opts = {
    kind: "branch",
    maxDepth: 6,
    shrink: [0.76, 0.88],
    spread: [16, 30],
    bias: { angle: -90, amount: 0.45 },
    curl: 0.2,
    pace: 1.35,
    threeWay: 0.25,
    bounds: { minY: 8, maxY: SEED_Y - 70 },
    crown: { cx: SEED_X, cy: 190, rx: 288, ry: 184 },
    innerLeaf: 0.85,
  };
  const roots: Opts = {
    kind: "root",
    maxDepth: 6,
    shrink: [0.8, 0.92],
    spread: [14, 30],
    bias: { angle: 90, amount: 0.5 },
    curl: 0.3,
    pace: 1.2,
    threeWay: 0.08,
    bounds: { minY: SEED_Y + 60, maxY: TREE_H - 10 },
  };

  const top = SEED_Y - SEED_SIZE / 2 + 4;
  const bottom = SEED_Y + SEED_SIZE / 2 - 4;
  const t0 = 0.55; // after the seed appears
  const fork = { x: SEED_X, y: 262 };
  const trunkTime = 1.1;
  // Trunk: one sturdy stem out of the seed, with two vines twisting round it.
  const my = (top + fork.y) / 2;
  limbs.push({
    d: `M${SEED_X} ${r1(top)}C${SEED_X - 6} ${r1(my + 20)} ${SEED_X + 6} ${r1(my - 20)} ${fork.x} ${fork.y}`,
    width: 16,
    depth: 0,
    delay: t0,
    duration: trunkTime,
    kind: "branch",
  });
  for (const side of [-1, 1]) {
    limbs.push({
      d: `M${SEED_X + side * 5} ${r1(top)}C${SEED_X - side * 16} ${r1(my + 26)} ${SEED_X + side * 16} ${r1(my - 22)} ${fork.x - side * 4} ${fork.y - 6}`,
      width: 3,
      depth: 1,
      delay: t0 + 0.1,
      duration: trunkTime,
      kind: "branch",
    });
  }
  // The crown: limbs fan out from the fork, wide and low first, then up.
  const crownStart = t0 + trunkTime * 0.85;
  for (const [a, l, w] of [
    [-170, 96, 6],
    [-140, 92, 7],
    [-112, 88, 8],
    [-90, 84, 8],
    [-68, 88, 8],
    [-40, 92, 7],
    [-10, 96, 6],
  ] as const) {
    grow(fork.x, fork.y, a, l, w, 1, crownStart, canopy);
  }
  // Roots: main roots dive from the bottom of the seed.
  for (const [dx, a, l, w] of [
    [-12, 140, 80, 6],
    [-6, 112, 110, 8],
    [0, 92, 125, 8],
    [6, 68, 110, 8],
    [12, 40, 80, 6],
  ] as const) {
    grow(SEED_X + dx, bottom, a, l, w, 0, t0, roots);
  }

  return { limbs, leaves, tips };
}

/** When the whole drawing has finished growing (seconds). */
export function growthEnd(art: TreeArt): number {
  let end = 0;
  for (const l of art.limbs) end = Math.max(end, l.delay + l.duration);
  for (const l of art.leaves) end = Math.max(end, l.delay + 0.6);
  return end;
}
