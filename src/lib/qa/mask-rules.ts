/**
 * What "Screenshot this page" blacks out on its own, and where it is not offered at all
 * (pure, tested). The browser side (components/qa/capture.ts) applies these to what is on
 * screen; nothing here reads storage, cookies or form values.
 */

/** Pages where the page screenshot is switched off (testers can still attach their own picture). */
export const SCREENSHOT_BLOCKED_PREFIXES = ["/key-signin", "/link-account", "/account/security", "/account/balances/withdraw"] as const;

export function screenshotBlocked(pathname: string): boolean {
  const p = (pathname || "/").replace(/\/+$/, "").toLowerCase() || "/";
  return SCREENSHOT_BLOCKED_PREFIXES.some((b) => p === b || p.startsWith(`${b}/`));
}

/**
 * Text spans that look like a secret, a code or a wallet detail:
 * - long letter+digit runs (addresses, xpubs, transaction ids, setup keys): 25+ characters with both letters and digits
 * - shortened addresses: "0x12ab…cd34", "Tt85...eXMR"
 * - stand-alone 6–8 digit codes ("482913", "482 913") that aren't part of a bigger number
 * - the amount after "Balance:", "Available:" or "In your pocket:"
 */
const PATTERNS: RegExp[] = [
  /(?<![A-Za-z0-9])[A-Za-z0-9]{25,}(?![A-Za-z0-9])/g,
  /(?<![A-Za-z0-9])[A-Za-z0-9]{3,}(?:…|\.{3})[A-Za-z0-9]{3,}(?![A-Za-z0-9])/g,
  /(?<![\d.,])\d{6,8}(?![\d.,])/g,
  /(?<![\d.,])\d{3} \d{3}(?![\d.,])/g,
  /(?<=\b(?:balance|available|in (?:your )?pocket(?: now)?)\s*:\s*)(?:[$€£]\s?)?\d[\d,]*(?:\.\d+)?/gi,
];

const keyLike = (s: string) => !/^\d+$/.test(s) && !/^[A-Za-z]+$/.test(s);

export function sensitiveRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  PATTERNS.forEach((re, i) => {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (i === 0 && !keyLike(m[0])) continue;
      const start = m.index ?? 0;
      out.push([start, start + m[0].length]);
    }
  });
  out.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

/** Table headers whose column is a holding: always masked. "Value" is masked only beside one of them. */
const HOLDING_HEADERS = /^(balance|balances|in pocket|holdings?|available|your balance)$/i;

/** Which columns of a table to black out, given its header texts. */
export function maskedColumns(headers: string[]): number[] {
  const clean = headers.map((h) => h.replace(/\s+/g, " ").trim());
  const holding = clean.map((h, i) => (HOLDING_HEADERS.test(h) ? i : -1)).filter((i) => i >= 0);
  if (!holding.length) return [];
  const value = clean.map((h, i) => (/^(value|usd value|est\.? value)$/i.test(h) ? i : -1)).filter((i) => i >= 0);
  return [...holding, ...value].sort((a, b) => a - b);
}
