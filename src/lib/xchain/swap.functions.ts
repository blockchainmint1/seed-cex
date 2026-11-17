import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SWAP_COIN_IDS, swapCoin } from "./assets";
import { destinationValid, toBaseUnits } from "./safety";

/** Public: live THORChain + Maya availability and prices for every swap coin. */
export const getSwapStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { swapStatus } = await import("./router.server");
  return swapStatus();
});

const quoteInput = z.object({
  from: z.enum(SWAP_COIN_IDS),
  to: z.enum(SWAP_COIN_IDS),
  amount: z.string().trim().max(32),
  destination: z.string().trim().max(128).optional().default(""),
});

/**
 * Public: side-by-side THORChain and Maya quotes with the pre-send safety checks.
 * Read-only — nothing is signed or sent, and vault addresses are not returned.
 */
export const getSwapQuotes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => quoteInput.parse(input))
  .handler(async ({ data }) => {
    const from = swapCoin(data.from)!;
    const to = swapCoin(data.to)!;
    if (from.id === to.id) throw new Error("Pick two different coins.");
    const amount = toBaseUnits(data.amount);
    if (amount == null) throw new Error("Enter an amount with at most 8 decimal places.");
    const destination = data.destination || null;
    if (destination && !destinationValid(to, destination)) {
      throw new Error(`That doesn't look like a ${to.network} address (${to.addressHint}).`);
    }
    const { swapQuotes } = await import("./router.server");
    return swapQuotes(from, to, amount, destination);
  });
