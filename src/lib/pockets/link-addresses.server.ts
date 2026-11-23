/**
 * Each pocket link's receive addresses (child 0/0), worked out once from the
 * link's public keys and saved in pocket_addresses. A link's keys never change
 * (hme_links history trigger), so the saved list never goes stale. Admin pages
 * read these rows instead of re-deriving every member on every load.
 * No key is opened here; nothing moves coins.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pocketReceiveAddress } from "./derive";
import { POCKET_COINS, type PocketCoin } from "./coins";
import { chainForPath } from "../hme-link.server";

export type LinkKeys = { id: string; user_id: string; account: number; paths: unknown; xpubs: unknown };

/** Every coin the link carries a key for, in POCKET_COINS order. Malformed keys are skipped. */
export function deriveLinkAddresses(link: Pick<LinkKeys, "account" | "paths" | "xpubs">): { coin: PocketCoin; address: string }[] {
  const xpubs = (link.xpubs ?? {}) as Record<string, string>;
  const found = new Map<string, string>();
  for (const path of (Array.isArray(link.paths) ? link.paths : []) as string[]) {
    const info = chainForPath(path);
    if (!info || info.account !== link.account || !xpubs[info.chain] || found.has(info.chain)) continue;
    try { found.set(info.chain, pocketReceiveAddress(info.chain as PocketCoin, xpubs[info.chain]!)); } catch { /* malformed legacy key */ }
  }
  return POCKET_COINS.filter((c) => found.has(c)).map((coin) => ({ coin, address: found.get(coin)! }));
}

/** Save one link's addresses (idempotent — rows are permanent, repeats are ignored). */
export async function saveLinkAddresses(link: LinkKeys): Promise<{ coin: PocketCoin; address: string }[]> {
  const list = deriveLinkAddresses(link);
  if (list.length) {
    const { error } = await supabaseAdmin.from("pocket_addresses")
      .upsert(list.map((a) => ({ link_id: link.id, user_id: link.user_id, coin: a.coin, address: a.address })),
        { onConflict: "link_id,coin", ignoreDuplicates: true });
    if (error) console.error("[pocket-addresses] save failed", link.id, error.message);
  }
  return list;
}

/** Called right after a link row is inserted. Never fails the link: the backfill job catches anything missed. */
export async function saveLinkAddressesById(linkId: string): Promise<void> {
  try {
    const { data } = await supabaseAdmin.from("hme_links").select("id, user_id, account, paths, xpubs").eq("id", linkId).maybeSingle();
    if (data) await saveLinkAddresses(data as LinkKeys);
  } catch (e) {
    console.error("[pocket-addresses] link-time save failed", linkId, e);
  }
}

/** A few links per run (derivation is CPU work) whose addresses were never saved; active links first. */
export async function backfillLinkAddresses(limit = 25): Promise<{ saved: number }> {
  const { data: ids } = await supabaseAdmin.rpc("links_missing_addresses", { _limit: limit });
  const list = ((ids ?? []) as unknown as string[]).filter(Boolean);
  if (!list.length) return { saved: 0 };
  const { data: links } = await supabaseAdmin.from("hme_links").select("id, user_id, account, paths, xpubs").in("id", list);
  let saved = 0;
  for (const l of links ?? []) { if ((await saveLinkAddresses(l as LinkKeys)).length) saved++; }
  return { saved };
}
