/**
 * Where Honest.Money's tracking script and help widget may run (pure, tested).
 * Audit 2026-11-19 M4, Bobby's choice "public pages only": they load only on these
 * information pages, never where a member signs in, trades, swaps, links a wallet or
 * administers Seeds. A script can't be unloaded from a page, so entering any other
 * page from one where they ran is a full page load (see HonestMoneyScripts).
 */
const PUBLIC_EXACT = new Set([
  "/", "/to-the-moon", "/to-the-moon/confirmed", "/coming-soon", "/list", "/manifesto", "/terms", "/privacy",
  "/risk", "/custody", "/how-it-works", "/brand", "/stats", "/tsd", "/proof/code", "/api",
]);
const PUBLIC_PREFIXES = ["/about/", "/to-the-moon/"];

export function thirdPartyScriptsAllowed(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PUBLIC_EXACT.has(p) || PUBLIC_PREFIXES.some((pre) => p.startsWith(pre));
}
