/**
 * USDT on TON + STON.fi TON->USDT (pure, tested). Every contract address is pinned here and every
 * message body is built by Seeds; nothing from a quote service is ever signed as-is.
 */
import { Address, beginCell, type Cell } from "@ton/core";

/** Tether's official USD₮ jetton master on TON (6 decimals). */
export const USDT_TON_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";
export const USDT_TON_DECIMALS = 6;
/** STON.fi DEX v1 router, its proxy-TON wallet and its USD₮ wallet (checked on both TON servers). */
export const STON_ROUTER = "EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt";
export const STON_PTON_WALLET = "EQARULUYsmJq1RiZ-YiH-IJLcAZUVkVff-KBPwEmmaQGH6aC";
export const STON_ROUTER_USDT_WALLET = "EQBO7JIbnU1WoNlGdgFtScJrObHXkBp-FT5mAz8UagiG9KQR";
export const TON_NATIVE_ID = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c";

/** TON attached to a USD₮ transfer for the jetton wallets' gas; the unused part returns to the pocket. */
export const USDT_SEND_GAS = 50_000_000n; // 0.05 TON
/** STON.fi's own TON->jetton forward gas (SDK gasConstants.swapTonToJetton). */
export const STON_FORWARD_GAS = 185_000_000n; // 0.185 TON
/** TON that always stays behind for the wallet's own fee and storage after a swap or USD₮ send. */
export const TON_JETTON_KEEP = 30_000_000n; // 0.03 TON
export const SWAP_MAX_WORSE = 0.01;

const OP_JETTON_TRANSFER = 0x0f8a7ea5;
const OP_STON_SWAP = 0x25938561;

export const sameTonAddress = (a: string, b: string): boolean => {
  try { return Address.parse(a).equals(Address.parse(b)); } catch { return false; }
};

/** TEP-74 transfer: `units` USD₮ to `destination`'s wallet, excess TON back to `response`. */
export function usdtTransferBody(i: { queryId: bigint; units: bigint; destination: string; response: string }): Cell {
  if (i.units <= 0n || i.units >= 1n << 120n) throw new Error("Invalid USD₮ amount");
  return beginCell().storeUint(OP_JETTON_TRANSFER, 32).storeUint(i.queryId, 64).storeCoins(i.units)
    .storeAddress(Address.parse(i.destination)).storeAddress(Address.parse(i.response))
    .storeBit(false).storeCoins(1n).storeBit(false).endCell();
}

/** STON.fi v1 TON->USD₮: pTON transfer of `offer` to the router with a swap payload paying `member`. */
export function stonSwapMessage(i: { queryId: bigint; offer: bigint; minOut: bigint; member: string }) {
  if (i.offer <= 0n || i.minOut <= 0n) throw new Error("Invalid swap amounts");
  const swap = beginCell().storeUint(OP_STON_SWAP, 32).storeAddress(Address.parse(STON_ROUTER_USDT_WALLET))
    .storeCoins(i.minOut).storeAddress(Address.parse(i.member)).storeUint(0, 1).endCell();
  const body = beginCell().storeUint(OP_JETTON_TRANSFER, 32).storeUint(i.queryId, 64).storeCoins(i.offer)
    .storeAddress(Address.parse(STON_ROUTER)).storeAddress(null).storeBit(false)
    .storeCoins(STON_FORWARD_GAS).storeBit(true).storeRef(swap).endCell();
  return { to: STON_PTON_WALLET, value: i.offer + STON_FORWARD_GAS, body };
}

export type StonSimulation = {
  offer_address: string; ask_address: string; router_address: string; offer_jetton_wallet: string; ask_jetton_wallet: string;
  offer_units: string; ask_units: string; min_ask_units: string; router?: { pton_wallet_address?: string; major_version?: number };
};

