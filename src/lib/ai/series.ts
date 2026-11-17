/** A coin's daily closing prices, oldest first. Browser- and server-safe. */
export type Series = { days: string[]; closes: number[] };

export const fmtPct = (n: number, d = 1) => (Number.isFinite(n) ? `${n >= 0 ? "+" : ""}${(n * 100).toFixed(d)}%` : "—");
export const fmtUsd = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(n) < 1 ? 6 : Math.abs(n) < 100 ? 2 : 0 })
    : "—";
