import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";

/** Bobby's wording, verbatim. Shown on every page until trading goes live. */
export const DEMO_BANNER_PARTS = [
  "DEMO MODE ONLY",
  "ACCOUNT SETUP & WALLET LINK ONLY",
  "TRADING IS NOT LIVE",
  "USE AT YOUR OWN RISK",
] as const;

export function DemoBanner() {
  return (
    <Link
      to="/coming-soon"
      aria-label={`${DEMO_BANNER_PARTS.join(" - ")}. Read about our launch.`}
      className="group block bg-banner text-banner-foreground transition-[filter] hover:brightness-110"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-x-3 px-5 py-2 text-center">
        <AlertTriangle aria-hidden className="hidden size-4 shrink-0 sm:block" strokeWidth={2.25} />
        <p className="text-[11px] font-extrabold uppercase leading-snug tracking-[0.08em] sm:text-xs">
          {DEMO_BANNER_PARTS.map((part, i) => (
            <span key={part}>
              {i > 0 ? <span aria-hidden className="mx-1.5 opacity-70 sm:mx-2">-</span> : null}
              <span className="whitespace-nowrap">{part}</span>{" "}
            </span>
          ))}
        </p>
        <ArrowRight aria-hidden className="hidden size-4 shrink-0 transition-transform group-hover:translate-x-0.5 sm:block" strokeWidth={2.25} />
      </div>
    </Link>
  );
}
