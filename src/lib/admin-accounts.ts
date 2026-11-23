/** Pure search / sort / paging rules for the /admin/accounts table. */
export type AccountRowLike = {
  userId: string; displayName: string; createdAt: string; hasVault: boolean;
  txcAddress: string | null; evmAddress: string | null; activeAuthorizations: number;
  authorizedCap: number; openOrders: number; trades: number; tradedQuoteValue: number; lastActivity: string | null;
  /** TSD in the member's trading pocket; null = not linked or not read yet. */
  tsd?: number | null;
};
export type AccountSortKey = "displayName" | "createdAt" | "hasVault" | "activeAuthorizations" | "authorizedCap" | "openOrders" | "trades" | "tradedQuoteValue" | "lastActivity" | "tsd";
export const PAGE_SIZES = [25, 50, 100] as const;

/** Name, address or user id, case-insensitive. */
export function filterAccounts<T extends AccountRowLike>(rows: T[], q: string): T[] {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => [r.displayName, r.txcAddress ?? "", r.evmAddress ?? "", r.userId].some((v) => v.toLowerCase().includes(s)));
}

/** Numbers and dates start biggest/newest first; names start A→Z. */
export function defaultDir(k: AccountSortKey): "asc" | "desc" {
  return k === "displayName" ? "asc" : "desc";
}

/** Stable sort; missing dates always sink to the bottom whichever way you sort. */
export function sortAccounts<T extends AccountRowLike>(rows: T[], key: AccountSortKey, dir: "asc" | "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r: T): string | number | null => {
    if (key === "displayName") return r.displayName.toLowerCase();
    if (key === "createdAt" || key === "lastActivity") return r[key] ? new Date(r[key] as string).getTime() : null;
    if (key === "hasVault") return r.hasVault ? 1 : 0;
    if (key === "tsd") return r.tsd ?? null;
    return r[key];
  };
  return rows.map((r, i) => ({ r, i, v: val(r) })).sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i;
    if (a.v === null) return 1;
    if (b.v === null) return -1;
    if (a.v < b.v) return -sign;
    if (a.v > b.v) return sign;
    return a.i - b.i;
  }).map((x) => x.r);
}

/** Clamp the page so a shrinking search never leaves you on an empty page. */
export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const slice = rows.slice(p * size, p * size + size);
  return { rows: slice, page: p, pages, from: slice.length ? p * size + 1 : 0, to: p * size + slice.length };
}
