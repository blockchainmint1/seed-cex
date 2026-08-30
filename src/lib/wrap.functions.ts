import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const openInput = (input: unknown) =>
  z
    .object({
      baseSymbol: z.string().trim().min(2).max(12),
      amount: z.number().positive().max(1e9),
      /** Wrap: where a refund goes. Unwrap: where native coin is delivered. */
      counterpartyAddress: z.string().trim().min(20).max(120),
    })
    .parse(input);

/** Issuer health and published reserve-vs-supply figures. */
export const getWrapDesk = createServerFn({ method: "GET" }).handler(async () => {
  const { getWrapDeskStatus } = await import("./wrap.server");
  return getWrapDeskStatus();
});

/** Open a wrap: native coin in, wrapped asset minted to the trading branch. */
export const openWrapOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(openInput)
  .handler(async ({ data, context }) => {
    const { createWrapOrder } = await import("./wrap.server");
    return createWrapOrder(
      context.userId,
      data.baseSymbol,
      data.amount,
      data.counterpartyAddress,
    );
  });

/** Open an unwrap: wrapped asset burned, native coin released to the user. */
export const openUnwrapOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(openInput)
  .handler(async ({ data, context }) => {
    const { createUnwrapOrder } = await import("./wrap.server");
    return createUnwrapOrder(
      context.userId,
      data.baseSymbol,
      data.amount,
      data.counterpartyAddress,
    );
  });

/** Re-poll a single order against the issuer. */
export const syncWrapOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { refreshWrapOrder } = await import("./wrap.server");
    return refreshWrapOrder(context.userId, data.id);
  });

/** The caller's wrap/unwrap history. */
export const listMyWrapOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listWrapOrders } = await import("./wrap.server");
    return listWrapOrders(context.userId);
  });
