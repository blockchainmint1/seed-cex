/** USD₮ on TON reads/sends and STON.fi TON->USD₮ swaps from the member's own TON pocket. */
import { Address, beginCell, Cell } from "@ton/core";
import { tonEndpoint } from "@/lib/nodes.server";
import type { KeyedLink } from "@/lib/xchain/send.server";
import { signAndSendTon, tonCall, tonJson, NetworkHttpError, tonMessageExpired } from "./ed-send.server";
import { tonDestination } from "./ton-tx";
import type { EdSendMeta } from "./ed-send-rules";
import { USDT_TON_MASTER, USDT_SEND_GAS, TON_JETTON_KEEP, usdtTransferBody, usdtTraceStatus, usdtFeeAllowance, sameTonAddress, stonSwapMessage, checkStonQuote, type StonSimulation, type JettonTrace, TON_NATIVE_ID } from "./ton-jetton";

type Link = KeyedLink & { xpubs?: Record<string, string> };
type Recorder = (txid: string, meta?: EdSendMeta) => Promise<void>;

/** The owner's USD₮ wallet; toncenter and TONAPI must both derive the same one from Tether's master. */
export async function usdtWalletOf(owner: string): Promise<string> {
  const ownerAddr = Address.parse(owner);
  const slice = beginCell().storeAddress(ownerAddr).endCell().toBoc().toString("base64");
  const a = await tonCall<{ exit_code: number; stack: [string, { bytes: string }][] }>("runGetMethod", { address: USDT_TON_MASTER, method: "get_wallet_address", stack: [["tvm.Slice", slice]] });
  const cell = a.exit_code === 0 && a.stack[0]?.[0] === "cell" ? Cell.fromBoc(Buffer.from(a.stack[0][1].bytes, "base64"))[0] : undefined;
  const first = cell?.beginParse().loadAddress();
  const api = tonEndpoint(true);
  const b = await tonJson<{ success: boolean; decoded?: { jetton_wallet_address?: string } }>(`${api.url}/blockchain/accounts/${USDT_TON_MASTER}/methods/get_wallet_address?args=${encodeURIComponent(ownerAddr.toRawString())}`, { headers: api.headers });
  if (!first || !b.success || !b.decoded?.jetton_wallet_address || !sameTonAddress(first.toString(), b.decoded.jetton_wallet_address)) throw new Error("TON servers disagree about the USD₮ wallet. Nothing was sent.");
  return first.toString({ bounceable: true });
}

/** USD₮ base units (6 decimals) held by the owner. An undeployed USD₮ wallet holds 0. Null = unreadable. */
export async function usdtTonBalance(owner: string): Promise<bigint | null> {
  try {
    const api = tonEndpoint(true);
    const r = await fetch(`${api.url}/accounts/${encodeURIComponent(owner)}/jettons/${USDT_TON_MASTER}`, { headers: api.headers, redirect: "manual", signal: AbortSignal.timeout(12_000) });
    if (r.status === 404) return 0n;
    if (!r.ok) return null;
    const j = await r.json() as { balance?: string; jetton?: { address?: string } };
    if (!j.jetton?.address || !sameTonAddress(j.jetton.address, USDT_TON_MASTER) || !/^\d+$/.test(j.balance ?? "")) return null;
    return BigInt(j.balance!);
  } catch { return null; }
}

/** Spend reads: the USD₮ wallet's own get_wallet_data on toncenter must name this owner and Tether's master. */
async function usdtSpendable(owner: string): Promise<{ wallet: string; units: bigint }> {
  const wallet = await usdtWalletOf(owner);
  const info = await tonCall<{ state: string }>("getAddressInformation", { address: wallet });
  if (info.state === "uninitialized") return { wallet, units: 0n };
  const r = await tonCall<{ exit_code: number; stack: [string, unknown][] }>("runGetMethod", { address: wallet, method: "get_wallet_data", stack: [] });
  const [bal, own, master] = r.stack;
  const cellAddr = (x: unknown) => Cell.fromBoc(Buffer.from((x as { bytes: string }).bytes, "base64"))[0]!.beginParse().loadAddress();
  if (r.exit_code !== 0 || bal?.[0] !== "num" || own?.[0] !== "cell" || master?.[0] !== "cell") throw new Error("USD₮ balance couldn't be read. Nothing was sent.");
  if (!cellAddr(own[1]).equals(Address.parse(owner)) || !cellAddr(master[1]).equals(Address.parse(USDT_TON_MASTER))) throw new Error("USD₮ wallet doesn't belong to this pocket. Nothing was sent.");
  const units = BigInt(bal[1] as string);
  const second = await usdtTonBalance(owner);
  if (second === null || second !== units) throw new Error("TON servers disagree about the USD₮ balance. Nothing was sent.");
  return { wallet, units };
}

