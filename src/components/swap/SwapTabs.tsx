import { Link } from "@tanstack/react-router";

/** Switch between the two kinds of swap. */
export function SwapTabs({ active }: { active: "cross" | "tokens" }) {
  const base = "rounded-sm px-3 py-1.5 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors";
  const on = "bg-primary/15 text-primary border border-primary/50";
  const off = "border border-border text-muted-foreground hover:text-foreground";
  return (
    <nav aria-label="Swap type" className="flex flex-wrap gap-2">
      <Link to="/swap" className={`${base} ${active === "cross" ? on : off}`} aria-current={active === "cross" ? "page" : undefined}>
        Chain to chain · THORChain &amp; Maya
      </Link>
      <Link to="/swap/tokens" className={`${base} ${active === "tokens" ? on : off}`} aria-current={active === "tokens" ? "page" : undefined}>
        Any coin · Uniswap, PancakeSwap, PulseX
      </Link>
    </nav>
  );
}
