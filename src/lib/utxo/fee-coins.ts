/**
 * Small "fee coins" for TSD payments (Bobby, Nov 24 2026; idea from File Fingerprint /
 * Passage). Pure, tested.
 *
 * A TSD payment needs a little TXC for the network fee. When a member's pocket has no
 * small coin left, the payment has to spend a big one and the rest waits for a block
 * (Mati's bug). So when Seeds pays TSD from a big coin, the change that comes back to
 * the member's own pocket is handed back as up to FEE_COIN_COUNT small coins plus the
 * rest. The next TSD payments use those small coins (pickCarrierCoins) and the member's
 * main TXC stays untouched. What leaves the pocket, and to whom, never changes.
 */
import { parseUnsignedTx, serializeTx } from "@/lib/lock/script";
import { bytesToHex } from "@noble/hashes/utils.js";

/** How many small coins Seeds keeps ready in a pocket. */
export const FEE_COIN_COUNT = 5;
/** Size of each new fee coin: 0.01 TXC (a TSD payment's fee is about 0.00003 TXC). */
export const FEE_COIN_SATS = 1_000_000;
/** A coin this size or smaller counts as a fee coin already in the pocket (0.05 TXC). */
export const FEE_COIN_MAX_SATS = 5_000_000;
/** Below this many spare fee coins, the next payment from a big coin makes more. */
export const FEE_COIN_REFILL_BELOW = 2;
/** Extra bytes per added output (P2PKH), paid at the same fee rate. */
export const FEE_COIN_OUTPUT_VBYTES = 34;

const sats = (coins: number) => Math.round(coins * 1e8);

/** Fee coins the pocket still has, not counting the ones this payment spends. */
export function spareFeeCoins(coins: Array<{ txid: string; vout: number; amount: number }>, spending: Array<{ txid: string; vout: number }>, minUsableSats: number): number {
  const used = new Set(spending.map((c) => `${c.txid}:${c.vout}`));
  return coins.filter((c) => !used.has(`${c.txid}:${c.vout}`) && sats(c.amount) >= minUsableSats && sats(c.amount) <= FEE_COIN_MAX_SATS).length;
}

/**
 * How many fee coins to add to this payment's change, and the extra fee they cost.
 * None when the pocket still has enough, or when the change is too small to leave at
 * least one fee coin's worth behind as ordinary change.
 */
export function feeCoinPlan(i: { spare: number; changeSats: number; feeRate: number }): { pieces: number; extraFeeSats: number } {
  if (i.spare >= FEE_COIN_REFILL_BELOW) return { pieces: 0, extraFeeSats: 0 };
  const rate = Math.max(1, Math.round(i.feeRate));
  for (let n = FEE_COIN_COUNT - i.spare; n > 0; n--) {
    const extra = n * FEE_COIN_OUTPUT_VBYTES * rate;
    if (i.changeSats - n * FEE_COIN_SATS - extra >= FEE_COIN_SATS) return { pieces: n, extraFeeSats: extra };
  }
  return { pieces: 0, extraFeeSats: 0 };
}

/**
 * Add `pieces` fee coins to an unsigned, node-built TSD payment. The pocket's single
 * change output pays for them (and for `extraFeeSats`); they go right before it, so the
 * payment's own outputs — the TSD message and the recipient, last — keep their order.
 * Throws when the transaction doesn't have exactly one output back to the pocket.
 */
export function addFeeCoins(rawHex: string, ownScriptHex: string, pieces: number, extraFeeSats: number): string {
  if (!Number.isInteger(pieces) || pieces < 1) return rawHex;
  const tx = parseUnsignedTx(rawHex);
  const own = ownScriptHex.toLowerCase();
  const idx = tx.outputs.map((o, k) => (bytesToHex(o.script) === own ? k : -1)).filter((k) => k >= 0);
  if (idx.length !== 1) throw new Error("Expected exactly one change output back to the pocket");
  const at = idx[0]!;
  if (at === tx.outputs.length - 1) throw new Error("The pocket's change must not be the last output");
  const change = tx.outputs[at]!;
  const take = BigInt(pieces * FEE_COIN_SATS + extraFeeSats);
  if (change.value - take < BigInt(FEE_COIN_SATS)) throw new Error("Change too small for fee coins");
  const script = change.script;
  const added = Array.from({ length: pieces }, () => ({ value: BigInt(FEE_COIN_SATS), script: script.slice() }));
  const outputs = [...tx.outputs.slice(0, at), ...added, { value: change.value - take, script }, ...tx.outputs.slice(at + 1)];
  return bytesToHex(serializeTx({ ...tx, outputs }));
}

/** Our node's omni_decodetransaction answer (only the fields Seeds checks). */
export type OmniDecodedSend = { sendingaddress?: unknown; referenceaddress?: unknown; propertyid?: unknown; amount?: unknown; type_int?: unknown };

/**
 * Bobby's check: before a TSD payment is sent, our node reads it back and it must still be
 * a plain TSD send from this pocket, to this recipient, of exactly this token and amount.
 * Returns the reason it doesn't match, or null.
 */
export function omniSendMismatch(d: OmniDecodedSend | null, want: { from: string; to: string; propertyId: number; amount: number }): string | null {
  if (!d) return "the node couldn't read the payment back";
  if (d.type_int !== 0) return "it isn't a plain token send";
  if (d.sendingaddress !== want.from) return "it would come from a different address";
  if (d.referenceaddress !== want.to) return "it would go to a different address";
  if (d.propertyid !== want.propertyId) return "it would send a different token";
  if (typeof d.amount !== "string" || sats(Number(d.amount)) !== sats(want.amount)) return "it would send a different amount";
  return null;
}