export async function readUsdtTonSpendable(owner: string): Promise<{ units: bigint; feeUnits: bigint }> {
  const [{ units }, info] = await Promise.all([usdtSpendable(owner), tonCall<{ balance: string }>("getAddressInformation", { address: owner })]);
  // Audit TA4: report TON net of what the send itself needs, so a pocket short on TON is refused up front.
  return { units, feeUnits: usdtFeeAllowance(BigInt(info.balance)) };
}

/** USD₮ withdrawal: amount must be held; TON pays the 0.05 jetton gas + fee and keeps a little behind. */
export async function sendUsdtTon(link: Link, from: string, to: string, units: bigint, record: Recorder, comment = ""): Promise<string> {
  tonDestination(to);
  if (sameTonAddress(to, from)) throw new Error("That's your own pocket. Nothing was sent.");
  const { wallet, units: held } = await usdtSpendable(from);
  if (held < units) throw new Error("Not enough USD₮ in your TON pocket. Nothing was sent.");
  const body = usdtTransferBody({ queryId: BigInt(Date.now()), units, destination: to, response: from, comment });
  return signAndSendTon(link, from, { to: wallet, units: USDT_SEND_GAS, body }, record, (balance, fee) => {
    if (balance < USDT_SEND_GAS + fee + TON_JETTON_KEEP) throw new Error("Your TON pocket needs about 0.1 TON for the USD₮ network fee. Nothing was sent.");
  });
}

export async function usdtTonTxStatus(txid: string, from: string, to: string, units: bigint, evidence: unknown) {
  const api = tonEndpoint(true);
  try {
    const [own, dest] = await Promise.all([usdtWalletOf(from), usdtWalletOf(to)]);
    const trace = await tonJson<JettonTrace>(`${api.url}/traces/${encodeURIComponent(txid)}`, { headers: api.headers });
    return usdtTraceStatus(trace, txid, own, dest, units);
  } catch (e) {
    if (!(e instanceof NetworkHttpError) || e.status !== 404) throw e;
    return await tonMessageExpired(from, evidence) ? { success: false, confirmations: 0, expired: true } : null;
  }
}

/** Fresh STON.fi price for exactly `offer` nanotons, used only after checkStonQuote passes. */
export async function stonQuote(offer: bigint): Promise<bigint> {
  const u = new URL("https://api.ston.fi/v1/swap/simulate");
  u.search = new URLSearchParams({ offer_address: TON_NATIVE_ID, ask_address: USDT_TON_MASTER, units: offer.toString(), slippage_tolerance: "0.01" }).toString();
  const r = await fetch(u, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error("STON.fi isn't answering right now. Nothing was sent.");
  return checkStonQuote(await r.json() as StonSimulation, offer).askUnits;
}

/** Sign the STON.fi swap. The pool pays USD₮ to this same pocket or refunds the TON to it. */
export async function sendStonSwap(link: Link, from: string, offer: bigint, minOut: bigint, record: Recorder): Promise<string> {
  const m = stonSwapMessage({ queryId: BigInt(Date.now()), offer, minOut, member: from });
  return signAndSendTon(link, from, { to: m.to, units: m.value, body: m.body }, record, (balance, fee) => {
    if (balance < m.value + fee + TON_JETTON_KEEP) throw new Error("Not enough TON for this swap plus about 0.22 TON of network fees. Nothing was sent.");
  });
}
