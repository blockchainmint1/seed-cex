import { fmtTsd } from "@/lib/markets/thor-markets";

/** $1.24T · $88.3M · $950 */
export function usdCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return "$" + v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: v >= 1000 ? 2 : 0 });
}

export function usdPrice(v: number | null | undefined): string {
  return v == null ? "—" : "$" + fmtTsd(v);
}

/** 20.11M BTC */
export function coins(v: number | null | undefined, symbol: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })} ${symbol}`;
}

/** Coin amounts with sensible decimals: 1.25 BTC, 0.004311 BTC, 12,400 DOGE. */
export function amount(v: number): string {
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 1 ? 4 : 6;
  return v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
}

export function ago(at: number | string): string {
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!Number.isFinite(t)) return "—";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
