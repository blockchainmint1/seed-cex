/**
 * Seeds gas wallet: pays the Ethereum network fee a TSD route needs, so members don't
 * have to keep ETH. It only ever sends plain ETH to the member's own EVM pocket, for the
 * shortfall of one step, under per-route and daily caps reserved in the database
 * (reserve_gas_topup) before KMS signs anything. Not configured -> the member's pocket
 * must hold the ETH itself.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gasNeedWei, gasTopUpWei, GAS_LIMITS } from "./tsd-route";

const ETH = "ethereum" as const;

export type GasResult =
  | { kind: "ok" }
  | { kind: "pending"; txid: string }
  | { kind: "short"; reason: string };

export async function ethPriceUsd(): Promise<number | null> {
  const { swapStatus } = await import("./router.server");
  const s = await swapStatus();
  return s.coins.find((c) => c.id === "ETH")?.priceUsd ?? null;
}

export async function gasWalletConfigured(): Promise<boolean> {
  const { kmsGasConfigured } = await import("@/lib/lock/kms.server");
  return kmsGasConfigured();
}

/** The gas wallet's public 0x address (for funding it), or null when not set up. */
export async function gasWalletAddress(): Promise<string | null> {
  const { kmsGasConfigured, kmsGasSigner } = await import("@/lib/lock/kms.server");
  if (!kmsGasConfigured()) return null;
  const { addressFromPublicKey } = await import("@/lib/evm/tx.server");
  return addressFromPublicKey((await kmsGasSigner()).publicKey);
}

/** Make sure `pocket` can pay `gasUnits` at today's max fee; top it up from the gas wallet if not. */
export async function ensureGas(p: { routeId: string; userId: string; pocket: string; gasUnits: bigint }): Promise<GasResult> {
  const { evmRpc, suggestFees, fetchNonce, sendRawTransaction } = await import("@/lib/evm.server");
  const [fees, balHex] = await Promise.all([suggestFees(ETH), evmRpc<string>(ETH, "eth_getBalance", [p.pocket, "latest"])]);
  if (!fees || !balHex) throw new Error("Ethereum node unreachable");
  // 25% headroom: fees can rise between this check and the pocket's own send.
  const need = gasNeedWei(p.gasUnits, fees.maxFeePerGas);
  const top = gasTopUpWei(need, BigInt(balHex));
  if (top === 0n) return { kind: "ok" };

  const px = await ethPriceUsd();
  const usd = px ? (Number(top) / 1e18) * px : null;
  const shortMsg = `Your pocket needs about ${(Number(top) / 1e18).toFixed(5)} ETH${usd ? ` (~$${usd.toFixed(2)})` : ""} more for the Ethereum network fee.`;
  if (!(await gasWalletConfigured())) return { kind: "short", reason: `${shortMsg} Add it to your EVM pocket and the swap continues on its own.` };
  if (usd == null) return { kind: "short", reason: `${shortMsg} (No live ETH price, so Seeds can't check its fee budget.)` };

  const { data: id, error } = await supabaseAdmin.rpc("reserve_gas_topup", {
    _route_id: p.routeId, _user_id: p.userId, _to_address: p.pocket, _wei: Number(top), _usd: Math.round(usd * 100) / 100,
    _per_route_max_usd: GAS_LIMITS.perRouteUsd, _daily_max_usd: GAS_LIMITS.dailyUsd,
  });
  if (error || !id) return { kind: "short", reason: `${shortMsg} ${(error?.message ?? "").replace(/^.*?ERROR:\s*/i, "")}`.trim() };

  const rowId = id as string;
  const mark = (patch: Record<string, unknown>) =>
    supabaseAdmin.from("gas_topups").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", rowId);
  let recorded = false;
  try {
    const { kmsGasSigner } = await import("@/lib/lock/kms.server");
    const { addressFromPublicKey, signEip1559External } = await import("@/lib/evm/tx.server");
    const kms = await kmsGasSigner();
    const from = addressFromPublicKey(kms.publicKey);
    const [nonce, walletHex] = await Promise.all([fetchNonce(ETH, from), evmRpc<string>(ETH, "eth_getBalance", [from, "latest"])]);
    if (nonce == null || !walletHex) throw new Error("Ethereum node unreachable");
    if (BigInt(walletHex) < top + 21_000n * fees.maxFeePerGas) throw new Error("Seeds' gas wallet is empty. The team has been told.");
    const tx = await signEip1559External(
      { chainId: 1, nonce, ...fees, gasLimit: 21_000n, to: p.pocket, value: top, data: "0x" },
      { address: from, sign: (d) => kms.sign(d) },
    );
    const { error: e } = await mark({ txid: tx.hash });
    if (e) throw new Error(`Could not record the top-up: ${e.message}`);
    recorded = true;
    await sendRawTransaction(ETH, tx.raw);
    await mark({ status: "sent" });
    return { kind: "pending", txid: tx.hash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A recorded txid may still be on the network after a timeout: leave it 'signing' (cap stays reserved) for a person.
    const maybeSent = recorded && /timeout|unreachable|fetch|abort|network|socket|reset|50\d/i.test(msg);
    await mark(maybeSent ? { error: msg.slice(0, 300) } : { status: "failed", error: msg.slice(0, 300) });
    if (maybeSent) return { kind: "short", reason: "Seeds sent a network-fee top-up but the network didn't confirm receiving it. The team will check." };
    return { kind: "short", reason: `${shortMsg} (${msg})` };
  }
}

/** Has a top-up we sent been mined? Marks the row so the cap ledger stays accurate. */
export async function gasTopUpConfirmed(txid: string): Promise<"yes" | "no" | "failed"> {
  const { fetchEvmTxStatus } = await import("@/lib/evm.server");
  const s = await fetchEvmTxStatus(ETH, txid);
  if (s.success === false) {
    await supabaseAdmin.from("gas_topups").update({ status: "failed", error: "reverted", updated_at: new Date().toISOString() }).eq("txid", txid);
    return "failed";
  }
  if ((s.confirmations ?? 0) >= 1 && s.success) {
    await supabaseAdmin.from("gas_topups").update({ status: "confirmed", updated_at: new Date().toISOString() }).eq("txid", txid);
    return "yes";
  }
  return "no";
}
