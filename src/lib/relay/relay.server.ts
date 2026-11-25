/**
 * Relay swaps (ETH on Ethereum <-> HYPE on HyperEVM) from and back to the member's own EVM pocket.
 *
 * Order is fixed and every step fails closed:
 *  1. request: server quotes Relay itself (never trusts the browser), the quote must pass
 *     checkRelayQuote and be at most 1% worse than shown, coins + network fee must be in the
 *     pocket and not set aside for trades, then reserve_relay_swap (caps, one open swap) and a
 *     Telegram Approve request.
 *  2. Approve tap: spent once for exactly this swap.
 *  3. Send: a fresh Relay quote must pass checkRelayQuote again and pay at least the agreed
 *     minimum; an eth_call test run must pass; the hash is stored before broadcast and never
 *     signed again.
 *  4. Delivery: Relay's status is read until success/refund; the payout hash is checked on
 *     the destination network. Nothing else is ever sent for the swap.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  agreedMinWei, checkRelayQuote, CHAIN_IDS, fromWei, isRelayTerminal, legs, NETWORK_NAME, quoteBody, relayProgress, RELAY_API,
  RELAY_DEPOSIT_GAS, RELAY_MIN_USD, RELAY_STUCK_MINUTES, requoteOk, SYMBOL, toWei, fromUnits, toUnits, tonArrived, tonPayoutSeen, type TonAccountEvent, paysOtherPocket, isTonAddress, type CheckedDeposit, type RelayChain, type RelayDirection, type RelayStatus,
} from "./rules";

type Row = Database["public"]["Tables"]["relay_swaps"]["Row"];
const hex = (n: bigint) => `0x${n.toString(16)}`;
const clean = (m: string) => m.replace(/^.*?ERROR:\s*/i, "").trim();
const minutesSince = (iso: string) => (Date.now() - Date.parse(iso)) / 60_000;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 6 : 8 });
const sameAddr = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

/* ---------------------------------- Relay API ---------------------------------- */

async function relayFetch(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${RELAY_API}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (j as { message?: string } | null)?.message;
    throw new Error(msg ? `Relay: ${String(msg).slice(0, 160)}` : `Relay didn't answer (${res.status}).`);
  }
  return j;
}

export type RelayQuote = CheckedDeposit & { inUsd: number | null; outUsd: number | null; feeUsd: number | null };

/** A Relay quote for own pocket -> own pocket, already checked by checkRelayQuote. */
export async function relayQuote(direction: RelayDirection, pocket: string, amountWei: bigint, slippageBps: number, recipient?: string): Promise<RelayQuote> {
  const q = await relayFetch("/quote", quoteBody(direction, pocket, amountWei, slippageBps, recipient));
  const c = checkRelayQuote(q, recipient ? { direction, pocket, amountWei, recipient } : { direction, pocket, amountWei });
  const d = (q as { details?: { currencyIn?: { amountUsd?: string }; currencyOut?: { amountUsd?: string } } }).details;
  const inUsd = Number(d?.currencyIn?.amountUsd), outUsd = Number(d?.currencyOut?.amountUsd);
  return { ...c, inUsd: Number.isFinite(inUsd) ? inUsd : null, outUsd: Number.isFinite(outUsd) ? outUsd : null, feeUsd: Number.isFinite(inUsd) && Number.isFinite(outUsd) ? Math.max(0, inUsd - outUsd) : null };
}

/** Public price check: Relay quote for any well-formed address (nothing signed). */
/** Any well-formed TON address for public price checks (nothing is ever sent to it). */
export const SAMPLE_TON = "UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI";

export async function previewRelayQuote(direction: RelayDirection, amount: string, pocket: string | null, tonPocket: string | null = null) {
  const wei = toWei(amount);
  if (!wei) throw new Error("Enter an amount above zero.");
  const who = pocket ?? "0x000000000000000000000000000000000000dEaD";
  const q = await relayQuote(direction, who, wei, 100, paysOtherPocket(direction) ? (tonPocket ?? SAMPLE_TON) : undefined);
  return { out: fromUnits(legs(direction).to, q.outWei), outWei: q.outWei.toString(), seconds: q.seconds, inUsd: q.inUsd, outUsd: q.outUsd, feeUsd: q.feeUsd };
}

