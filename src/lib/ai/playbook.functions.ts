import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** AI write-ups per member per rolling 24 hours. */
export const PLAYBOOK_NOTES_PER_DAY = 10;

const stats = z.object({ ret: z.number().finite(), cagr: z.number().finite(), dd: z.number().finite(), years: z.number().finite().min(0) });
const pick = z.object({
  rules: z.string().trim().min(1).max(300),
  older: stats, fresh: stats, heldUp: z.boolean(), freshRank: z.number().int().min(1), trades: z.number().int().min(0), fees: z.number().finite().min(0),
});
const input = z.object({
  goal: z.enum(["growth", "balanced", "smooth"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), split: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coins: z.array(z.string().trim().min(1).max(12)).min(1).max(12),
  amount: z.number().finite().positive(),
  total: z.number().int().min(1).max(1000),
  holdOlder: stats, holdFresh: stats,
  picks: z.array(pick).min(1).max(3),
  mine: pick.optional(),
});

const INSTRUCTIONS = `You explain back-test results for Seeds, a crypto exchange, to ordinary members who are not finance experts.
Write in plain, warm English. No jargon (say "worst drop" not "drawdown", "yearly growth" not "CAGR"). No hype, no emojis.
You are given rule combinations that were ranked using only the OLDER part of the history; the FRESH part was held back and only used afterwards to check them.
In at most 150 words:
1. Say which playbook came out on top for the member's goal and what its rules actually do, in one or two sentences.
2. Say honestly whether it held up on the fresh data, using the numbers given (percentages, rounded). If it faded, say so clearly and point to a pick that held up better if there is one.
3. Mention one trade-off (trading costs, number of trades, time sitting in TSD, or a big worst drop).
4. End with one short sentence that past results don't predict the future and this is not financial advice.
Never invent numbers that are not in the data. Never promise returns. Never tell the member to buy or sell.`;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
/** Yearly growth when the stretch is over a year, otherwise plain growth — labelled either way. */
const growth = (s: z.infer<typeof stats>) => (s.years > 1 ? `yearly growth ${pct(s.cagr)}` : `growth ${pct(s.ret)} (under a year)`);
const line = (label: string, p: z.infer<typeof pick>, total: number) =>
  `${label}: ${p.rules} | older part: ${growth(p.older)}, worst drop ${pct(p.older.dd)} | fresh part: ${growth(p.fresh)}, worst drop ${pct(p.fresh.dd)}, ranked #${p.freshRank} of ${total} on fresh data (${p.heldUp ? "held up" : "faded"}) | ${p.trades} trades, $${p.fees.toFixed(2)} in trading costs`;

/** Signed-in: a short AI write-up of the playbook finder's results. Limited per member per day. */
export const explainPlaybooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await supabaseAdmin.from("ai_playbook_notes").select("id", { count: "exact", head: true }).eq("user_id", context.userId).gte("created_at", since);
    if ((count ?? 0) >= PLAYBOOK_NOTES_PER_DAY) return { ok: false as const, error: `You've used today's ${PLAYBOOK_NOTES_PER_DAY} AI write-ups. The ranking above still works — try again tomorrow for a new write-up.` };
    await supabaseAdmin.from("ai_playbook_notes").insert({ user_id: context.userId, goal: data.goal });

    const goalName = { growth: "Most growth", balanced: "Balanced (growth minus worst drop)", smooth: "Smoothest ride (worst drop weighs 3x)" }[data.goal];
    const prompt = [
      `Member's goal: ${goalName}. Coins: ${data.coins.join(", ")}. Starting amount $${data.amount}.`,
      `Tested ${data.from} to ${data.to}. Older part (used to rank): ${data.from} to ${data.split}. Fresh part (check only): ${data.split} to ${data.to}.`,
      `${data.total} rule combinations were tried.`,
      `Simply buying and holding the same coins: older part ${growth(data.holdOlder)}, worst drop ${pct(data.holdOlder.dd)}; fresh part ${growth(data.holdFresh)}, worst drop ${pct(data.holdFresh.dd)}.`,
      ...data.picks.map((p, i) => line(`Pick #${i + 1}`, p, data.total)),
      ...(data.mine ? [line("The member's current settings", data.mine, data.total)] : []),
    ].join("\n");

    const { generateResponse, GatewayError } = await import("@lovable.dev/ai-gateway");
    try {
      const res = await generateResponse({
        model: "openai/gpt-6.1-sol",
        instructions: INSTRUCTIONS,
        input: prompt,
        max_output_tokens: 1200,
        reasoning: { effort: "low" },
      });
      const text = (res.output ?? [])
        .flatMap((item) => (item.type === "message" ? item.content : []))
        .map((c) => (c.type === "output_text" ? c.text : ""))
        .join("").trim();
      if (!text) return { ok: false as const, error: "The AI didn't send back a write-up. The ranking above is unaffected — try again in a minute." };
      return { ok: true as const, text };
    } catch (e) {
      if (e instanceof GatewayError) {
        console.error("playbook note failed", e.code, e.httpStatus);
        return { ok: false as const, error: "The AI write-up isn't available right now. The ranking above is unaffected — try again in a minute." };
      }
      throw e;
    }
  });
