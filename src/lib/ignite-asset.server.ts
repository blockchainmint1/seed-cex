/**
 * Which asset actually paid an Ignite seat.
 *
 * NectarPay's invoice only reports the *chain* the money landed on ("txc"), never
 * the asset. A payment can be native TXC or any Omni property on that chain (TSD
 * #39, wBTC #43, ...), so the asset is read back off the chain itself: the Omni
 * OP_RETURN payload of the transaction that funded the invoice address.
 *
 * Server-only: the chain read goes out from here, never from a browser tab.
 */
import { getChain } from "./chains";

const OMNI_MAGIC = "6f6d6e69"; // "omni"
const SATS = 100_000_000;

export type OmniSend = { propertyId: number; amount: number };

/**
 * Reads an Omni simple-send out of a transaction output script.
 * Payload shape: "omni" + 8-byte property id + 8-byte amount (satoshis); some
 * wallets prepend a 4-byte version/type, so property and amount are the last
 * 16 bytes. Returns null for anything that isn't a simple send we can read.
 */
export function parseOmniSendPayload(scriptPubkeyHex: string | null | undefined): OmniSend | null {
  const hex = (scriptPubkeyHex ?? "").toLowerCase().trim();
  if (!hex.startsWith("6a")) return null; // OP_RETURN
  const at = hex.indexOf(OMNI_MAGIC);
  if (at < 0) return null;
  const rest = hex.slice(at + OMNI_MAGIC.length);
  if (rest.length < 32 || !/^[0-9a-f]+$/.test(rest)) return null;
  const tail = rest.slice(-32);
  const propertyId = Number(BigInt(`0x${tail.slice(0, 16)}`));
  const amount = Number(BigInt(`0x${tail.slice(16)}`) / BigInt(SATS));
  if (!Number.isFinite(propertyId) || propertyId <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { propertyId, amount };
}

/** Symbol for an Omni property id on the TEXITcoin chain, or null if we don't list it. */
export function omniSymbolForProperty(propertyId: number): string | null {
  return getChain("txc").assets.find((a) => a.omniPropertyId === propertyId)?.symbol ?? null;
}

/**
 * The asset that funded an invoice address, e.g. "TSD". Null when the chain can't
 * be read or the payment isn't one we can name — callers then show the chain alone.
 */
export async function resolvePaidAsset(chain: string | null | undefined, address: string | null | undefined): Promise<string | null> {
  if (!chain || !address || chain.toLowerCase() !== "txc") return null;
  const { fetchAddressTxs } = await import("./txc.server");
  const txs = await fetchAddressTxs(address);
  if (!txs) return null;
  let paidNative = false;
  for (const tx of txs) {
    const outs = tx.vout ?? [];
    if (!outs.some((o) => o.scriptpubkey_address === address && o.value > 0)) continue;
    const payload = outs.find((o) => o.scriptpubkey_type === "nulldata")?.scriptpubkey;
    const omni = parseOmniSendPayload(payload);
    if (omni) {
      const symbol = omniSymbolForProperty(omni.propertyId);
      if (symbol) return symbol;
      continue; // an Omni payment in a property we don't list: don't call it native
    }
    paidNative = true;
  }
  return paidNative ? getChain("txc").nativeSymbol : null;
}
