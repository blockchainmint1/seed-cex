import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Balances for the extra pocket coins (DOGE, BCH, ZEC, XRP, TRX, SOL) of the
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
    const { chainForPath } = await import("@/lib/hme-link.server");
    const { pocketReceiveAddress } = await import("./derive");
    const { EXTRA_COINS, fetchExtraBalance } = await import("./io.server");
    const xpubs = data.xpubs as Record<string, string>;
    const rows: { coin: string; address: string; balance: number | null }[] = [];
    for (const path of data.paths as string[]) {
      const info = chainForPath(path);
      if (!info || info.account !== data.account || !xpubs[info.chain]) continue;
      if (!(EXTRA_COINS as string[]).includes(info.chain)) continue;
      try { rows.push({ coin: info.chain, address: pocketReceiveAddress(info.chain, xpubs[info.chain]), balance: null }); } catch { /* skip */ }
    }
    await Promise.all(rows.map(async (r) => { r.balance = await fetchExtraBalance(r.coin as never, r.address); }));
    return rows;
  });
