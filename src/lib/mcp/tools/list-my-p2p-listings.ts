import { defineTool } from "@lovable.dev/mcp-js";
import { dbFail, iso, memberDb } from "../supabase";

export default defineTool({
  name: "list_my_p2p_listings",
  title: "List my P2P listings",
  description: "The signed-in member's own peer-to-peer marketplace listings: coin, price, limits, payment methods and whether each is active.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const { id, db } = await memberDb(ctx);
    const { data, error } = await db
      .from("p2p_offers")
      .select("id, side, asset, price, price_mode, margin_pct, fee_pct, min_fiat, max_fiat, payment_methods, window_minutes, active, created_at")
      .eq("seller_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) dbFail("your P2P listings", error);
    const listings = (data ?? []).map((o) => ({
      id: o.id,
      side: o.side,
      coin: o.asset,
      price: Number(o.price),
      price_mode: o.price_mode,
      margin_pct: Number(o.margin_pct),
      fee_pct: Number(o.fee_pct),
      min_usd: Number(o.min_fiat),
      max_usd: Number(o.max_fiat),
      payment_methods: o.payment_methods ?? [],
      payment_window_minutes: o.window_minutes,
      active: Boolean(o.active),
      created_at: iso(o.created_at),
    }));
    const text = listings.length
      ? listings.map((l) => `${l.id}: ${l.side} ${l.coin} at ${l.price} ($${l.min_usd}–$${l.max_usd}) — ${l.active ? "active" : "paused"}`).join("\n")
      : "No P2P listings.";
    return { content: [{ type: "text", text }], structuredContent: { listings } };
  },
});
