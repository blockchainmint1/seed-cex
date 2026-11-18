import { useMemo } from "react";
import symbol from "@/assets/logo/seeds-symbol-green.png.asset.json";
import { buildTree, SEED_SIZE, SEED_X, SEED_Y, TREE_H, TREE_W } from "@/lib/tree-of-life";

const SYMBOL_RATIO = 319 / 341; // supplied symbol artwork, height / width

/**
 * Homepage hero artwork: a Tree of Life that sprouts from the Seeds symbol —
 * the canopy climbs up, the roots dig down past the hero into the page.
 * Purely decorative (aria-hidden); motion collapses to a fade for
 * reduced-motion visitors (see .tol-* rules in styles.css).
 */
export function TreeOfLife({ className = "" }: { className?: string }) {
  const art = useMemo(() => buildTree(), []);
  const seedW = SEED_SIZE;
  const seedH = SEED_SIZE * SYMBOL_RATIO;
  const branches = art.limbs.filter((l) => l.kind === "branch");
  const roots = art.limbs.filter((l) => l.kind === "root");

  return (
    <svg
      viewBox={`0 0 ${TREE_W} ${TREE_H}`}
      className={`tol ${className}`}
      aria-hidden
      focusable="false"
    >
      <defs>
        <radialGradient id="tol-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--tol-glow)" />
          <stop offset="100%" stopColor="var(--tol-glow)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tol-root-fade" x1="0" y1={SEED_Y} x2="0" y2={TREE_H} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="tol-root-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={TREE_W} height={TREE_H}>
          <rect x="0" y="0" width={TREE_W} height={TREE_H} fill="url(#tol-root-fade)" />
        </mask>
      </defs>

      <g className="tol-art">
      {/* Soft growth glow behind the seed and canopy (never on the logo itself). */}
      <ellipse className="tol-glow" cx={SEED_X} cy={SEED_Y - 150} rx={290} ry={260} fill="url(#tol-glow)" />

      <g className="tol-roots" mask="url(#tol-root-mask)">
        {roots.map((l, i) => (
          <path
            key={`r${i}`}
            d={l.d}
            pathLength={1}
            className="tol-limb tol-root"
            strokeWidth={l.width}
            style={{ animationDelay: `${l.delay}s`, animationDuration: `${l.duration}s`, opacity: 0.9 - l.depth * 0.09 }}
          />
        ))}
        {art.tips.map((t, i) => (
          <circle
            key={`t${i}`}
            cx={t.x}
            cy={t.y}
            r={t.r}
            className="tol-tip"
            style={{ animationDelay: `${t.delay}s, ${t.delay + 0.6 + (i % 7) * 0.4}s` }}
          />
        ))}
      </g>

      <g className="tol-canopy" style={{ transformOrigin: `${SEED_X}px ${SEED_Y - seedH / 2}px` }}>
        {branches.map((l, i) => (
          <path
            key={`b${i}`}
            d={l.d}
            pathLength={1}
            className="tol-limb tol-branch"
            strokeWidth={l.width}
            style={{ animationDelay: `${l.delay}s`, animationDuration: `${l.duration}s`, opacity: 1 - l.depth * 0.08 }}
          />
        ))}
        {art.leaves.map((f, i) => (
          <g key={`f${i}`} transform={`translate(${f.x} ${f.y}) rotate(${f.angle})`}>
            <path
              d={`M0 0Q${f.size * 0.5} ${-f.size * 0.42} ${f.size} 0Q${f.size * 0.5} ${f.size * 0.42} 0 0Z`}
              className={f.inner ? "tol-leaf tol-leaf-inner" : i % 2 === 0 ? "tol-leaf tol-leaf-alt" : "tol-leaf"}
              style={{ animationDelay: `${f.delay}s` }}
            />
          </g>
        ))}
      </g>
      </g>

      <image
        href={symbol.url}
        x={SEED_X - seedW / 2}
        y={SEED_Y - seedH / 2}
        width={seedW}
        height={seedH}
        className="tol-seed"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}
