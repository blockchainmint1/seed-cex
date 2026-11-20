import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { dbFail, iso, memberDb } from "../supabase";

export default defineTool({
  name: "list_my_swaps",
  title: "List my swaps",
  description: "The signed-in member's own swaps — cross-chain (THORChain or Maya) and token swaps (Uniswap, PancakeSwap, PulseX) — newest first, with status and transaction ids.",
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
    const { data: dex, error: dexErr } = await db
      .from("dex_swaps")
      .select("id, network, venue_name, symbol_in, symbol_out, amount_in, amount_usd, shown_out, amount_out, status, swap_txid, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (dexErr) dbFail("your token swaps", dexErr);
    for (const d of dex ?? []) {
      swaps.push({
        id: d.id,
        protocol: `${d.venue_name ?? "pool"} (${d.network})`,
        from: d.symbol_in,
        to: d.symbol_out,
        amount_in: Number(d.amount_in),
        value_usd: Number(d.amount_usd),
        expected_out: d.amount_out == null ? Number(d.shown_out) : Number(d.amount_out),
        status: d.status,
        send_txid: d.swap_txid,
        payout_txid: null,
        created_at: iso(d.created_at),
      });
    }
    swaps.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    swaps.splice(limit);
    const text = swaps.length
      ? swaps.map((s) => `${s.id}: ${s.amount_in} ${s.from} → ${s.to} via ${s.protocol} — ${s.status}`).join("\n")
      : "No swaps found.";
    return { content: [{ type: "text", text }], structuredContent: { swaps } };
  },
});
