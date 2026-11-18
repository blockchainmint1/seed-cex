import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Balances for the extra pocket coins (DOGE, BCH, ZEC, XRP, TRX, SOL, DASH, ATOM, RUNE, ADA) of the
 * caller's own active HME link. Addresses are derived server-side from the
 * stored public keys, so this can't be used to look up arbitrary addresses.
 */
export const getMyExtraPocketBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("hme_links").select("account, paths, xpubs")
      .eq("user_id", context.userId).eq("status", "active").maybeSingle();
    if (!data) return [];
    const { extraPocketAddresses } = await import("./extra-addresses.server");
    const { fetchExtraBalance } = await import("./io.server");
    const { POCKET_SPECS } = await import("./coins");
    // Monero balances need a private view-key scan, which Seeds doesn't run, so it isn't listed.
    const rows: { coin: string; address: string; balance: number | null }[] = Object.entries(extraPocketAddresses(data))
      .filter(([coin]) => POCKET_SPECS[coin as keyof typeof POCKET_SPECS]?.balanceReadable)
      .map(([coin, address]) => ({ coin, address: address!, balance: null }));
    await Promise.all(rows.map(async (r) => { r.balance = await fetchExtraBalance(r.coin as never, r.address); }));
    return rows;
  });
