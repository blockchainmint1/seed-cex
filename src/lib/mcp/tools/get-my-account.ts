import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { dbFail, iso, memberDb } from "../supabase";

export default defineTool({
  name: "get_my_account",
  title: "Get my account",
  description:
    "The signed-in member's Seeds account summary: display name, reputation, completed trades, security and alert settings.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { id, db } = await memberDb(ctx);
    const { data, error } = await db
      .from("profiles")
      .select("display_name, reputation, trades_completed, created_at, timezone, default_pair, hm_status, two_factor_on, telegram_verified, onboarding_status")
      .eq("id", id)
      .maybeSingle();
    if (error) dbFail("your account", error);
    if (!data) throw new ToolError("No Seeds account found for this sign-in.");
    const account = {
      display_name: data.display_name,
      reputation: data.reputation,
      trades_completed: data.trades_completed,
      member_since: iso(data.created_at),
      timezone: data.timezone,
      default_pair: data.default_pair,
      honest_money_status: data.hm_status,
      two_factor_on: Boolean(data.two_factor_on),
      telegram_alerts_connected: Boolean(data.telegram_verified),
      setup_guide: data.onboarding_status,
    };
    const text = `${account.display_name ?? "Member"} — ${account.trades_completed ?? 0} completed trades, 2FA ${account.two_factor_on ? "on" : "off"}, Telegram alerts ${account.telegram_alerts_connected ? "connected" : "not connected"}.`;
    return { content: [{ type: "text", text }], structuredContent: { account } };
  },
});
