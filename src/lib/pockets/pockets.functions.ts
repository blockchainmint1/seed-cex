import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Balances for the extra pocket coins (DOGE, BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA) of the
 * caller's own active HME link. Addresses are derived server-side from the
 * stored public keys, so this can't be used to look up arbitrary addresses.
 */
export const getMyExtraPocketBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ({ fresh: Boolean((input as { fresh?: unknown } | undefined)?.fresh === true) }))
  .handler(async ({ context, data: input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("hme_links").select("account, paths, xpubs")
      .eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (!data) return [];
    const { extraPocketAddresses } = await import("./extra-addresses.server");
    const { fetchExtraReading } = await import("./io.server");
    const { POCKET_SPECS } = await import("./coins");
    // Monero balances need a private view-key scan, which Seeds doesn't run, so it isn't listed.
    const rows: { coin: string; address: string; balance: number | null; arriving: number }[] = Object.entries(extraPocketAddresses(data))
      .filter(([coin]) => POCKET_SPECS[coin as keyof typeof POCKET_SPECS]?.balanceReadable)
      .map(([coin, address]) => ({ coin, address: address!, balance: null, arriving: 0 }));
    const { shared } = await import("@/lib/cache/shared-cache.server");
    const { CACHE_TIMES, balanceKey } = await import("@/lib/cache/shared-cache-rules");
    // Display only; sends read the chain live. `arriving` feeds only the "arriving" note.
    await Promise.all(rows.map(async (r) => {
      const v = await shared(balanceKey(`${r.coin.toLowerCase()}-a`, r.address), { ...CACHE_TIMES.balance, force: input.fresh, good: (x) => x.balance !== null },
        () => fetchExtraReading(r.coin as never, r.address));
      r.balance = v.balance;
      r.arriving = v.arriving;
    }));
    return rows;
  });
