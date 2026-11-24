/**
 * Cardano coin lists from two independent services (audit Z4): Koios and NowNodes' Rosetta node.
 * Pure, tested. When both answer they must list exactly the same coins at the same sizes, or the
 * send is refused; a coin either service says carries tokens is never spent. One answering is enough.
 */
import type { AdaUtxo } from "./cardano-tx";

type RosettaCoin = { coin_identifier?: { identifier?: unknown }; amount?: { value?: unknown; currency?: { symbol?: unknown } }; metadata?: unknown };

/** Rosetta /account/coins → coins, or null when the answer isn't well formed. */
export function rosettaAdaUtxos(r: { coins?: unknown } | null): AdaUtxo[] | null {
  if (!r || !Array.isArray(r.coins)) return null;
  const out: AdaUtxo[] = [];
  for (const c of r.coins as RosettaCoin[]) {
    const id = c?.coin_identifier?.identifier;
    const v = c?.amount?.value;
    if (typeof id !== "string" || !/^[0-9a-f]{64}:\d+$/i.test(id) || typeof v !== "string" || !/^\d+$/.test(v)) return null;
    if (c.amount?.currency?.symbol !== "ADA") return null;
    const [txHash, idx] = id.split(":") as [string, string];
    const meta = c.metadata;
    const hasTokens = meta != null && typeof meta === "object" && Object.keys(meta).length > 0;
    out.push({ txHash: txHash.toLowerCase(), index: Number(idx), lovelace: BigInt(v), hasTokens });
  }
  return out;
}

/** Combine both readings. null input = that service didn't answer. Throws when neither answered or they disagree. */
export function agreeAdaUtxos(koios: AdaUtxo[] | null, rosetta: AdaUtxo[] | null): AdaUtxo[] {
  if (!koios && !rosetta) throw new Error("Cardano network couldn't be read. Nothing was sent.");
  if (!koios || !rosetta) return (koios ?? rosetta)!;
  const key = (u: AdaUtxo) => `${u.txHash.toLowerCase()}:${u.index}`;
  const other = new Map(rosetta.map((u) => [key(u), u]));
  if (other.size !== koios.length || rosetta.length !== koios.length) throw new Error("Two Cardano services disagree about your coins. Nothing was sent — try again in a minute.");
  return koios.map((u) => {
    const o = other.get(key(u));
    if (!o || o.lovelace !== u.lovelace) throw new Error("Two Cardano services disagree about your coins. Nothing was sent — try again in a minute.");
    return { ...u, hasTokens: u.hasTokens || o.hasTokens };
  });
}
