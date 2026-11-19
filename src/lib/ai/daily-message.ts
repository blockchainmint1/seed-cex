/** Wording of the daily Seeds AI Telegram check (pure). Telegram HTML mode. */
import type { Move } from "./plan";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function dailyMessage(p: {
  planName: string;
  day: string;
  moves: Move[];
  hold: { symbol: string; pct: number }[];
  valueUsd: number;
  commitTsd: number;
  reviewUrl: string;
  executionLive: boolean;
}): string {
  const change = p.valueUsd / p.commitTsd - 1;
  const lines = [`🌱 <b>Seeds AI · ${esc(p.planName)}</b> · ${p.day}`, ""];
  if (p.moves.length) {
    lines.push("Based on your plan, we should:");
    for (const m of p.moves) lines.push(`• ${m.action === "buy" ? "Buy" : "Sell"} ${esc(m.coin)} — about ${usd(m.usd)} (to ${m.toPct.toFixed(0)}%)`);
  } else {
    if (p.hold.length) {
      lines.push("Based on your plan, no changes today. Keep holding:");
      for (const h of p.hold) lines.push(`• ${esc(h.symbol)} ${h.pct.toFixed(0)}%`);
    } else lines.push("Based on your plan, no changes today. Keep everything in TSD.");
  }
  lines.push("", `Plan value: ${usd(p.valueUsd)} (${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% on ${p.commitTsd.toLocaleString("en-US")} TSD)`);
  if (!p.executionLive) lines.push("<i>Paper plan — real buying is off for this plan, so nothing is bought or sold.</i>");
  lines.push(`Review: ${p.reviewUrl}`);
  return lines.join("\n");
}
