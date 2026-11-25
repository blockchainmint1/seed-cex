/**
 * TON -> USD₮ on TON through STON.fi, inside the member's own TON pocket (testers first).
 * Own-pocket swap (coins leave and come back as another coin to the same pocket), so no Telegram tap
 * (Bobby, Nov 25: HC2 "keep tap-free"). Order: fresh quote ≤1% worse than shown (signed minimum = 99% of the fresh quote or better) →
 * dollar caps → USD₮ baseline → row (one open per member) → signed swap whose minimum is written into the message → id recorded
 * before broadcast → done only when the pocket's USD₮ grew by at least the minimum.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { edSendBlocker } from "@/lib/pockets/ed-send-rules";
import { stonMinimum, tonSwapUsd } from "./rules";
import { swapMinimum, tonUnits, TON_JETTON_KEEP, STON_FORWARD_GAS } from "@/lib/pockets/ton-jetton";

const TON = 1_000_000_000n;
export const MIN_SWAP_TON = 1n * TON / 10n; // 0.1 TON
export const MAX_SWAP_TON = 2_000n * TON;

export function stonBlocker(tester: boolean, link: { mode: string; hasKey: boolean; pockets: string[] } | null): string | null {
  const stage = edSendBlocker("TON", tester);
  if (stage) return stage.replace("deposits and withdrawals", "swaps");
  if (!link) return "Link your trading pocket first (Account → Security).";
  if (link.mode !== "access" || !link.hasKey) return "Your pocket is linked in approve-every-trade mode. Swaps need instant access for now.";
  if (!link.pockets.includes("TON")) return "Your linked pocket has no TON pocket yet. Re-link your wallet (Account → Security) to add it.";
  return null;
}

export function parseOffer(amount: string): bigint {
  const u = tonUnits(amount);
  if (u < MIN_SWAP_TON) throw new Error("Swap at least 0.1 TON.");
  if (u > MAX_SWAP_TON) throw new Error("Swap at most 2,000 TON at a time for now.");
  return u;
}

export async function quoteTonToUsdt(amount: string) {
  const offer = parseOffer(amount);
  const { stonQuote } = await import("@/lib/pockets/ton-usdt.server");
  const ask = await stonQuote(offer);
  return { offerUnits: offer.toString(), outUnits: ask.toString(), out: Number(ask) / 1e6, minOut: Number(swapMinimum(ask)) / 1e6, networkTon: Number(STON_FORWARD_GAS + TON_JETTON_KEEP) / 1e9 };
}

export async function tonSwapContext(userId: string, tester: boolean) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  const blocker = stonBlocker(tester, link);
  const pocket = link?.addresses.TON ?? null;
  let balanceTon: number | null = null, balanceUsdt: number | null = null;
  if (pocket) {
    const [{ fetchExtraBalance }, { usdtTonBalance }] = await Promise.all([import("@/lib/pockets/io.server"), import("@/lib/pockets/ton-usdt.server")]);
    const [t, u] = await Promise.all([fetchExtraBalance("TON", pocket).catch(() => null), usdtTonBalance(pocket)]);
    balanceTon = t; balanceUsdt = u === null ? null : Number(u) / 1e6;
  }
  return { blocker, pocket, balanceTon, balanceUsdt };
}

export async function startTonToUsdt(userId: string, tester: boolean, input: { amount: string; shownOutUnits: string }) {
  const { withPocketSpendLock } = await import("@/lib/set-asides.server");
  return withPocketSpendLock(userId, async () => {
    const { loadLink } = await import("@/lib/xchain/send.server");
    const link = await loadLink(userId);
    const block = stonBlocker(tester, link);
    if (block || !link) throw new Error(block ?? "Link your trading pocket first.");
    const pocket = link.addresses.TON!;
    const offer = parseOffer(input.amount);
    if (!/^\d{1,18}$/.test(input.shownOutUnits)) throw new Error("Get a fresh price first.");
    const shown = BigInt(input.shownOutUnits);
    const { stonQuote, usdtTonBalance, sendStonSwap } = await import("@/lib/pockets/ton-usdt.server");
    const fresh = await stonQuote(offer);
    // Audit TA2: the signed minimum follows Seeds' own fresh quote, never the browser's number alone.
    const minOut = stonMinimum(shown, fresh);
    // Audit TA3: same per-swap and 24-hour dollar caps as every other own-pocket swap.
    const { fetchQuotes, TRACKED } = await import("@/lib/cmc.server");
    const tonUsd = (await fetchQuotes(TRACKED).catch(() => null))?.quotes.find((q) => q.symbol === "TON")?.price ?? null;
    const amountUsd = tonSwapUsd(offer, tonUsd);
    if (amountUsd === null) throw new Error("Seeds couldn't price TON right now. Nothing was sent — try again in a minute.");
    const { swapLimitsFor } = await import("@/lib/xchain/send-rules");
    const limits = swapLimitsFor(tester);
    const baseline = await usdtTonBalance(pocket);
    if (baseline === null) throw new Error("Seeds couldn't read your USD₮ balance on TON right now. Nothing was sent.");
    const { data: id, error } = await supabaseAdmin.rpc("reserve_ton_swap", {
      _row: { user_id: userId, link_id: link.id, pocket, offer_units: offer.toString(), shown_units: shown.toString(), quote_units: fresh.toString(),
        min_out_units: minOut.toString(), usdt_baseline: baseline.toString(), amount_usd: amountUsd } as never,
      _per_swap_max_usd: limits.perSwapUsd, _daily_max_usd: limits.dailyUsd,
    });
    if (error || !id) throw new Error(error?.code === "23505" ? "You already have a TON swap on its way. Wait for it to finish." : (error?.message?.replace(/^.*?ERROR:\s*/, "") || "Couldn't start the swap. Nothing was sent."));
    const row = { id: id as string };
    try {
      await sendStonSwap(link, pocket, offer, minOut, async (txid, meta) => {
        const { error: e } = await supabaseAdmin.from("ton_swaps").update({ txid, send_meta: meta ?? null }).eq("id", row.id).eq("status", "signing").is("txid", null);
        if (e) throw new Error("Couldn't record the swap before sending. Nothing was sent.");
      });
      await supabaseAdmin.from("ton_swaps").update({ status: "sent" }).eq("id", row.id).eq("status", "signing");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const { data: cur } = await supabaseAdmin.from("ton_swaps").select("txid").eq("id", row.id).maybeSingle();
      await supabaseAdmin.from("ton_swaps").update({ status: cur?.txid ? "unknown" : "failed", error: msg.slice(0, 300) }).eq("id", row.id).eq("status", "signing");
      if (!cur?.txid) throw new Error(msg);
    }
    return { id: row.id };
  });
}

