import { createServerFn } from "@tanstack/react-start";

export type PublicStats = {
  generatedAt: string;
  markets: {
    pair: string;
    label: string;
    route: string;
    lastPrice: number | null;
    baseVolume: number;
    quoteVolume: number;
    bid: number | null;
    ask: number | null;
  }[];
  totals: {
    pairs: number;
    trades24h: number;
    tradesAll: number;
    openOrders: number;
    settledLegs: number;
    pendingLegs: number;
    failedLegs: number;
    vaults: number;
    apiKeys: number;
  };
  custody: {
    keysHeld: number;
    nextExpiry: string | null;
    lastSweep: string | null;
    keysWipedTotal: number;
  };
};

export const getPublicStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicStats> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { allSnapshots } = await import("./cmc-api.server");
    const { PAIRS } = await import("./chains");

    const since = new Date(Date.now() - 86_400_000).toISOString();

    const [
      snaps,
      tradesAll,
      trades24h,
      openOrders,
      legs,
      vaults,
      apiKeys,
      custodySnap,
      wiped,
    ] = await Promise.all([
      allSnapshots().catch(() => []),
      supabaseAdmin.from("trades").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("trades")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      supabaseAdmin.from("escrows").select("status"),
      supabaseAdmin.from("wallets").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("api_keys").select("id", { count: "exact", head: true }),
      supabaseAdmin.rpc("custody_snapshot"),
      supabaseAdmin.from("custody_attestations").select("keys_wiped"),
    ]);

    const legRows = (legs.data ?? []) as { status: string }[];
    const count = (s: string) => legRows.filter((l) => l.status === s).length;
    const snapRow = Array.isArray(custodySnap.data) ? custodySnap.data[0] : null;

    const routeFor = (pairId: string) =>
      `/trade/${pairId.toLowerCase().split("_").reverse().join("-")}`;

    return {
      generatedAt: new Date().toISOString(),
      markets: PAIRS.map((p) => {
        const s = snaps.find((x) => x.pair.id === p.id);
        return {
          pair: p.id,
          label: p.id.replace("_", " / "),
          route: routeFor(p.id),
          lastPrice: s?.lastPrice ?? null,
          baseVolume: s?.baseVolume ?? 0,
          quoteVolume: s?.quoteVolume ?? 0,
          bid: s?.bid ?? null,
          ask: s?.ask ?? null,
        };
      }),
      totals: {
        pairs: PAIRS.length,
        trades24h: trades24h.count ?? 0,
        tradesAll: tradesAll.count ?? 0,
        openOrders: openOrders.count ?? 0,
        settledLegs: count("settled") + count("confirmed"),
        pendingLegs: legRows.filter((l) => /pending|broadcast|funded/.test(l.status)).length,
        failedLegs: legRows.filter((l) => /fail/.test(l.status)).length,
        vaults: vaults.count ?? 0,
        apiKeys: apiKeys.count ?? 0,
      },
      custody: {
        keysHeld: snapRow?.keys_held ?? 0,
        nextExpiry: snapRow?.next_expiry ?? null,
        lastSweep: snapRow?.last_sweep ?? null,
        keysWipedTotal: (wiped.data ?? []).reduce(
          (a: number, r: { keys_wiped: number | null }) => a + (r.keys_wiped ?? 0),
          0,
        ),
      },
    };
  },
);
