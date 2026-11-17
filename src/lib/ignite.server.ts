// Server-only Ignite helpers shared by self checkout and Peer Pay.
import { SEAT_CAPACITY } from "./ignite-registration";

/** Seats held by everyone except `excludeUserId`: confirmed, or with a live/short invoice. */
export async function seatsFull(excludeUserId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { count } = await supabaseAdmin.from("ignite_registrations").select("id", { count: "exact", head: true })
    .neq("user_id", excludeUserId)
    .or(`status.eq.confirmed,and(status.in.(pending,underpaid),invoice_expires_at.gt.${now})`);
  return (count ?? 0) >= SEAT_CAPACITY;
}

export function peerSecret() {
  const s = process.env.EMAIL_LINK_SECRET;
  if (!s) throw new Error("Peer Pay isn't configured yet.");
  return s;
}
