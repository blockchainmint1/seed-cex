/** Receive addresses of a link's extra pocket coins (HME Wallet can't hold these), from its stored public keys. */
import { chainForPath } from "@/lib/hme-link.server";
import { pocketReceiveAddress } from "./derive";
import { HME_WALLET_CANT_HOLD } from "./hme-support";
import type { PocketCoin } from "./coins";

export function extraPocketAddresses(link: { account: number; paths: unknown; xpubs: unknown }): Partial<Record<PocketCoin, string>> {
  const xpubs = (link.xpubs ?? {}) as Record<string, string>;
  const out: Partial<Record<PocketCoin, string>> = {};
  for (const path of (Array.isArray(link.paths) ? link.paths : []) as string[]) {
    const info = chainForPath(path);
    if (!info || info.account !== link.account || !xpubs[info.chain]) continue;
    const coin = info.chain as PocketCoin;
    if (!HME_WALLET_CANT_HOLD.includes(coin)) continue;
    try { out[coin] = pocketReceiveAddress(coin, xpubs[info.chain]); } catch { /* skip malformed legacy row */ }
  }
  return out;
}
