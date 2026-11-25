/**
 * Shortcut hint: when a member asks for USD₮ on TON from another coin but their TON pocket
 * already holds enough TON, suggest the one-step TON → USD₮ swap instead (faster, fewer fees).
 * Pure; the hint only pre-fills the form — it never sends anything.
 */
export function tonShortcutAmount(i: { usd: number | null; usdtPerTon: number | null; balanceTon: number | null; feeTon: number }): string | null {
  const { usd, usdtPerTon, balanceTon, feeTon } = i;
  if (usd == null || usdtPerTon == null || balanceTon == null) return null;
  if (!(usd > 0) || !(usdtPerTon > 0) || !(balanceTon > 0)) return null;
  const need = Math.ceil((usd / usdtPerTon) * 1e4) / 1e4;
  if (need + feeTon > balanceTon) return null;
  return String(need);
}
