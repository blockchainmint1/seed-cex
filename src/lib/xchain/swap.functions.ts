import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SEND_PILOT_ADMIN_ONLY, swapLimitsFor } from "./send-rules";
import { SWAP_COIN_IDS, swapCoin } from "./assets";
import { destinationValid, toBaseUnits } from "./safety";

/** Public: live THORChain + Maya availability and prices for every swap coin. */
export const getSwapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { swapStatus } = await import("./router.server");
  return swapStatus();
});

const quoteInput = z.object({
  from: z.enum(SWAP_COIN_IDS),
  to: z.enum(SWAP_COIN_IDS),
  amount: z.string().trim().max(32),
  destination: z.string().trim().max(128).optional().default(""),
});

/**
 * Public: side-by-side THORChain and Maya quotes with the pre-send safety checks.
 * Read-only — nothing is signed or sent, and vault addresses are not returned.
 */
export const getSwapQuotes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => quoteInput.parse(input))
  .handler(async ({ data }) => {
    const { requireIpAllowance } = await import("@/lib/ip-rate.server");
    const { IP_LIMITS } = await import("@/lib/ip-rate");
    await requireIpAllowance("quote", IP_LIMITS.quote);
    const from = swapCoin(data.from)!;
    const to = swapCoin(data.to)!;
    if (from.id === to.id) throw new Error("Pick two different coins.");
    const amount = toBaseUnits(data.amount);
    if (amount == null) throw new Error("Enter an amount with at most 8 decimal places.");
    const destination = data.destination || null;
    if (destination && !destinationValid(to, destination)) {
      throw new Error(`That doesn't look like a ${to.network} address (${to.addressHint}).`);
    }
    const { swapQuotes } = await import("./router.server");
    return swapQuotes(from, to, amount, destination);
  });

async function callerIsAdmin(supabase: { from: (t: "user_roles") => any }, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "beta"]).limit(1);
  return Boolean(data?.length);
}

/** Signed-in: the member's linked pocket (addresses only), limits and their recent swaps. */
export const getSwapSendContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const isAdmin = await callerIsAdmin(context.supabase as never, context.userId);
    const { swapSendContext, refreshSwapSends, listSwapSends } = await import("./send.server");
    await refreshSwapSends(context.userId).catch((e) => console.error("swap refresh failed", e));
    const [ctx, sends] = await Promise.all([swapSendContext(context.userId), listSwapSends(context.userId)]);
    return { isAdmin, pilotAdminOnly: SEND_PILOT_ADMIN_ONLY, limits: swapLimitsFor(isAdmin), link: ctx.link, sends };
  });

const sendInput = z.object({
  from: z.enum(SWAP_COIN_IDS),
  to: z.enum(SWAP_COIN_IDS),
  amount: z.string().trim().min(1).max(32),
  destination: z.string().trim().min(10).max(128),
  shownOut: z.number().positive(),
  protocol: z.enum(["thorchain", "maya"]).optional().default("thorchain"),
  /** Set on the second call, after the member tapped Approve in Telegram (outside addresses only). */
  approvalId: z.string().uuid().optional(),
});

/** Signed-in: send a THORChain or Maya swap from the member's instant-access trading pocket. */
export const sendSwap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendInput.parse(input))
  .handler(async ({ data, context }) => {
    const { pilotTesterAccess } = await import("@/lib/admin-guard");
    const isAdmin = await pilotTesterAccess(context as never);
    const { sendSwapFromPocket } = await import("./send.server");
    return sendSwapFromPocket(context.userId, isAdmin, data, undefined, { claims: context.claims, approvalId: data.approvalId });
  });

/** Signed-in: where my outside-address swap approval stands (the Swap page polls this). */
export const getSwapApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("send_approvals")
      .select("id, status, expires_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("purpose", "swap_out")
      .maybeSingle();
    if (!row) return { status: "missing" as const, expiresAt: null };
    const live = Date.parse(row.expires_at) > Date.now();
    const status = (row.status === "pending" || row.status === "approved") && !live ? "expired" : row.status;
    return { status: status as string, expiresAt: row.expires_at };
  });
