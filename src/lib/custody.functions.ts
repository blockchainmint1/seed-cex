import { createServerFn } from "@tanstack/react-start";

export type CustodySnapshot = {
  keysHeld: number;
  nextExpiry: string | null;
  lastSweep: string | null;
  lastWiped: number;
  history: { takenAt: string; keysHeld: number; keysWiped: number }[];
};

/**
 * Public custody transparency. Counts only — never identities or addresses.
 * Runs the expiry sweep first so the number shown is the number actually held.
 */
export const getCustodySnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<CustodySnapshot> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.rpc("purge_expired_delegations");

    const [{ data: snap }, { data: history }] = await Promise.all([
      supabaseAdmin.rpc("custody_snapshot"),
      supabaseAdmin
        .from("custody_attestations")
        .select("taken_at, keys_held, keys_wiped")
        .order("taken_at", { ascending: false })
        .limit(24),
    ]);

    const row = Array.isArray(snap) ? snap[0] : null;

    return {
      keysHeld: row?.keys_held ?? 0,
      nextExpiry: row?.next_expiry ?? null,
      lastSweep: row?.last_sweep ?? null,
      lastWiped: row?.last_wiped ?? 0,
      history: (history ?? []).map((h) => ({
        takenAt: h.taken_at,
        keysHeld: h.keys_held,
        keysWiped: h.keys_wiped,
      })),
    };
  },
);
