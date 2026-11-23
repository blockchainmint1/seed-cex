/**
 * To the Moon hero art: a rocket climbing toward the Moon, with a few stars.
 *
 * Drawn entirely from brand tokens (var(--...)) so it follows light/dark mode
 * like the rest of the page, and sits in the empty right half of the hero
 * beside the headline. Decorative: the headline already says what it is.
 */

/** Four-point sparkle, centred on its own origin so CSS can twinkle it. */
const STAR = "M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z";

/** [x, y, scale, opacity, twinkle delay] — placed clear of the rocket and Moon. */
const STARS: [number, number, number, number, string][] = [
  [52, 96, 1.5, 0.8, "0s"],
  [146, 44, 0.9, 0.6, "1.1s"],
  [258, 26, 1.1, 0.5, "2.2s"],
  [398, 186, 1.15, 0.65, "0.6s"],
  [36, 262, 1.0, 0.55, "1.7s"],
  [26, 392, 1.35, 0.7, "2.8s"],
  [128, 486, 0.95, 0.5, "0.9s"],
  [392, 330, 0.85, 0.5, "2.5s"],
  [356, 452, 1.05, 0.6, "1.4s"],
];

/** Distant pinpoints: no animation, just depth. */
const SPECKS: [number, number, number][] = [
  [200, 70, 2.5],
  [88, 160, 2],
  [300, 470, 2.5],
  [420, 250, 2],
  [60, 470, 2],
  [330, 116, 2],
];

export function MoonRocket({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 440 520"
      role="img"
      aria-label="A rocket climbing toward the Moon among stars"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* The Moon, up and to the right — where the nose is pointed. */}
      <g>
        <circle cx="396" cy="60" r="40" fill="var(--card)" stroke="var(--primary)" strokeWidth="3" />
        <circle cx="384" cy="50" r="8" stroke="var(--primary)" strokeWidth="2" opacity="0.45" />
        <circle cx="408" cy="74" r="5.5" stroke="var(--primary)" strokeWidth="2" opacity="0.45" />
        <circle cx="400" cy="38" r="3.5" stroke="var(--primary)" strokeWidth="2" opacity="0.45" />
      </g>

      {/* Stars: the group carries each star's steady brightness, the path inside
          twinkles (CSS transform only — the positioning lives on the group). */}
      <g>
        {SPECKS.map(([x, y, r]) => (
          <circle key={`s${x}-${y}`} cx={x} cy={y} r={r} fill="var(--foreground)" opacity="0.3" />
        ))}
        {STARS.map(([x, y, s, o, delay]) => (
          <g key={`st${x}-${y}`} transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
            <path className="rocket-star" style={{ animationDelay: delay }} d={STAR} fill="var(--primary)" />
          </g>
        ))}
      </g>

      {/* Float on the outer group, tilt on the inner one: a CSS transform on the
          same element would wipe the rotate attribute. */}
      <g className="rocket-float">
        <g transform="rotate(32 220 260)">
          {/* Exhaust trail: the page's own dot language, fading down the flight line. */}
          <circle cx="220" cy="432" r="8" fill="var(--primary)" opacity="0.5" />
          <circle cx="211" cy="458" r="6" fill="var(--primary)" opacity="0.34" />
          <circle cx="225" cy="482" r="4.5" fill="var(--primary)" opacity="0.24" />
          <circle cx="214" cy="503" r="3.5" fill="var(--primary)" opacity="0.16" />

          {/* Fins, behind the body. */}
          <path
            d="M172 210 C150 232 132 250 124 268 L124 308 L172 288 Z"
            fill="var(--action)"
            stroke="var(--foreground)"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path
            d="M268 210 C290 232 308 250 316 268 L316 308 L268 288 Z"
            fill="var(--action)"
            stroke="var(--foreground)"
            strokeWidth="6"
            strokeLinejoin="round"
          />

          {/* Flame: flickers from its own mouth at the nozzle. */}
          <path className="rocket-flame" d="M202 328 C208 356 214 372 220 404 C226 372 232 356 238 328 Z" fill="var(--action)" />
          <path className="rocket-flame" d="M210 328 C214 348 217 358 220 378 C223 358 226 348 230 328 Z" fill="var(--primary)" opacity="0.85" />

          {/* Nozzle. */}
          <path d="M194 296 L246 296 L238 328 L202 328 Z" fill="var(--surface-raised)" stroke="var(--foreground)" strokeWidth="6" strokeLinejoin="round" />

          {/* Body. */}
          <path
            d="M220 44 C246 84 268 140 268 200 L268 296 L172 296 L172 200 C172 140 194 84 220 44 Z"
            fill="var(--card)"
            stroke="var(--foreground)"
            strokeWidth="6"
            strokeLinejoin="round"
          />

          {/* Band + window. */}
          <rect x="175" y="236" width="90" height="16" rx="4" fill="var(--primary)" opacity="0.28" />
          <circle cx="220" cy="160" r="30" fill="var(--surface-raised)" stroke="var(--primary)" strokeWidth="8" />
          <circle cx="210" cy="150" r="8" fill="var(--primary)" opacity="0.35" />
        </g>
      </g>
    </svg>
  );
}
