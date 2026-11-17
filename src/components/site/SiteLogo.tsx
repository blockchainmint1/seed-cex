import full from "@/assets/logo/seeds-lockup-full.png.asset.json";
import forest from "@/assets/logo/seeds-lockup-forest.png.asset.json";

/**
 * The supplied Seeds lockup (artwork, never retyped). Full color on dark,
 * Deep Forest on Warm Ivory in light mode. Lockup ratio 1152 × 319; the brand
 * minimum screen width is 120px, so the default height is 34px (≈123px wide).
 * Swapped by CSS so it never flickers between themes on load.
 */
export function SiteLogo({ className = "h-[34px]" }: { className?: string }) {
  return (
    <>
      <img src={full.url} alt="Seeds" width={1152} height={319} className={`hidden w-auto dark:block ${className}`} />
      <img src={forest.url} alt="Seeds" width={1152} height={319} className={`block w-auto dark:hidden ${className}`} />
    </>
  );
}
