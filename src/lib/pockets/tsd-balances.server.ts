// Server-only: TSD held in members' trading pockets (address 1106/0/0 from pocket_addresses),
// read through the shared balance cache a few at a time. Display only — never for sends.
export async function readTsdBalances(userIds: string[]): Promise<Record<string, number | null>> {
  if (!userIds.length) return {};
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: links } = await supabaseAdmin.from("hme_links").select("id, user_id").eq("status", "active").in("user_id", userIds);
  const linkIds = (links ?? []).map((l) => l.id);
  const { data: addrs } = linkIds.length
    ? await supabaseAdmin.from("pocket_addresses").select("link_id, user_id, address").eq("coin", "TXC").in("link_id", linkIds)
    : { data: [] as { link_id: string; user_id: string; address: string }[] };
  const { fetchOmniBalance } = await import("../omni.server");
  const { shared } = await import("@/lib/cache/shared-cache.server");
  const { CACHE_TIMES, balanceKey } = await import("@/lib/cache/shared-cache-rules");
  const jobs = (addrs ?? []).map((a) => ({ userId: a.user_id, address: a.address }));
  const out: Record<string, number | null> = {};
  // A few at a time so the TEXITcoin node isn't hit with a whole page at once.
  for (let i = 0; i < jobs.length; i += 6) {
    await Promise.all(jobs.slice(i, i + 6).map(async (j) => {
      const b = await shared(balanceKey("tsd", j.address), { ...CACHE_TIMES.balance, good: (v) => v.online }, () => fetchOmniBalance(j.address)).catch(() => null);
      out[j.userId] = b && b.online ? b.balance : null;
    }));
  }
  return out;
}