/* ---------------------------------- chain reads --------------------------------- */

type EvmChain = Exclude<RelayChain, "ton">;
async function rpc<T>(c: EvmChain, method: string, params: unknown[]) {
  const { evmRpc } = await import("@/lib/evm.server");
  return evmRpc<T>(c, method, params);
}
export async function nativeBalance(c: EvmChain, a: string): Promise<bigint | null> {
  const h = await rpc<string>(c, "eth_getBalance", [a, "latest"]);
  return h ? BigInt(h) : null;
}
export async function fees(c: EvmChain) {
  const { suggestFees } = await import("@/lib/evm.server");
  const s = await suggestFees(c);
  if (!s) return null;
  const gp = await rpc<string>(c, "eth_gasPrice", []);
  const max = gp && BigInt(gp) > s.maxFeePerGas ? BigInt(gp) : s.maxFeePerGas;
  return { maxFeePerGas: max, maxPriorityFeePerGas: s.maxPriorityFeePerGas > max ? max : s.maxPriorityFeePerGas };
}
export const feeNeed = (maxFee: bigint) => (RELAY_DEPOSIT_GAS * maxFee * 15n) / 10n;

async function sameLink(userId: string, evm: string, tonRecipient: string | null = null) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  if (!link || !link.hasKey || link.mode !== "access" || !sameAddr(link.addresses.EVM, evm)) return null;
  // A TON payout must still go to this link's own TON pocket (exact, case-sensitive).
  if (tonRecipient != null && link.addresses.TON !== tonRecipient) return null;
  return link;
}

/** First reason this member can't Relay-swap now, or null. */
export function relayBlocker(i: { tester: boolean; link: { mode: string; hasKey: boolean; pockets: string[] } | null; telegramVerified: boolean; needsTon?: boolean }): string | null {
  if (!i.tester) return "Relay swaps are open to beta testers first. They open to members after that.";
  if (!i.link) return "Link your HME Wallet trading pocket first (Account → Security).";
  if (i.link.mode !== "access" || !i.link.hasKey) return "Your pocket is linked in approve-every-trade mode. Swaps need instant access for now.";
  if (!i.link.pockets.includes("EVM")) return "Your linked pocket doesn't include an Ethereum-type pocket.";
  if (i.needsTon && !i.link.pockets.includes("TON")) return "Your linked pocket has no TON pocket yet. Re-link your wallet (Account → Security) to add it.";
  if (!i.telegramVerified) return "Connect Telegram (Account → Alerts). Every swap from your pocket waits for your Approve tap in Telegram.";
  return null;
}

export async function relaySwapContext(userId: string, tester: boolean, direction: RelayDirection) {
  const { loadLink } = await import("@/lib/xchain/send.server");
  const [link, prof] = await Promise.all([loadLink(userId), supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle()]);
  const blocker = relayBlocker({ tester, telegramVerified: prof.data?.telegram_verified === true, needsTon: paysOtherPocket(direction), link: link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null });
  const evm = link?.addresses.EVM ?? null;
  const bal = evm ? await nativeBalance(legs(direction).from as EvmChain, evm).catch(() => null) : null;
  return { blocker, pocket: evm, balanceIn: bal == null ? null : fromWei(bal), symbolIn: SYMBOL[legs(direction).from] };
}

/* ---------------------------------- request ---------------------------------- */

export type RelaySwapRequest = { direction: RelayDirection; amount: string; shownOut: number; slippageBps: number };

export async function requestRelaySwap(userId: string, tester: boolean, input: RelaySwapRequest) {
  const { withPocketSpendLock } = await import("@/lib/set-asides.server");
  return withPocketSpendLock(userId, () => requestUnlocked(userId, tester, input));
}

