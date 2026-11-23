/**
 * Admin → Accounts extras: each member's TSD balance and the full list of their
 * trading-pocket receive addresses. Admin only (role + fresh admin code).
 * Addresses are derived from the link's public keys — no key is opened.
 * Balances are display reads through the shared cache; nothing here moves coins.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";

export type AdminPocketAddress = { pocket: string; name: string; covers: string[]; address: string };
export type AdminMemberAddresses = {
  userId: string;
  displayName: string;
  link: { mode: string; createdAt: string; vaultName: string | null; addresses: AdminPocketAddress[] } | null;
  /** Addresses saved on the old pre-HME wallet record, if any. */
  legacy: { coin: string; address: string }[];
};

/** TSD in every linked member's trading pocket (their TXC address). userId → balance, null = couldn't read. */
export const getAdminTsdBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, number | null>> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("hme_links").select("user_id, xpubs").eq("status", "active");
    const { pocketReceiveAddress } = await import("./pockets/derive");
    const { fetchOmniBalance } = await import("./omni.server");
    const { shared } = await import("@/lib/cache/shared-cache.server");
    const { CACHE_TIMES, balanceKey } = await import("@/lib/cache/shared-cache-rules");
    const jobs: { userId: string; address: string }[] = [];
    for (const l of data ?? []) {
      const pub = ((l.xpubs ?? {}) as Record<string, string>)["TXC"];
      if (!pub) continue;
      try { jobs.push({ userId: l.user_id, address: pocketReceiveAddress("TXC", pub) }); } catch { /* malformed legacy row */ }
    }
    const out: Record<string, number | null> = {};
    // A few at a time so the TEXITcoin node isn't hit with every member at once.
    for (let i = 0; i < jobs.length; i += 6) {
      await Promise.all(jobs.slice(i, i + 6).map(async (j) => {
        const b = await shared(balanceKey("tsd", j.address), { ...CACHE_TIMES.balance, good: (v) => v.online }, () => fetchOmniBalance(j.address)).catch(() => null);
        out[j.userId] = b && b.online ? b.balance : null;
      }));
    }
    return out;
  });

/** Every receive address of one member's trading pocket, plus any old wallet addresses. */
export const getAdminMemberAddresses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => {
    if (!d || typeof d.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(d.userId)) throw new Error("Pick a member");
    return { userId: d.userId };
  })
  .handler(async ({ data, context }): Promise<AdminMemberAddresses> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [prof, link, wallet] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("hme_links").select("mode, account, paths, xpubs, created_at, vault_fingerprint")
        .eq("user_id", data.userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("wallets").select("txc_address, isk_address, ltc_address, evm_address").eq("user_id", data.userId).maybeSingle(),
    ]);
    if (!prof.data) throw new Error("No such member");
    let linkOut: AdminMemberAddresses["link"] = null;
    if (link.data) {
      const { pocketReceiveAddress } = await import("./pockets/derive");
      const { chainForPath } = await import("./hme-link.server");
      const { POCKET_SPECS, POCKET_COINS } = await import("./pockets/coins");
      const xpubs = (link.data.xpubs ?? {}) as Record<string, string>;
      const found = new Map<string, string>();
      for (const path of (link.data.paths ?? []) as string[]) {
        const info = chainForPath(path);
        if (!info || info.account !== link.data.account || !xpubs[info.chain]) continue;
        try { found.set(info.chain, pocketReceiveAddress(info.chain as never, xpubs[info.chain])); } catch { /* skip malformed */ }
      }
      linkOut = {
        mode: link.data.mode,
        createdAt: link.data.created_at,
        vaultName: link.data.vault_fingerprint ? `Vault ${link.data.vault_fingerprint}` : null,
        addresses: POCKET_COINS.filter((c) => found.has(c)).map((c) => ({
          pocket: c, name: POCKET_SPECS[c].name, covers: [...POCKET_SPECS[c].covers], address: found.get(c)!,
        })),
      };
    }
    const w = wallet.data;
    const legacy = w ? ([["TXC", w.txc_address], ["ISK", w.isk_address], ["LTC", w.ltc_address], ["EVM", w.evm_address]] as const)
      .filter(([, a]) => Boolean(a)).map(([coin, address]) => ({ coin, address: address as string })) : [];
    return { userId: data.userId, displayName: prof.data.display_name, link: linkOut, legacy };
  });