type Row = { id: string; pocket: string; status: string; txid: string | null; min_out_units: string; usdt_baseline: string; send_meta: unknown; created_at: string; updated_at: string };

/** Never re-sends: only looks at the pocket's USD₮ and the recorded message. */
export async function checkTonSwap(r: Row): Promise<string> {
  if (!["sent", "unknown", "signing"].includes(r.status)) return r.status;
  if (r.status === "signing" && !r.txid) {
    if (Date.now() - Date.parse(r.updated_at) > 600_000) await supabaseAdmin.from("ton_swaps").update({ status: "failed", error: "Stopped before sending. Nothing left your pocket." }).eq("id", r.id).eq("status", "signing").is("txid", null);
    return r.status;
  }
  const { usdtTonBalance } = await import("@/lib/pockets/ton-usdt.server");
  const now = await usdtTonBalance(r.pocket);
  if (now !== null && now - BigInt(r.usdt_baseline) >= BigInt(r.min_out_units)) {
    await supabaseAdmin.from("ton_swaps").update({ status: "done", received_units: (now - BigInt(r.usdt_baseline)).toString() } as never).eq("id", r.id).in("status", ["sent", "unknown", "signing"]);
    return "done";
  }
  // STON.fi refunds the TON to the same pocket when the price misses the minimum; after 30 minutes
  // with no USD₮, leave it for the team rather than guess (never re-sent either way).
  if (Date.now() - Date.parse(r.created_at) > 30 * 60_000 && r.status !== "unknown")
    await supabaseAdmin.from("ton_swaps").update({ status: "unknown", error: "No USD₮ arrived yet. If the price missed your minimum, STON.fi returns the TON to your pocket." }).eq("id", r.id).eq("status", "sent");
  return r.status;
}

export async function listTonSwaps(userId: string) {
  const { data } = await supabaseAdmin.from("ton_swaps").select("id, pocket, status, txid, offer_units, min_out_units, usdt_baseline, received_units, send_meta, error, created_at, updated_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  const rows = (data ?? []).map((x) => ({ ...x, min_out_units: String(x.min_out_units), usdt_baseline: String(x.usdt_baseline), offer_units: String(x.offer_units), received_units: x.received_units == null ? null : String(x.received_units) })) as (Row & { offer_units: string; received_units: string | null; error: string | null })[];
  for (const r of rows) if (["sent", "unknown", "signing"].includes(r.status)) r.status = await checkTonSwap(r).catch(() => r.status);
  return rows.map((r) => ({ id: r.id, status: r.status, txid: r.txid, ton: Number(r.offer_units) / 1e9, minUsdt: Number(r.min_out_units) / 1e6,
    gotUsdt: r.received_units ? Number(r.received_units) / 1e6 : null, error: r.error, createdAt: r.created_at }));
}
