/**
 * Admin → Accounts: one page of members (searched, sorted and paged in the
 * database), each member's TSD balance for the rows on screen, and the full list
 * of a member's trading-pocket receive addresses. Admin only (role + fresh admin code).
 * Addresses come from pocket_addresses (saved from the link's public keys at link
 * time) — no key is opened. Balances are display reads through the shared cache;
 * nothing here moves coins.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";
import type { AdminAccountRow } from "./admin.functions";
import { DEFAULT_SORT, MAX_ADDRESS_HITS, addressSearchTerm, isSortKey, pageSize, tsdReadIds, type AccountSortKey } from "./admin-accounts";

export type AdminPocketAddress = { pocket: string; name: string; covers: string[]; address: string };
export type AdminMemberAddresses = {
  userId: string;
  displayName: string;
  link: { mode: string; createdAt: string; vaultName: string | null; addresses: AdminPocketAddress[] } | null;
  /** Addresses saved on the old pre-HME wallet record, if any. */
  legacy: { coin: string; address: string }[];
};
export type AdminAccountsPage = { total: number; offset: number; rows: AdminAccountRow[] };

type PageRow = {
  user_id: string; display_name: string; created_at: string; has_vault: boolean; link_id: string | null;
  txc_address: string | null; evm_address: string | null; addresses_saved: boolean;
  active_authorizations: number; authorized_cap: number | string; open_orders: number; trades: number;
  traded_value: number | string; last_activity: string | null;
  trading_frozen_at: string | null; trading_frozen_reason: string | null; order_pause_cleared_at: string | null;
};

/** One page of the Accounts table. Search: name, user id, or the start of any pocket / old wallet address. */
export const getAdminAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q?: string; sort?: string; dir?: string; page?: number; size?: number }) => ({
    q: typeof d?.q === "string" ? d.q.slice(0, 120) : "",
    sort: (isSortKey(d?.sort) ? d.sort : DEFAULT_SORT.key) as AccountSortKey,
    desc: d?.dir !== "asc",
    page: Number.isInteger(d?.page) && (d.page as number) >= 0 ? Math.min(d.page as number, 100_000) : 0,
    size: pageSize(d?.size),
  }))
  .handler(async ({ data, context }): Promise<AdminAccountsPage> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Address search is an index lookup on the saved addresses (any pocket the member ever linked).
    const term = addressSearchTerm(data.q);
    let hits: string[] = [];
    if (term) {
      const { data: found } = await supabaseAdmin.from("pocket_addresses").select("user_id").like("address_lc", `${term}%`).limit(MAX_ADDRESS_HITS);
      hits = [...new Set((found ?? []).map((r) => r.user_id))];
    }
    const { data: page, error } = await supabaseAdmin.rpc("admin_accounts_page", {
      _q: data.q, _hits: hits, _sort: data.sort, _desc: data.desc, _limit: data.size, _offset: data.page * data.size,
    });
    if (error || !page) { console.error("[admin-accounts] page failed", error?.message); throw new Error("Couldn't load accounts. Refresh to retry."); }
    const p = page as unknown as { total: number; offset: number; rows: PageRow[] };

    // A link from before addresses were saved at link time: save it now (only rows on screen).
    const unsaved = p.rows.filter((r) => r.link_id && !r.addresses_saved).map((r) => r.link_id!);
    const healed = new Map<string, { txc: string | null; evm: string | null }>();
    if (unsaved.length) {
      const { saveLinkAddresses } = await import("./pockets/link-addresses.server");
      const { data: links } = await supabaseAdmin.from("hme_links").select("id, user_id, account, paths, xpubs").in("id", unsaved);
      for (const l of links ?? []) {
        const list = await saveLinkAddresses(l as never).catch(() => []);
        healed.set(l.id, { txc: list.find((a) => a.coin === "TXC")?.address ?? null, evm: list.find((a) => a.coin === "EVM")?.address ?? null });
      }
    }

    const { recentFailuresByMember } = await import("./order-pause.server");
    const { repeatFailurePause } = await import("./order-readiness");
    const failures = await recentFailuresByMember().catch(() => new Map<string, { at: number[]; lastTradeId: string }>());
    const now = Date.now();
    const rows: AdminAccountRow[] = p.rows.map((r) => {
      const h = r.link_id ? healed.get(r.link_id) : undefined;
      const f = failures.get(r.user_id);
      const pause = f ? repeatFailurePause({ failedAtMs: f.at, clearedAtMs: r.order_pause_cleared_at ? Date.parse(r.order_pause_cleared_at) : null, nowMs: now }) : null;
      return {
        userId: r.user_id,
        displayName: r.display_name,
        createdAt: r.created_at,
        hasVault: r.has_vault,
        linked: Boolean(r.link_id),
        txcAddress: h?.txc ?? r.txc_address,
        evmAddress: h?.evm ?? r.evm_address,
        activeAuthorizations: r.active_authorizations,
        authorizedCap: Number(r.authorized_cap),
        openOrders: r.open_orders,
        trades: r.trades,
        tradedQuoteValue: Number(r.traded_value),
        lastActivity: r.last_activity,
        tradingFrozenAt: r.trading_frozen_at,
        tradingFrozenReason: r.trading_frozen_reason,
        orderPausedUntil: pause?.paused && pause.untilMs ? new Date(pause.untilMs).toISOString() : null,
      };
    });
    return { total: p.total, offset: p.offset, rows };
  });

/** TSD in the trading pocket of the members on screen (their TXC address). userId → balance, null = couldn't read. */
export const getAdminTsdBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds: string[] }) => ({ userIds: tsdReadIds(d?.userIds) }))
  .handler(async ({ data, context }): Promise<Record<string, number | null>> => {
    await requireAdmin(context as never);
    const { readTsdBalances } = await import("./pockets/tsd-balances.server");
    return readTsdBalances(data.userIds);
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
      supabaseAdmin.from("hme_links").select("id, user_id, mode, account, paths, xpubs, created_at, vault_fingerprint")
        .eq("user_id", data.userId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from("wallets").select("txc_address, isk_address, ltc_address, evm_address").eq("user_id", data.userId).maybeSingle(),
    ]);
    if (!prof.data) throw new Error("No such member");
    let linkOut: AdminMemberAddresses["link"] = null;
    if (link.data) {
      const { POCKET_SPECS, POCKET_COINS } = await import("./pockets/coins");
      const { data: saved } = await supabaseAdmin.from("pocket_addresses").select("coin, address").eq("link_id", link.data.id);
      let list = (saved ?? []) as { coin: string; address: string }[];
      if (!list.length) {
        const { saveLinkAddresses } = await import("./pockets/link-addresses.server");
        list = await saveLinkAddresses(link.data as never);
      }
      const found = new Map(list.map((a) => [a.coin, a.address]));
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
