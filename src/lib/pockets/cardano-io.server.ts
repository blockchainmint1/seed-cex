/**
 * Cardano network I/O for sends (server only): coins at an address, current slot,
 * fee settings and broadcast, all through Koios' public API. Reads fail closed.
 */
import { hex } from "@scure/base";
import type { AdaParams, AdaUtxo } from "./cardano-tx";

const KOIOS = "https://api.koios.rest/api/v1";
const JSON_H = { "content-type": "application/json", accept: "application/json", "user-agent": "seeds.honest.money" };

async function koios<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${KOIOS}${path}`, { ...init, headers: { ...JSON_H, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`Cardano network read failed (${r.status})`);
  return (await r.json()) as T;
}

/** Confirmed coins at the address. Coins carrying tokens are flagged so they're never spent. */
export async function adaUtxos(address: string): Promise<AdaUtxo[]> {
  const rows = await koios<{ tx_hash: string; tx_index: number; value: string; asset_list?: unknown[] | null }[]>(
    "/address_utxos", { method: "POST", body: JSON.stringify({ _addresses: [address], _extended: true }) });
  return rows.map((u) => ({ txHash: u.tx_hash, index: u.tx_index, lovelace: BigInt(u.value), hasTokens: Array.isArray(u.asset_list) && u.asset_list.length > 0 }));
}

export async function adaLovelace(address: string): Promise<bigint> {
  return (await adaUtxos(address)).reduce((s, u) => s + u.lovelace, 0n);
}

/** Current slot; sends are valid for 2 hours after it. */
export async function adaTtl(): Promise<number> {
  const [tip] = await koios<{ abs_slot: number }[]>("/tip");
  if (!tip?.abs_slot) throw new Error("Cardano network couldn't be read");
  return tip.abs_slot + 7200;
}

/** Live fee settings, refused when they look nothing like Cardano's (protects the fee cap math). */
export async function adaParams(): Promise<AdaParams> {
  const [p] = await koios<{ min_fee_a: number; min_fee_b: number; coins_per_utxo_size: string }[]>(
    "/epoch_params?limit=1&select=min_fee_a,min_fee_b,coins_per_utxo_size");
  if (!p) throw new Error("Cardano network couldn't be read");
  const out = { minFeeA: BigInt(p.min_fee_a), minFeeB: BigInt(p.min_fee_b), coinsPerUtxoByte: BigInt(p.coins_per_utxo_size) };
  if (out.minFeeA > 1000n || out.minFeeB > 2_000_000n || out.coinsPerUtxoByte > 20_000n) throw new Error("Cardano fee settings look wrong. Nothing was sent.");
  return out;
}

export async function adaSubmit(cborHex: string): Promise<string> {
  const r = await fetch(`${KOIOS}/submittx`, { method: "POST", headers: { "content-type": "application/cbor", "user-agent": "seeds.honest.money" }, body: Uint8Array.from(hex.decode(cborHex)).buffer as ArrayBuffer });
  const text = await r.text();
  if (!r.ok) throw new Error(`Cardano refused the send: ${text.slice(0, 200)}`);
  return text.replace(/"/g, "").trim();
}