async function requestUnlocked(userId: string, tester: boolean, input: RelaySwapRequest) {
  const { from, to } = legs(input.direction);
  const { loadLink } = await import("@/lib/xchain/send.server");
  const link = await loadLink(userId);
  const { data: prof } = await supabaseAdmin.from("profiles").select("telegram_verified").eq("id", userId).maybeSingle();
  const blocker = relayBlocker({ tester, telegramVerified: prof?.telegram_verified === true, needsTon: paysOtherPocket(input.direction), link: link ? { mode: link.mode, hasKey: link.hasKey, pockets: link.pockets as string[] } : null });
  if (blocker) throw new Error(blocker);
  const evm = link!.addresses.EVM!.toLowerCase();
  const recipient = paysOtherPocket(input.direction) ? (link!.addresses.TON ?? null) : null;
  if (paysOtherPocket(input.direction) && !isTonAddress(recipient)) throw new Error("Your TON pocket address couldn't be read. Re-link your wallet to add it.");

  const amountWei = toWei(input.amount);
  if (!amountWei) throw new Error("Enter an amount above zero (at most 8 decimal places count).");
  const shownWei = toUnits(to, input.shownOut.toFixed(8));
  if (!shownWei) throw new Error("Get a fresh price first.");
  const q = await relayQuote(input.direction, evm, amountWei, input.slippageBps, recipient ?? undefined);
  if (!requoteOk(shownWei, q.outWei)) throw new Error(`The price moved more than 1% since you looked (now about ${fmt(fromUnits(to, q.outWei))} ${SYMBOL[to]}). Check the new quote and try again.`);
  if (q.inUsd == null && !tester) throw new Error("No live price for this swap, so the limit can't be checked.");
  if (q.inUsd != null && q.inUsd < RELAY_MIN_USD) throw new Error(`Relay swaps start at about $${RELAY_MIN_USD} so the fees don't eat them.`);

  const bal = await nativeBalance(from as EvmChain, evm);
  if (bal == null) throw new Error(`Couldn't read your pocket on ${NETWORK_NAME[from]}. Try again in a minute.`);
  const f = await fees(from as EvmChain);
  if (!f) throw new Error(`${NETWORK_NAME[from]} didn't answer. Try again in a minute.`);
  if (bal < amountWei + feeNeed(f.maxFeePerGas)) {
    throw new Error(`Not enough ${SYMBOL[from]}: the swap plus the ${NETWORK_NAME[from]} network fee needs about ${fmt(fromWei(amountWei + feeNeed(f.maxFeePerGas) - bal))} ${SYMBOL[from]} more. Nothing was sent.`);
  }
  const { legForEvmToken } = await import("@/lib/set-asides");
  const held = legForEvmToken(from as EvmChain, null);
  if (held) {
    const { pocketSpendProblem } = await import("@/lib/set-asides.server");
    const why = await pocketSpendProblem(userId, held, fromWei(amountWei), { address: evm, network: from });
    if (why) throw new Error(why);
  }

  const { swapLimitsFor } = await import("@/lib/xchain/send-rules");
  const limits = swapLimitsFor(tester);
  const minWei = agreedMinWei(shownWei, input.slippageBps);
  const row = {
    user_id: userId, link_id: link!.id, direction: input.direction, pocket: evm, amount_in: fromWei(amountWei), amount_in_wei: amountWei.toString(),
    shown_out: input.shownOut, min_out_wei: minWei.toString(), slippage_bps: input.slippageBps, amount_usd: Math.round((q.inUsd ?? 0) * 100) / 100,
    recipient,
  };
  const { data: id, error } = await supabaseAdmin.rpc("reserve_relay_swap", { _row: row as never, _per_swap_max_usd: limits.perSwapUsd, _daily_max_usd: limits.dailyUsd });
  if (error || !id) throw new Error(clean(error?.message ?? "Could not start this swap."));
  const swapId = id as string;
  try {
    const { requestSendApproval } = await import("@/lib/pocket-send/approvals.server");
    const ap = await requestSendApproval({
      userId, linkId: link!.id, purpose: "relay_swap", refId: swapId, leg: `relay:${from}`, asset: SYMBOL[from], amount: fromWei(amountWei),
      from: evm, to: recipient ?? evm,
      what: `Swap to about ${fmt(input.shownOut)} ${SYMBOL[to]} (at least ${fmt(fromUnits(to, minWei))}) through Relay, ${NETWORK_NAME[from]} → ${NETWORK_NAME[to]}. Paid back to your own pocket.`,
      meta: { direction: input.direction },
    });
    await supabaseAdmin.from("relay_swaps").update({ approval_id: ap.id, updated_at: new Date().toISOString() }).eq("id", swapId);
    return { id: swapId, approvalExpiresAt: ap.expires_at };
  } catch (e) {
    await supabaseAdmin.from("relay_swaps").update({ status: "cancelled", error: (e instanceof Error ? e.message : String(e)).slice(0, 300), updated_at: new Date().toISOString() }).eq("id", swapId);
    throw e;
  }
}