/** A STON.fi quote is used only for its price, and only when every contract it names is the pinned one. */
export function checkStonQuote(q: StonSimulation, offer: bigint): { askUnits: bigint } {
  const ok = sameTonAddress(q.offer_address, TON_NATIVE_ID) && sameTonAddress(q.ask_address, USDT_TON_MASTER)
    && sameTonAddress(q.router_address, STON_ROUTER) && sameTonAddress(q.offer_jetton_wallet, STON_PTON_WALLET)
    && sameTonAddress(q.ask_jetton_wallet, STON_ROUTER_USDT_WALLET)
    && (q.router?.pton_wallet_address === undefined || sameTonAddress(q.router.pton_wallet_address, STON_PTON_WALLET))
    && (q.router?.major_version === undefined || q.router.major_version === 1);
  if (!ok) throw new Error("STON.fi quoted a different pool or router. Nothing was sent.");
  if (!/^\d+$/.test(q.offer_units) || BigInt(q.offer_units) !== offer || !/^\d+$/.test(q.ask_units)) throw new Error("STON.fi quote doesn't match the amount. Nothing was sent.");
  const askUnits = BigInt(q.ask_units);
  if (askUnits <= 0n) throw new Error("STON.fi has no price for this amount right now.");
  return { askUnits };
}

/** Lowest USD₮ the member accepts: the shown quote less 1%, and never more than a fresh quote can pay. */
export function swapMinimum(shownAsk: bigint): bigint {
  return shownAsk - (shownAsk * 100n) / 10_000n;
}

export const tonUnits = (s: string): bigint => {
  if (!/^\d+(\.\d{1,9})?$/.test(s.trim())) throw new Error("Enter a TON amount (up to 9 decimals).");
  const [w, f = ""] = s.trim().split(".");
  return BigInt(w!) * 1_000_000_000n + BigInt((f + "000000000").slice(0, 9));
};

/** Delivery evidence for a USD₮ send from a TONAPI trace: the destination's jetton wallet took exactly `units`. */
export type JettonTrace = {
  emulated?: boolean;
  transaction: { aborted: boolean; success: boolean; account: { address: string };
    in_msg?: { hash?: string; decoded_op_name?: string; decoded_body?: { amount?: string } } };
  children?: JettonTrace[];
};
export function usdtTraceStatus(trace: JettonTrace, messageId: string, senderJettonWallet: string, destJettonWallet: string, units: bigint) {
  if (trace.emulated || trace.transaction.in_msg?.hash !== messageId) return null;
  if (trace.transaction.aborted || !trace.transaction.success) return { success: false, confirmations: 1 };
  const own = trace.children?.find((c) => sameTonAddress(c.transaction.account.address, senderJettonWallet));
  if (!own || own.emulated) return null;
  if (own.transaction.aborted || !own.transaction.success) return { success: false, confirmations: 1 };
  const dest = own.children?.find((c) => sameTonAddress(c.transaction.account.address, destJettonWallet));
  if (!dest || dest.emulated) return null;
  const m = dest.transaction.in_msg;
  if (m?.decoded_op_name !== "jetton_internal_transfer" || !/^\d+$/.test(m.decoded_body?.amount ?? "")) return null;
  if (BigInt(m.decoded_body!.amount!) !== units) return null;
  return { success: !dest.transaction.aborted && dest.transaction.success, confirmations: 1 };
}

/** TON a USD₮ send needs before any code, 2FA or tap (audit TA4): jetton gas + the TON fee cap + what stays behind. */
export const USDT_SEND_TON_NEED = USDT_SEND_GAS + 50_000_000n + TON_JETTON_KEEP; // 0.13 TON (fee cap = ED_FEE_CAP.TON)
/** TON left for the fee check after the allowance; 0 means "not enough TON for the network fee". */
export function usdtFeeAllowance(tonBalance: bigint): bigint {
  return tonBalance >= USDT_SEND_TON_NEED ? tonBalance - USDT_SEND_TON_NEED + 1n : 0n;
}
