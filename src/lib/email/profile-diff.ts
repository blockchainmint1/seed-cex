/** Turns a profile before/after into plain lines for the "You changed X" email. Pure. */
const LABELS: Record<string, string> = {
  display_name: "Display name",
  timezone: "Time zone",
  default_pair: "Default market",
  default_auth_cap: "Default authorization cap",
  default_auth_hours: "Default authorization length (hours)",
  confirm_before_order: "Confirm before every order",
  notify_order_filled: "Telegram: order filled",
  notify_settlement: "Telegram: settlement confirmed",
  notify_settlement_failed: "Telegram: settlement failed",
  notify_auth_expiring: "Telegram: authorization expiring",
  notify_deposit: "Telegram: deposit detected",
  notify_login: "Telegram: new sign-in",
  notify_p2p: "Telegram: P2P trades",
  notify_weekly_digest: "Telegram: weekly digest",
  email_trade_confirmations: "Email: trade and P2P confirmations",
  email_weekly_update: "Email: weekly account update",
};

const show = (v: unknown) => (v === true ? "on" : v === false ? "off" : v === null || v === undefined || v === "" ? "none" : String(v));

export function describeProfileChanges(before: Record<string, unknown> | null, after: Record<string, unknown>): { thing: string; lines: string[] } | null {
  if (!before) return null; // first save of a brand-new profile isn't a "change"
  const lines: string[] = [];
  const keys: string[] = [];
  for (const k of Object.keys(LABELS)) {
    if (!(k in after) || before[k] === after[k]) continue;
    keys.push(k);
    lines.push(`${LABELS[k]}: ${show(before[k])} → ${show(after[k])}`);
  }
  if (!lines.length) return null;
  const alertsOnly = keys.every((k) => k.startsWith("notify_") || k.startsWith("email_"));
  const tradingOnly = keys.every((k) => k.startsWith("default_") || k === "confirm_before_order");
  return { thing: alertsOnly ? "notification settings" : tradingOnly ? "trading preferences" : "account settings", lines };
}
