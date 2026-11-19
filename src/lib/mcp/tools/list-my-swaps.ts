import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbFail, iso, memberDb } from "../supabase";

export default defineTool({
  name: "list_my_swaps",
  title: "List my swaps",
  description: "The signed-in member's own cross-chain swaps (THORChain or Maya), newest first, with status and transaction ids.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(20).describe("How many swaps to return (1-50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const { id, db } = await memberDb(ctx);
    const { data, error } = await db
      .from("swap_sends")
      .select("id, protocol, from_asset, to_asset, amount_in, amount_usd, expected_out, status, txid, out_txid, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) dbFail("your swaps", error);
    const swaps = (data ?? []).map((s) => ({
      id: s.id,
      protocol: s.protocol,
      from: s.from_asset,
      to: s.to_asset,
      amount_in: s.amount_in == null ? null : Number(s.amount_in),
      value_usd: s.amount_usd == null ? null : Number(s.amount_usd),
      expected_out: s.expected_out == null ? null : Number(s.expected_out),
      status: s.status,
      send_txid: s.txid,
      payout_txid: s.out_txid,
      created_at: iso(s.created_at),
    }));
    const text = swaps.length
      ? swaps.map((s) => `${s.id}: ${s.amount_in} ${s.from} → ${s.to} via ${s.protocol} — ${s.status}`).join("\n")
      : "No swaps found.";
    return { content: [{ type: "text", text }], structuredContent: { swaps } };
  },
});
