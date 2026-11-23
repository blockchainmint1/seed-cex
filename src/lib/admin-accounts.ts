/**
 * Pure rules for the /admin/accounts table. Search, sort and paging run in the
 * database (admin_accounts_page) so only the rows on screen leave the server;
 * TSD balances are read only for those rows.
 */
export type AccountSortKey = "displayName" | "createdAt" | "hasVault" | "activeAuthorizations" | "authorizedCap" | "openOrders" | "trades" | "tradedQuoteValue" | "lastActivity";
export const SORT_KEYS: readonly AccountSortKey[] = ["displayName", "createdAt", "hasVault", "activeAuthorizations", "authorizedCap", "openOrders", "trades", "tradedQuoteValue", "lastActivity"];
export const PAGE_SIZES = [25, 50, 100] as const;
/**
 * The page opens on join date, newest first: the database picks those rows first and
 * only totals up the page. Activity sorts (Value, Trades…) total every member first.
 */
export const DEFAULT_SORT: { key: AccountSortKey; dir: "asc" | "desc" } = { key: "createdAt", dir: "desc" };
/** Matches called off before anything moved. They never traded, so no count or value includes them (same as the public tape). */
export const CALLED_OFF_TRADE_STATUSES = ["timed_out", "refunded"] as const;
/** The same list as a PostgREST `not.in` filter value. */
export const CALLED_OFF_FILTER = `(${CALLED_OFF_TRADE_STATUSES.join(",")})`;
/** A broken link (no address can be worked out from its keys) is retried once a day, not every 5 minutes. */
export const LINK_ADDRESS_RETRY_MS = 24 * 60 * 60 * 1000;

/** Whether a trade counts in "trades" and "traded value" figures. */
export function countsAsTraded(status: string): boolean {
  return !(CALLED_OFF_TRADE_STATUSES as readonly string[]).includes(status);
}
/** Most TSD balances one request may read: the biggest page. */
export const MAX_TSD_READS = 100;
/** Shortest text that also searches addresses (shorter would match nearly every address of a coin). */
export const MIN_ADDRESS_SEARCH = 6;
/** Most members one address search may hand to the page query. */
export const MAX_ADDRESS_HITS = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSortKey(k: unknown): k is AccountSortKey {
  return typeof k === "string" && (SORT_KEYS as readonly string[]).includes(k);
}

/** Numbers and dates start biggest/newest first; names start A→Z. */
export function defaultDir(k: AccountSortKey): "asc" | "desc" {
  return k === "displayName" ? "asc" : "desc";
}

/** Rows per page: one of PAGE_SIZES, anything else falls back to the smallest. */
export function pageSize(n: unknown): number {
  return (PAGE_SIZES as readonly number[]).includes(n as number) ? (n as number) : PAGE_SIZES[0];
}

/** The lowercase start of an address to look up, or null when the text can't be (part of) an address. */
export function addressSearchTerm(q: string): string | null {
  const s = q.trim().toLowerCase();
  return s.length >= MIN_ADDRESS_SEARCH && s.length <= 120 && /^[a-z0-9]+$/.test(s) ? s : null;
}

/** Page numbers from the total and the offset the server actually used (it snaps back past the end). */
export function pageInfo(total: number, offset: number, size: number, shown: number): { page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(0, Math.floor(offset / size)), pages - 1);
  return { page, pages, from: shown ? offset + 1 : 0, to: offset + shown };
}

/** Member ids whose TSD may be read in one request: valid ids only, no repeats, at most one page. */
export function tsdReadIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((i): i is string => typeof i === "string" && UUID.test(i)))].slice(0, MAX_TSD_READS);
}

/** Client-side paging for smaller admin tables: clamp so a shrinking search never leaves you on an empty page. */
export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number; from: number; to: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const slice = rows.slice(p * size, p * size + size);
  return { rows: slice, page: p, pages, from: slice.length ? p * size + 1 : 0, to: p * size + slice.length };
}
