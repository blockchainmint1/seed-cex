/**
 * The Seeds AI check question in Telegram (pure, tested): "You're X. The rule says Y.
 * What would you like to do?" plus the option buttons. Telegram HTML mode.
 *
 * Kinds:
 *  - sell-to-tsd: the rule moves a coin to TSD → follow it, override (keep holding), or skip today
 *  - stay-in-tsd: the plan is in TSD and the rule says stay → stay, or override (buy now)
 *  - trade:       buys / rebalancing the rule wants → do it, or skip today
 */
import type { AiChoice } from "./execute-rules";

export type DecisionKind = "sell-to-tsd" | "stay-in-tsd" | "trade";
export type DecisionRow = { side: string; symbol: string; amount: number; usd: number };
export type DecisionButton = { label: string; choice: AiChoice } | { label: string; url: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const units = (n: number) => Number(n.toFixed(8)).toString();

/** Which question a day asks: a sell of a coin the plan now wants 0% of is the rule going to cash. */
export function decisionKind(i: { rows: { side: string; coin: string }[]; targets: Record<string, number>; waitingInTsd: boolean; canBuyNow: boolean }): DecisionKind | null {
  if (i.rows.some((r) => r.side === "sell" && !((i.targets[r.coin] ?? 0) > 0.001))) return "sell-to-tsd";
  if (i.rows.length) return "trade";
  return i.waitingInTsd && i.canBuyNow ? "stay-in-tsd" : null;
}

export function decisionMessage(p: {
  kind: DecisionKind;
  planName: string;
  day: string;
  /** What the plan owns now: TSD plus coin holdings (with dollar value). */
  holding: { tsd: number; coins: { symbol: string; units: number; usd: number }[] };
  /** Why the rule says TSD, one line per coin (sell-to-tsd / stay-in-tsd). */
  reasons: string[];
  rows: DecisionRow[];
  total: number;
  oneTap: boolean;
  oneTapLimit: number;
  /** Estimated TSD a buy-now override would spend (stay-in-tsd). */
  buyNowTsd?: number;
  siteUrl: string;
}): { text: string; buttons: DecisionButton[][] } {
  const lines = [`🌱 <b>Seeds AI · ${esc(p.planName)}</b> · ${p.day}`, ""];
  const held = p.holding.coins.filter((c) => c.units > 0);
  const you = held.length
    ? `You hold ${held.map((c) => `${units(c.units)} ${esc(c.symbol)} (about ${usd(c.usd)})`).join(", ")}${p.holding.tsd >= 0.01 ? ` and ${units(p.holding.tsd)} TSD` : ""}.`
    : `You're in TSD: ${units(p.holding.tsd)} TSD.`;
  lines.push(`<b>Now:</b> ${you}`);
  const rowLines = p.rows.map((r) => r.side === "buy" ? `• Buy ${esc(r.symbol)} with ${units(r.amount)} TSD` : `• Sell ${units(r.amount)} ${esc(r.symbol)} (about ${usd(r.usd)}) for TSD`);
  if (p.kind === "stay-in-tsd") {
    lines.push(`<b>The rule says:</b> stay in TSD. ${p.reasons.map(esc).join(". ")}.`);
  } else if (p.kind === "sell-to-tsd") {
    lines.push(`<b>The rule says:</b> move to TSD. ${p.reasons.map(esc).join(". ")}.`, ...rowLines);
  } else {
    lines.push("<b>The rule says:</b>", ...rowLines);
  }
  if (p.rows.length) lines.push(`Total about ${usd(p.total)}. Each trade is a normal TSD swap from your own trading pocket.`);
  lines.push("", "<b>What would you like to do?</b>");

  const confirm = (label: string): DecisionButton => p.oneTap ? { label, choice: "yes" } : { label: `${label} (confirm on Seeds)`, url: p.siteUrl };
  const buttons: DecisionButton[][] = [];
  if (p.kind === "sell-to-tsd") {
    buttons.push([confirm("✅ Follow the rule: sell to TSD")], [{ label: "✋ Override: keep holding", choice: "keep" }], [{ label: "Skip today", choice: "no" }]);
  } else if (p.kind === "stay-in-tsd") {
    buttons.push([{ label: "✅ Follow the rule: stay in TSD", choice: "no" }], [{ label: `⚡ Override: buy now${p.buyNowTsd ? ` (about ${usd(p.buyNowTsd)})` : ""}`, choice: "now" }]);
  } else {
    buttons.push([confirm("✅ Do it")], [{ label: "Skip today", choice: "no" }]);
  }
  if (p.kind !== "stay-in-tsd") lines.push(p.oneTap ? "Tap a button and it's done. Nothing moves until you tap." : `This is over your ${usd(p.oneTapLimit)} one-tap limit, so following the rule is confirmed on Seeds.`);
  else lines.push(`Overriding lines up the buy${(p.buyNowTsd ?? 0) > p.oneTapLimit ? ` — over your ${usd(p.oneTapLimit)} one-tap limit it's confirmed on Seeds` : " and starts it right away"}. Your rules then look forward from today.`);
  if (p.kind !== "stay-in-tsd") lines.push("This request ends in 20 hours.");
  return { text: lines.join("\n"), buttons };
}
