import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdminAccountRow = {
  userId: string;
  displayName: string;
  createdAt: string;
  hasVault: boolean;
  txcAddress: string | null;
  evmAddress: string | null;
  activeAuthorizations: number;
  authorizedCap: number;
  openOrders: number;
  trades: number;
  tradedQuoteValue: number;
  lastActivity: string | null;
};

export type AdminTradeRow = {
  id: string;
  pair: string;
  side: string;
  price: number;
  amount: number;
  status: string;
  makerId: string | null;
  takerId: string | null;
  createdAt: string;
  expiresAt: string;
  legs: { leg: string; status: string; txid: string | null }[];
};

export type AdminOrderRow = {
  id: string;
  pair: string;
  side: string;
  price: number;
  amount: number;
  filled: number;
  status: string;
  userId: string | null;
  createdAt: string;
};

export type AdminOverview = {
  generatedAt: string;
  totals: {
    accounts: number;
    vaults: number;
    activeAuthorizations: number;
    authorizedCapTotal: number;
    openOrders: number;
    openTrades: number;
    trades24h: number;
    tradesAll: number;
    tradedQuoteValue24h: number;
    tradedQuoteValueAll: number;
    failedLegs: number;
    pendingLegs: number;
    apiKeys: number;
    withdrawals: number;
  };
  accounts: AdminAccountRow[];
  openTrades: AdminTradeRow[];
  recentTrades: AdminTradeRow[];
  openOrders: AdminOrderRow[];
};

async function assertAdmin(supabase: {
  from: (t: "user_roles") => {
    select: (c: string) => {
      eq: (
        c: string,
        v: string,
      ) => {
        eq: (
          c: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
}, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return Boolean(data);
  });

const OPEN_TRADE_STATUSES = [
  "matched",
  "maker_funded",
  "taker_funded",
  "both_funded",
  "disputed",
];

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 86_400_000).toISOString();

    const [profiles, wallets, delegations, orders, trades, escrows, apiKeys, withdrawals] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, display_name, created_at"),
        supabaseAdmin.from("wallets").select("user_id, txc_address, evm_address"),
        supabaseAdmin
          .from("wallet_delegations")
          .select("user_id, asset, chain, max_amount, expires_at, revoked_at"),
        supabaseAdmin
          .from("orders")
          .select("id, user_id, pair, side, price, amount, filled, status, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("trades")
          .select(
            "id, pair, side, price, amount, status, maker_id, taker_id, created_at, expires_at",
          )
          .order("created_at", { ascending: false })
          .limit(500),
        supabaseAdmin.from("escrows").select("trade_id, leg, status, release_txid"),
        supabaseAdmin.from("api_keys").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("withdrawals").select("id", { count: "exact", head: true }),
      ]);

    const profileRows = profiles.data ?? [];
    const walletRows = wallets.data ?? [];
    const delegationRows = delegations.data ?? [];
    const orderRows = orders.data ?? [];
    const tradeRows = trades.data ?? [];
    const escrowRows = escrows.data ?? [];

    const now = Date.now();
    const liveDelegations = delegationRows.filter(
      (d) => !d.revoked_at && new Date(d.expires_at).getTime() > now,
    );

    const legsByTrade = new Map<string, { leg: string; status: string; txid: string | null }[]>();
    for (const e of escrowRows) {
      const list = legsByTrade.get(e.trade_id) ?? [];
      list.push({ leg: e.leg, status: e.status, txid: e.release_txid ?? null });
      legsByTrade.set(e.trade_id, list);
    }

    const mapTrade = (t: (typeof tradeRows)[number]): AdminTradeRow => ({
      id: t.id,
      pair: t.pair,
      side: t.side,
      price: Number(t.price),
      amount: Number(t.amount),
      status: t.status,
      makerId: t.maker_id,
      takerId: t.taker_id,
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      legs: legsByTrade.get(t.id) ?? [],
    });

    const quoteValue = (t: (typeof tradeRows)[number]) => Number(t.price) * Number(t.amount);

    const accounts: AdminAccountRow[] = profileRows
      .map((p) => {
        const wallet = walletRows.find((w) => w.user_id === p.id);
        const mine = liveDelegations.filter((d) => d.user_id === p.id);
        const myOrders = orderRows.filter((o) => o.user_id === p.id);
        const myTrades = tradeRows.filter((t) => t.maker_id === p.id || t.taker_id === p.id);
        const times = [
          ...myOrders.map((o) => o.created_at),
          ...myTrades.map((t) => t.created_at),
        ].sort();
        return {
          userId: p.id,
          displayName: p.display_name,
          createdAt: p.created_at,
          hasVault: Boolean(wallet),
          txcAddress: wallet?.txc_address ?? null,
          evmAddress: wallet?.evm_address ?? null,
          activeAuthorizations: mine.length,
          authorizedCap: mine.reduce((a, d) => a + Number(d.max_amount ?? 0), 0),
          openOrders: myOrders.filter((o) => o.status === "open" || o.status === "partial").length,
          trades: myTrades.length,
          tradedQuoteValue: myTrades.reduce((a, t) => a + quoteValue(t), 0),
          lastActivity: times.length ? times[times.length - 1]! : null,
        };
      })
      .sort((a, b) => b.tradedQuoteValue - a.tradedQuoteValue);

    const openTradeRows = tradeRows.filter((t) => OPEN_TRADE_STATUSES.includes(t.status));
    const trades24hRows = tradeRows.filter((t) => t.created_at >= since);

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        accounts: profileRows.length,
        vaults: walletRows.length,
        activeAuthorizations: liveDelegations.length,
        authorizedCapTotal: liveDelegations.reduce((a, d) => a + Number(d.max_amount ?? 0), 0),
        openOrders: orderRows.filter((o) => o.status === "open" || o.status === "partial").length,
        openTrades: openTradeRows.length,
        trades24h: trades24hRows.length,
        tradesAll: tradeRows.length,
        tradedQuoteValue24h: trades24hRows.reduce((a, t) => a + quoteValue(t), 0),
        tradedQuoteValueAll: tradeRows.reduce((a, t) => a + quoteValue(t), 0),
        failedLegs: escrowRows.filter((e) => /fail/.test(e.status)).length,
        pendingLegs: escrowRows.filter((e) => /awaiting|funding|confirmed/.test(e.status)).length,
        apiKeys: apiKeys.count ?? 0,
        withdrawals: withdrawals.count ?? 0,
      },
      accounts: accounts.slice(0, 200),
      openTrades: openTradeRows.slice(0, 100).map(mapTrade),
      recentTrades: tradeRows.slice(0, 50).map(mapTrade),
      openOrders: orderRows
        .filter((o) => o.status === "open" || o.status === "partial")
        .slice(0, 100)
        .map((o) => ({
          id: o.id,
          pair: o.pair,
          side: o.side,
          price: Number(o.price),
          amount: Number(o.amount),
          filled: Number(o.filled),
          status: o.status,
          userId: o.user_id,
          createdAt: o.created_at,
        })),
    };
  });