export async function cancelRelaySwap(userId: string, id: string) {
  const { data } = await supabaseAdmin.from("relay_swaps").update({ status: "cancelled", error: "Cancelled on the Swap page", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", userId).eq("status", "awaiting_approval").select("id");
  if (!data?.length) throw new Error("This swap can't be cancelled any more.");
  const { cancelApprovals } = await import("@/lib/pocket-send/approvals.server");
  await cancelApprovals({ purpose: "relay_swap", refId: id }, "You cancelled this swap on the Swap page.");
}

/* ---------------------------------- advance ---------------------------------- */

const OPEN = "(done,refunded,failed,declined,expired,cancelled)";

async function claim(id: string): Promise<Row | null> {
  const now = new Date();
  const { data } = await supabaseAdmin.from("relay_swaps").update({ working_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq("id", id).not("status", "in", OPEN).or(`working_until.is.null,working_until.lt.${now.toISOString()}`).select("*").maybeSingle();
  return (data as Row | null) ?? null;
}
async function save(id: string, patch: Partial<Row>) {
  const { error } = await supabaseAdmin.from("relay_swaps").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not record the swap: ${error.message}`);
}
const move = (status: RelayStatus, extra: Partial<Row> = {}): Partial<Row> => ({ status, step_at: new Date().toISOString(), error: null, ...extra });
async function notify(r: Row, text: string) {
  try {
    const { notifyUser } = await import("@/lib/telegram.server");
    await notifyUser(r.user_id, "notify_settlement", text);
  } catch (e) {
    console.error("relay swap alert failed", e);
  }
}
const stay = "Your coins stayed in your pocket.";

const STOP = new Set(["failed", "kept_mid", "kept_usdc"]);
async function step(r: Row): Promise<boolean> {
  const status = r.status as RelayStatus;
  const go = async (patch: Partial<Row>) => {
    await save(r.id, patch);
    const changed = patch.status !== undefined && patch.status !== status;
    if (changed && !r.parent_id && STOP.has(String(patch.status))) void import("@/lib/swap/stop-alert.server").then((m) => m.alertSwapStopped({ userId: r.user_id, id: r.id, what: `${r.amount_in} ${legs(r.direction as RelayDirection).from} → ${legs(r.direction as RelayDirection).to}`, was: String(status), now: String(patch.status), why: patch.error }));
    return changed;
  };
  const { from, to } = legs(r.direction as RelayDirection);

  switch (status) {
    case "awaiting_approval": {
      if (!r.approval_id) return go(minutesSince(r.created_at) > 20 ? move("expired") : {});
      const { data: ap } = await supabaseAdmin.from("send_approvals").select("status, expires_at").eq("id", r.approval_id).maybeSingle();
      if (!ap) return go(move("cancelled", { error: "The approval request is missing." }));
      if (ap.status === "declined") return go(move("declined", { error: "Declined in Telegram. Nothing was sent." }));
      if (ap.status === "cancelled") return go(move("cancelled", { error: "The approval request was closed. Nothing was sent." }));
      if (ap.status === "expired" || (ap.status === "pending" && Date.parse(ap.expires_at) <= Date.now())) return go(move("expired", { error: "Not approved in time. Nothing was sent." }));
      if (ap.status !== "approved") return go({});
      if (!(await sameLink(r.user_id, r.pocket, r.recipient))) return go(move("cancelled", { error: "Your wallet link changed since this request. Nothing was sent." }));
      const { spendApproval } = await import("@/lib/pocket-send/approvals.server");
      await spendApproval({ purpose: "relay_swap", id: r.approval_id, leg: `relay:${from}`, userId: r.user_id, linkId: r.link_id, amount: Number(r.amount_in), from: r.pocket, to: r.recipient ?? r.pocket });
      return go(move("approved"));
    }

    case "approved": {
      if (!r.approval_id) return go(move("failed", { error: "This swap was never approved. Nothing was sent." }));
      if (r.deposit_txid) return go(move("sending"));
      const link = await sameLink(r.user_id, r.pocket, r.recipient);
      if (!link) return go(move("cancelled", { error: "Your trading pocket was unlinked, so Seeds stopped this swap. Nothing was sent." }));
      const amountWei = BigInt(r.amount_in_wei);
      let q: RelayQuote;
      try {
        q = await relayQuote(r.direction as RelayDirection, r.pocket, amountWei, r.slippage_bps, r.recipient ?? undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/Nothing was sent/.test(msg)) return go(move("failed", { error: msg.slice(0, 300) }));
        return go(minutesSince(r.step_at) > 30 ? move("failed", { error: `Relay didn't give a usable price for 30 minutes. ${stay}` }) : { error: `${msg}; retrying.`.slice(0, 300) });
      }
      if (q.outWei < BigInt(r.min_out_wei)) {
        void notify(r, `Seeds didn't send your ${SYMBOL[from]} to Relay: the price fell below the minimum you agreed to. ${stay}`);
        return go(move("failed", { error: `The price fell below your minimum before sending. ${stay}` }));
      }
      const bal = await nativeBalance(from as EvmChain, r.pocket);
      const f = await fees(from as EvmChain);
      if (bal == null || !f) return go({ error: `${NETWORK_NAME[from]} didn't answer; retrying.` });
      if (bal < amountWei + feeNeed(f.maxFeePerGas)) return go(move("failed", { error: `Your pocket no longer holds the amount plus the network fee. ${stay}` }));
      const { evmCallDetailed, fetchNonce, sendRawTransaction } = await import("@/lib/evm.server");
      const evmFrom = from as EvmChain;
      // TON payouts: note the TON pocket balance once, before anything is signed, to confirm arrival later.
      if (to === "ton" && r.dest_baseline == null) {
        const { fetchExtraBalance } = await import("@/lib/pockets/io.server");
        const base = await fetchExtraBalance("TON", r.recipient!);
        if (base == null) return go({ error: "TON didn't answer the balance check; retrying." });
        await save(r.id, { dest_baseline: base });
      }
      const test = await evmCallDetailed(evmFrom, { from: r.pocket, to: q.to, data: q.data, value: hex(q.value) });
      if (test == null) return go({ error: `${NETWORK_NAME[from]} didn't answer the test run; retrying.` });
      if (!test.ok) return go(move("failed", { error: `A test run of the Relay deposit was refused (${test.error}). ${stay}`.slice(0, 300) }));
      const nonce = await fetchNonce(evmFrom, r.pocket);
      if (nonce == null) return go({ error: "Couldn't read your pocket's transaction count; retrying." });
      const { withPocketKey } = await import("@/lib/xchain/send.server");
      const { signEip1559 } = await import("@/lib/evm/tx.server");
      const signed = await withPocketKey(link, "EVM", link.addresses.EVM!, async (priv) =>
        signEip1559({ privateKeyHex: bytesToHex(priv), chainId: CHAIN_IDS[evmFrom], nonce, ...f, gasLimit: RELAY_DEPOSIT_GAS, to: q.to, value: q.value, data: q.data }));
      if (!sameAddr(signed.from, r.pocket)) throw new Error("The stored key doesn't match your pocket address. Nothing was sent.");
      // Recorded before broadcast: never signed again.
      await save(r.id, { deposit_txid: signed.hash, request_id: q.requestId, quoted_out_wei: q.outWei.toString() });
      try {
        await sendRawTransaction(evmFrom, signed.raw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/rejected/i.test(msg)) return go(move("failed", { error: `${msg}. ${stay}`.slice(0, 300) }));
      }
      const { tellMember } = await import("@/lib/xchain/send.server");
      void tellMember(r.user_id, `Relay swap sent: ${fmt(Number(r.amount_in))} ${SYMBOL[from]} → about ${fmt(fromUnits(to, q.outWei))} ${SYMBOL[to]}. Tx ${signed.hash}`, [
        `Sent from your own trading pocket ${r.pocket} on ${NETWORK_NAME[from]} to Relay's deposit contract`,
        `Relay pays about ${fmt(fromUnits(to, q.outWei))} ${SYMBOL[to]} to ${r.recipient ? `your own TON pocket ${r.recipient}` : "the same pocket"} on ${NETWORK_NAME[to]}, or refunds`,
        `Network transaction ${signed.hash}`,
      ]);
      return go(move("sending"));
    }

    case "sending": {
      const rc = await rpc<{ status: string } | null>(from as EvmChain, "eth_getTransactionReceipt", [r.deposit_txid]);
      if (!rc) return go(minutesSince(r.step_at) > 30 ? move("failed", { error: "The deposit never showed up on the network. The team will double-check." }) : {});
      if (rc.status !== "0x1") return go(move("failed", { error: `The network refused the deposit. ${stay} Only the network fee was spent.` }));
      return go(move("bridging"));
    }

    case "bridging": {
      const s = (await relayFetch(`/intents/status?requestId=${r.request_id}`).catch(() => null)) as { status?: string; txHashes?: string[] } | null;
      const p = relayProgress(s);
      if (!p) {
        if (minutesSince(r.step_at) > RELAY_STUCK_MINUTES && !r.error) void notify(r, `Your Relay swap is taking longer than usual. Seeds keeps checking; the team has been told.`);
        return go(minutesSince(r.step_at) > RELAY_STUCK_MINUTES ? { error: "Relay hasn't paid out yet; the team will check." } : {});
      }
      if (p.status === "done") {
        // The payout must be a successful transaction on the destination network.
        if (to === "ton") {
          // TON payout (audit TA5): the pocket's own history must show an incoming TON transfer of at
          // least the agreed minimum since this swap started; the balance is no longer the proof.
          const { Address } = await import("@ton/core");
          const { tonEndpoint } = await import("@/lib/nodes.server");
          const ep = tonEndpoint(true);
          const raw = Address.parse(r.recipient!).toRawString();
          const since = Math.floor(Date.parse(r.created_at) / 1000);
          const res = await fetch(`${ep.url}/accounts/${encodeURIComponent(raw)}/events?limit=50&start_date=${since}`, { headers: ep.headers }).catch(() => null);
          const body = res && res.ok ? await res.json().catch(() => null) as { events?: TonAccountEvent[] } | null : null;
          if (!body) return go({});
          if (!tonPayoutSeen(body.events, raw, BigInt(r.min_out_wei), since)) {
            return go(minutesSince(r.step_at) > RELAY_STUCK_MINUTES ? { error: "Relay says it paid, but the TON hasn't shown up in your pocket yet; the team will check." } : {});
          }
        } else if (p.outTxid) {
          const out = await rpc<{ status: string } | null>(to, "eth_getTransactionReceipt", [p.outTxid]);
          if (!out) return go({});
          if (out.status !== "0x1") return go({ error: "Relay's payout transaction failed on the network; the team will check." });
        }
        const out = fromUnits(to, BigInt(r.quoted_out_wei ?? "0"));
        void notify(r, `Done: about ${fmt(out)} ${SYMBOL[to]} is in your pocket on ${NETWORK_NAME[to]}.`);
        return go(move("done", { out_txid: p.outTxid, amount_out: out }));
      }
      if (p.status === "refunded") {
        void notify(r, `Relay refunded your ${SYMBOL[from]} to your pocket on ${NETWORK_NAME[from]}.`);
        return go(move("refunded", { out_txid: p.outTxid, error: "Relay refunded the swap." }));
      }
      return go(move("failed", { error: "Relay reports the swap failed; the team will check where the coins are." }));
    }
    default:
      return go({});
  }
}

export async function advanceRelaySwap(id: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await claim(id);
    if (!r) return;
    let changed = false;
    try {
      changed = await step(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("relay swap step failed", id, r.status, msg);
      await save(id, { error: msg.slice(0, 300) }).catch(() => undefined);
    } finally {
      await supabaseAdmin.from("relay_swaps").update({ working_until: null }).eq("id", id);
    }
    if (!changed) return;
  }
}

export async function advanceOpenRelaySwaps(): Promise<{ checked: number }> {
  const { data } = await supabaseAdmin.from("relay_swaps").select("id").not("status", "in", OPEN).order("created_at", { ascending: true }).limit(25);
  for (const r of data ?? []) await advanceRelaySwap(r.id).catch((e) => console.error("relay swap advance failed", r.id, e));
  return { checked: data?.length ?? 0 };
}

export async function listRelaySwaps(userId: string) {
  const { data: open } = await supabaseAdmin.from("relay_swaps").select("id").eq("user_id", userId).not("status", "in", OPEN).limit(3);
  for (const r of open ?? []) await advanceRelaySwap(r.id).catch(() => undefined);
  const { data, error } = await supabaseAdmin.from("relay_swaps")
    .select("id, direction, amount_in, shown_out, amount_out, status, error, deposit_txid, out_txid, created_at, updated_at")
    .eq("user_id", userId).is("parent_id", null).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const l = legs(r.direction as RelayDirection);
    return {
      ...r, amount_in: Number(r.amount_in), shown_out: Number(r.shown_out), amount_out: r.amount_out == null ? null : Number(r.amount_out),
      symbolIn: SYMBOL[l.from], symbolOut: SYMBOL[l.to], fromChain: l.from, toChain: l.to, terminal: isRelayTerminal(r.status),
    };
  });
}

/**
 * A Relay step of a one-tap HYPE swap (src/lib/hype-chain): reserved already approved by the
 * chain's single Telegram tap and tagged with it, then carried by the same stage machine
 * (fresh quote >= min, test run, hash before broadcast).
 */
export async function startRelayLeg(chainId: string, i: { direction: RelayDirection; pocket: string; amountWei: bigint; shownOut: number; minOutWei: bigint; amountUsd: number; recipient?: string }) {
  const { data: id, error } = await supabaseAdmin.rpc("reserve_relay_leg", {
    _chain_id: chainId,
    _row: { direction: i.direction, pocket: i.pocket, amount_in: fromWei(i.amountWei), amount_in_wei: i.amountWei.toString(), shown_out: i.shownOut, min_out_wei: i.minOutWei.toString(), amount_usd: Math.round(i.amountUsd * 100) / 100, recipient: i.recipient ?? null } as never,
  });
  if (error || !id) throw new Error(clean(error?.message ?? "Could not start the Relay step."));
  void advanceRelaySwap(id as string).catch(() => undefined);
  return id as string;
}
