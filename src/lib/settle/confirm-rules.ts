/**
 * Exchange settlement waits (security audit #3, A1).
 *
 * Members hold the same pocket keys Seeds signs with, so a payer could replace or
 * double-spend their own send right after Seeds broadcasts it. Seeds therefore sends
 * the second side of a trade only after the first side is buried under enough blocks,
 * and treats a send that never confirms (or that the network rejected) as vanished:
 * the trade goes to dispute and that payer's trading is frozen until an admin looks.
 *
 * Pure: no I/O. Tested in confirm-rules.test.ts.
 */

/** Blocks a first-side send needs before Seeds pays the second side (and before a trade reads "settled"). */
export const CONFIRMATIONS_NEEDED: Record<string, number> = {
  txc: 2, // TEXITcoin, and TSD / wrapped coins on Omni (they ride TEXITcoin blocks)
  isk: 2,
  ltc: 2,
  ethereum: 3,
  base: 12, // cheap blocks: a deeper wait
  bsc: 15,
  pulsechain: 12,
  zcu: 12,
};

/** Unknown networks wait the longest listed depth rather than the shortest. */
export function confirmationsNeeded(network: string | null | undefined): number {
  if (network && Number.isFinite(CONFIRMATIONS_NEEDED[network])) return CONFIRMATIONS_NEEDED[network];
  return Math.max(...Object.values(CONFIRMATIONS_NEEDED));
}

/** A send the network has never heard of after this long has been replaced or dropped. */
export const NOT_FOUND_AFTER_MS = 20 * 60_000;

export type SentLegCheck = {
  kind: "utxo" | "omni" | "evm";
  /** true = a server knows the transaction; false = a server answered "no such transaction"; null = no server answered. */
  found: boolean | null;
  confirmations: number | null;
  /** The network included it but rejected it (EVM revert, Omni "invalid"). */
  rejected: boolean;
  /** Time since Seeds broadcast it (or since it was resent). */
  ageMs: number;
  /** Seeds still holds the signed send and hasn't resent it yet. */
  canResend?: boolean;
  /** EVM: the pocket's confirmed nonce moved past ours without our hash — another send took its place. */
  replaced?: boolean;
};

export type SentLegState = "confirmed" | "waiting" | "vanished" | "resend";

export function sentLegState(c: SentLegCheck, needed: number): SentLegState {
  if (c.rejected) return "vanished";
  if (c.found === true && (c.confirmations ?? 0) >= needed) return "confirmed";
  // Nobody answered: never accuse a member because Seeds' own servers are down.
  if (c.found === null) return "waiting";
  if (c.found === false && c.ageMs > NOT_FOUND_AFTER_MS) {
    // A low-fee send can simply drop out of the network's waiting room. Before calling it a
    // double-spend, Seeds resends the exact same signed send once (unless it was clearly replaced).
    if (c.replaced) return "vanished";
    return c.canResend ? "resend" : "vanished";
  }
  // Seen but slow (low fee, busy network) is Seeds' fee choice, not the payer's doing:
  // it waits, and after STUCK_AFTER_MS an admin looks without blaming anyone.
  return "waiting";
}

/** A side still not confirmed after this long (whatever the reason) goes to an admin, without blaming anyone. */
export const STUCK_AFTER_MS = 6 * 60 * 60_000;

export type SettleStep =
  | { action: "wait" }
  | { action: "stuck"; leg: string }
  | { action: "send_second" }
  | { action: "settled" }
  | { action: "dispute"; leg: string };

/**
 * What the every-minute job does with a trade whose settlement has started.
 * `legs` lists each side in send order (first payer first).
 */
export function nextSettleStep(legs: Array<{ leg: string; sent: boolean; state: SentLegState | null; ageMs?: number }>): SettleStep {
  const step = stepFor(legs);
  if (step.action !== "wait") return step;
  const stuck = legs.find((l) => l.sent && l.state !== "confirmed" && (l.ageMs ?? 0) > STUCK_AFTER_MS);
  return stuck ? { action: "stuck", leg: stuck.leg } : step;
}

function stepFor(legs: Array<{ leg: string; sent: boolean; state: SentLegState | null }>): SettleStep {
  const [first, second] = legs;
  if (!first) return { action: "wait" };
  if (first.sent && first.state === "vanished") return { action: "dispute", leg: first.leg };
  if (second?.sent && second.state === "vanished") return { action: "dispute", leg: second.leg };
  if (!first.sent) return { action: "wait" };
  if (first.state !== "confirmed") return { action: "wait" };
  if (second && !second.sent) return { action: "send_second" };
  if (legs.every((l) => l.sent && l.state === "confirmed")) return { action: "settled" };
  return { action: "wait" };
}

/**
 * What a resend's answer means. "accepted": the network took it (or already has it), wait again.
 * "spent_elsewhere": the coins it spends were used by another send — a real double-spend.
 * "retry": no clear answer (server down, timeout); try again next run, blame nobody.
 */
export function resendOutcome(error: string | null): "accepted" | "spent_elsewhere" | "retry" {
  if (error == null) return "accepted";
  if (/already[ -]known|known transaction|txn-already|already[ -]in[ -](the )?(mempool|block ?chain)/i.test(error)) return "accepted";
  if (/missing ?inputs|missingorspent|inputs-missing|mempool-conflict|txn-mempool-conflict|nonce too low|replacement transaction underpriced|insufficient funds/i.test(error)) return "spent_elsewhere";
  return "retry";
}

/**
 * "No such transaction" counts only when two different servers say so (one lagging or
 * thin server must never freeze a member; same two-server standard as THORChain vaults).
 * Any server holding it = found. Otherwise unknown: wait, blame nobody.
 */
export function lookupVerdict(answers: Array<"found" | "missing" | "error">): boolean | null {
  if (answers.includes("found")) return true;
  return answers.filter((a) => a === "missing").length >= 2 ? false : null;
}

/** A resend with no clear answer is tried again only after this long (not every minute). */
export const RESEND_RETRY_AFTER_MS = 5 * 60_000;

export function resendDue(lastAttemptAtMs: number | null, nowMs: number): boolean {
  return lastAttemptAtMs == null || nowMs - lastAttemptAtMs >= RESEND_RETRY_AFTER_MS;
}

/**
 * How long a TXC/ISK "does this node keep a full transaction index" answer is reused.
 * A real answer: 10 minutes. The check itself failing: 1 minute, so a brief hiccup
 * doesn't switch off double-spend detection for long.
 */
export function txIndexCacheMs(checkFailed: boolean): number {
  return checkFailed ? 60_000 : 10 * 60_000;
}
