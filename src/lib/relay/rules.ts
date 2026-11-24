/**
 * Relay swaps: ETH on Ethereum <-> HYPE on HyperEVM (pure, client-safe, tested).
 *
 * Relay is an outside bridge: the member's pocket pays native coin into Relay's
 * depository contract, and a Relay solver pays native coin out on the other network
 * to the same pocket (the EVM pocket shares one key and address on both networks).
 * Seeds builds nothing itself; it signs Relay's deposit only after checkRelayQuote
 * proves it is exactly: depositNative(pocket, orderId) to the known depository,
 * on the right network, for exactly the agreed amount, paying the pocket back.
 */

export type RelayDirection = "to_hype" | "from_hype";
export type RelayChain = "ethereum" | "hyperevm";

export const RELAY_API = "https://api.relay.link";
/**
 * Relay's depository, same address on both networks. Checked on-chain Nov 24 2026:
 * code present on Ethereum and HyperEVM (17,259 bytes each) and both contain the
 * depositNative(address,bytes32) selector 0x49290c1c used by every live deposit quote.
 */
export const RELAY_DEPOSITORY = "0x4cd00e387622c35bddb9b4c962c136462338bc31";
export const DEPOSIT_NATIVE_SELECTOR = "0x49290c1c";
export const NATIVE_ZERO = "0x0000000000000000000000000000000000000000";

export const CHAIN_IDS: Record<RelayChain, number> = { ethereum: 1, hyperevm: 999 };
export const SYMBOL: Record<RelayChain, string> = { ethereum: "ETH", hyperevm: "HYPE" };
export const NETWORK_NAME: Record<RelayChain, string> = { ethereum: "Ethereum", hyperevm: "Hyperliquid (HyperEVM)" };

export function legs(d: RelayDirection): { from: RelayChain; to: RelayChain } {
  return d === "to_hype" ? { from: "ethereum", to: "hyperevm" } : { from: "hyperevm", to: "ethereum" };
}

/** Price protection choices (basis points); default 1%. */
export const RELAY_SLIPPAGE_CHOICES_BPS = [50, 100, 200, 300] as const;
export const RELAY_DEFAULT_SLIPPAGE_BPS = 100;
/** The fresh quote at request time may be at most this much worse than shown. */
export const RELAY_REQUOTE_TOLERANCE_BPS = 100;
/** Gas for depositNative (live quotes ask ~33k); generous headroom. */
export const RELAY_DEPOSIT_GAS = 60_000n;
/** No Relay payout after this long counts as stuck: the team checks (nothing is re-sent). */
export const RELAY_STUCK_MINUTES = 60;
/** Smallest swap Seeds sends ($), so fees don't eat it. */
export const RELAY_MIN_USD = 5;

export const TERMINAL = ["done", "refunded", "failed", "declined", "expired", "cancelled"] as const;
export type RelayStatus = "awaiting_approval" | "approved" | "sending" | "bridging" | (typeof TERMINAL)[number];
export const isRelayTerminal = (s: string) => (TERMINAL as readonly string[]).includes(s);
export const RELAY_STATUS_LABEL: Record<RelayStatus, string> = {
  awaiting_approval: "Waiting for your Telegram tap", approved: "Approved", sending: "Sending to Relay", bridging: "Relay delivering",
  done: "Delivered", refunded: "Refunded by Relay", failed: "Stopped", declined: "Declined", expired: "Not approved in time", cancelled: "Cancelled",
};

const lc = (s: unknown) => (typeof s === "string" ? s.toLowerCase() : "");
const isAddr = (s: string) => /^0x[0-9a-f]{40}$/.test(s);
const uint = (s: unknown): bigint | null => (typeof s === "string" && /^\d{1,78}$/.test(s) ? BigInt(s) : typeof s === "number" && Number.isSafeInteger(s) && s >= 0 ? BigInt(s) : null);

/** The quote request Seeds sends to Relay (always own pocket -> own pocket, native -> native). */
export function quoteBody(d: RelayDirection, pocket: string, amountWei: bigint, slippageBps: number) {
  const { from, to } = legs(d);
  return {
    user: pocket, recipient: pocket, originChainId: CHAIN_IDS[from], destinationChainId: CHAIN_IDS[to],
    originCurrency: NATIVE_ZERO, destinationCurrency: NATIVE_ZERO, amount: amountWei.toString(), tradeType: "EXACT_INPUT",
    slippageTolerance: String(slippageBps),
  };
}

export type CheckedDeposit = { requestId: string; to: string; value: bigint; data: string; chainId: number; outWei: bigint; minWei: bigint; seconds: number | null };

/**
 * Proves a Relay quote is the deposit Seeds agreed to sign, or throws (nothing signed).
 * Only a single native deposit step is accepted; anything else (approvals, signatures,
 * extra calls, another contract, another recipient) is refused.
 */
