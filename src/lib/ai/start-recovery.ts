/** An unavailable read is never proof that a swap was not created. */
export function currentAiMessage(saved: number | null, tapped: number | undefined): boolean {
  return saved !== null && saved === tapped;
}

/** Do not round a send above the move's approved input amount. */
export function planSwapAmount(side: "buy" | "sell", amount: number): string {
  const decimals = side === "buy" ? 2 : 8;
  const scale = 10 ** decimals;
  return (Math.floor(amount * scale) / scale).toFixed(decimals);
}

export function interruptedStartDecision(input: { lookupOk: boolean; matchingRoutes: number; ageMs: number }): "wait" | "review" | "stop" {
  if (!input.lookupOk) return "wait";
  if (input.matchingRoutes > 0) return "review";
  return input.ageMs > 3 * 60_000 ? "stop" : "wait";
}

/** Visibility only; the server repeats all checks and also excludes untracked swaps. */
export function canRequestDayRetry(status: string, moves: { status: string; routeId: string | null }[]): boolean {
  return status === "cancelled" && moves.some((m) => m.status === "failed")
    && moves.every((m) => m.routeId === null && ["failed", "cancelled"].includes(m.status));
}

/** A lost response after reservation must not fail/requeue a trade whose swap exists. */
export async function runAiStart(io: {
  start: () => Promise<unknown>;
  readLink: () => Promise<{ ok: boolean; routeId: string | null }>;
  fail: (reason: string) => Promise<void>;
}): Promise<boolean> {
  try { await io.start(); return true; }
  catch (error) {
    const link = await io.readLink();
    if (!link.ok || link.routeId) return Boolean(link.routeId);
    await io.fail(error instanceof Error ? error.message : "Couldn't start the plan trade.");
    return false;
  }
}