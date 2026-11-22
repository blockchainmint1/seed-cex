import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PAIR_IDS, getLeg, getPair, type LegId } from "@/lib/chains";

/** Signed-in: what's set aside in my pocket for open orders, trades being paid and P2P sales, per coin. */
export const getMySetAsides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSetAsides } = await import("./set-asides.server");
    return { byLeg: await loadSetAsides(context.userId) };
  });

/** Signed-in: for the order ticket, each side's pocket balance, what's set aside and what's free. Display only. */
export const getMyTicketFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ pair: z.enum(PAIR_IDS) }).parse(i))
  .handler(async ({ data, context }) => {
    const pair = getPair(data.pair);
    const { loadSetAsides } = await import("./set-asides.server");
    const { activeLink, pocketLegBalance } = await import("./pocket-send/pocket.server");
    const { pocketForLeg } = await import("./pocket-send/rules");
    const [held, link] = await Promise.all([loadSetAsides(context.userId), activeLink(context.userId)]);
    const one = async (leg: LegId) => {
      const setAside = held[leg]?.total ?? 0;
      const address = link?.addresses[pocketForLeg(leg)];
      const symbol = getLeg(leg).symbol;
      if (!address) return { symbol, balance: null as number | null, setAside, available: null as number | null };
      const b = await pocketLegBalance(address, leg, 0, { balanceOnly: true, display: true });
      return { symbol, balance: b.balance, setAside, available: b.balance == null ? null : Math.max(0, b.balance - setAside) };
    };
    const [base, quote] = await Promise.all([one(pair.baseLeg), one(pair.quoteLeg)]);
    return { linked: Boolean(link), base, quote };
  });