export function checkRelayQuote(q: unknown, expect: { direction: RelayDirection; pocket: string; amountWei: bigint }): CheckedDeposit {
  const pocket = lc(expect.pocket);
  if (!isAddr(pocket)) throw new Error("Pocket address is not valid.");
  const { from, to } = legs(expect.direction);
  const quote = q as { steps?: unknown[]; details?: Record<string, unknown> } | null;
  const steps = Array.isArray(quote?.steps) ? quote!.steps : [];
  if (steps.length !== 1) throw new Error("Relay asked for more than one step. Nothing was sent.");
  const step = steps[0] as { id?: string; kind?: string; requestId?: string; items?: unknown[] };
  if (step.id !== "deposit" || step.kind !== "transaction") throw new Error("Relay's step isn't a plain deposit. Nothing was sent.");
  const requestId = lc(step.requestId);
  if (!/^0x[0-9a-f]{64}$/.test(requestId)) throw new Error("Relay gave no valid request id. Nothing was sent.");
  const items = Array.isArray(step.items) ? step.items : [];
  if (items.length !== 1) throw new Error("Relay asked for more than one transaction. Nothing was sent.");
  const tx = (items[0] as { data?: Record<string, unknown> }).data ?? {};
  if (lc(tx.to) !== RELAY_DEPOSITORY) throw new Error("Relay's deposit goes to an unknown contract. Nothing was sent.");
  if (Number(tx.chainId) !== CHAIN_IDS[from]) throw new Error("Relay's deposit is on the wrong network. Nothing was sent.");
  if (tx.from != null && lc(tx.from) !== pocket) throw new Error("Relay's deposit isn't from your pocket. Nothing was sent.");
  if (uint(tx.value) !== expect.amountWei) throw new Error("Relay's deposit amount doesn't match. Nothing was sent.");
  // depositNative(depositor = this pocket, id): the 32-byte id is Relay's own order id (not the requestId);
  // the depositor is who Relay credits and refunds, so it must be the pocket itself.
  const want = lc(tx.data);
  const prefix = `${DEPOSIT_NATIVE_SELECTOR}${pocket.slice(2).padStart(64, "0")}`;
  if (!want.startsWith(prefix) || !/^[0-9a-f]{64}$/.test(want.slice(prefix.length))) throw new Error("Relay's deposit instruction isn't the expected one. Nothing was sent.");

  const det = quote?.details ?? {};
  if (lc(det.recipient) !== pocket) throw new Error("Relay would pay someone else. Nothing was sent.");
  const out = det.currencyOut as { amount?: unknown; minimumAmount?: unknown; currency?: { chainId?: unknown; address?: unknown; decimals?: unknown } } | undefined;
  if (Number(out?.currency?.chainId) !== CHAIN_IDS[to] || lc(out?.currency?.address) !== NATIVE_ZERO || Number(out?.currency?.decimals) !== 18) {
    throw new Error(`Relay would pay a different coin than ${SYMBOL[to]}. Nothing was sent.`);
  }
  const outWei = uint(out?.amount), minWei = uint(out?.minimumAmount) ?? outWei;
  if (outWei == null || outWei <= 0n || minWei == null) throw new Error("Relay gave no payout amount. Nothing was sent.");
  const secs = Number(det.timeEstimate);
  return { requestId, to: RELAY_DEPOSITORY, value: expect.amountWei, data: want, chainId: CHAIN_IDS[from], outWei, minWei, seconds: Number.isFinite(secs) ? secs : null };
}

/** The agreed minimum: what was shown, less the member's price protection. */
export function agreedMinWei(shownOutWei: bigint, slippageBps: number): bigint {
  return (shownOutWei * BigInt(10_000 - slippageBps)) / 10_000n;
}

export function requoteOk(shownOutWei: bigint, freshOutWei: bigint, toleranceBps = RELAY_REQUOTE_TOLERANCE_BPS): boolean {
  return shownOutWei > 0n && freshOutWei * 10_000n >= shownOutWei * BigInt(10_000 - toleranceBps);
}

/** Relay's /intents/status answer -> our status (null = still on its way). */
export function relayProgress(s: { status?: string; txHashes?: string[] } | null): { status: "done" | "refunded" | "failed"; outTxid: string | null } | null {
  const st = lc(s?.status);
  if (st === "success") return { status: "done", outTxid: s?.txHashes?.[0] ?? null };
  if (st === "refund" || st === "refunded") return { status: "refunded", outTxid: s?.txHashes?.[0] ?? null };
  if (st === "failure" || st === "failed") return { status: "failed", outTxid: null };
  return null;
}

/** 18-decimal string amount -> wei (at most 8 decimals count); null when not a positive amount. */
export function toWei(amount: string): bigint | null {
  if (!/^\d{1,12}(\.\d+)?$/.test(amount)) return null;
  const [w, f = ""] = amount.split(".");
  const v = BigInt(w!) * 10n ** 18n + BigInt((f.slice(0, 8) + "0".repeat(18)).slice(0, 18));
  return v > 0n ? v : null;
}
export const fromWei = (w: bigint) => Number(w) / 1e18;
