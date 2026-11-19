import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callerId, dbFail, iso, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_trades",
  title: "List my trades",
  description: "The signed-in member's own Seeds order-book trades (as maker or taker), newest first, with settlement status.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(25).describe("How many trades to return (1-100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const id = callerId(ctx); // a verified UUID, safe inside the filter
    const { data, error } = await supabaseForUser(ctx)
      .from("trades")
      .select("id, pair, side, price, amount, status, is_demo, maker_id, created_at")
      .or(`maker_id.eq.${id},taker_id.eq.${id}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) dbFail("your trades", error);
    const trades = (data ?? []).map((t) => ({
      id: t.id,
      pair: t.pair,
      your_role: t.maker_id === id ? "maker" : "taker",
      taker_side: t.side,
      price: Number(t.price),
      amount: Number(t.amount),
      status: t.status,
      demo: Boolean(t.is_demo),
      created_at: iso(t.created_at),
    }));
    const text = trades.length
      ? trades.map((t) => `${t.id}: ${t.amount} ${t.pair} @ ${t.price} as ${t.your_role} — ${t.status}${t.demo ? " (demo)" : ""}`).join("\n")
      : "No trades found.";
    return { content: [{ type: "text", text }], structuredContent: { trades } };
  },
});
