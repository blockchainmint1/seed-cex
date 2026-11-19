import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { PAIRS } from "../../chains";
import { dbFail, iso, memberDb } from "../supabase";

const PAIR_IDS = PAIRS.map((p) => p.id) as [string, ...string[]];

export default defineTool({
  name: "list_my_orders",
  title: "List my orders",
  description: "The signed-in member's own Seeds order-book orders, newest first. Optionally filter by status or pair.",
  inputSchema: {
    status: z.enum(["open", "partial", "filled", "cancelled"]).optional().describe("Only orders with this status."),
    pair: z.enum(PAIR_IDS).optional().describe("Only this pair, e.g. TSD_TXC or BTC_TSD."),
    limit: z.number().int().min(1).max(100).default(25).describe("How many orders to return (1-100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, pair, limit }, ctx) => {
    const { id, db } = await memberDb(ctx);
    // The order book is public, so filter to the caller explicitly.
    let q = db
      .from("orders")
      .select("id, pair, side, order_type, price, amount, filled, status, is_demo, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);
    if (pair) q = q.eq("pair", pair);
    const { data, error } = await q;
    if (error) dbFail("your orders", error);
    const orders = (data ?? []).map((o) => ({
      id: o.id,
      pair: o.pair,
      side: o.side,
      type: o.order_type,
      price: Number(o.price),
      amount: Number(o.amount),
      filled: Number(o.filled),
      status: o.status,
      demo: Boolean(o.is_demo),
      created_at: iso(o.created_at),
    }));
    const text = orders.length
      ? orders.map((o) => `${o.id}: ${o.side} ${o.amount} ${o.pair} @ ${o.price} — ${o.status}${o.demo ? " (demo)" : ""}`).join("\n")
      : "No orders found.";
    return { content: [{ type: "text", text }], structuredContent: { orders } };
  },
});
