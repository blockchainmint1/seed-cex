import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { isOmniLeg } from "@/lib/chains";

const tradeIdInput = (input: unknown) => z.object({ tradeId: z.string().uuid() }).parse(input);

/** Dry run of the TXC leg — every gate, no decryption, no broadcast. */
export const previewTxcLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { previewTxcSettlement } = await import("./settlement.server");
    return previewTxcSettlement(context.userId, data.tradeId);
  });

/** Build, sign, and broadcast the TXC leg on the live chain. */
export const settleTxc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { settleTxcLeg } = await import("./settlement.server");
    return settleTxcLeg(context.userId, data.tradeId);
  });

/** Confirmation depth for a broadcast TXC leg. */
export const watchTxc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { watchTxcLeg } = await import("./settlement.server");
    return watchTxcLeg(context.userId, data.tradeId);
  });

/* ---------------------------------- usdc ---------------------------------- */

/** Dry run of the USDC (EVM) leg — every gate, no decryption, no broadcast. */
export const previewUsdcLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { previewUsdcSettlement } = await import("./evm-settlement.server");
    return previewUsdcSettlement(context.userId, data.tradeId);
  });

/** Build, sign, and broadcast the USDC ERC-20 transfer on the live chain. */
export const settleUsdc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { settleUsdcLeg } = await import("./evm-settlement.server");
    return settleUsdcLeg(context.userId, data.tradeId);
  });

/** Confirmation depth for a broadcast USDC leg. */
export const watchUsdc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { watchUsdcLeg } = await import("./evm-settlement.server");
    return watchUsdcLeg(context.userId, data.tradeId);
  });

/* ----------------------------------- tsd ---------------------------------- */

/** Dry run of the TSD (Omni #39) leg — every gate, no decryption, no broadcast. */
export const previewTsdLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { previewTsdSettlement } = await import("./tsd-settlement.server");
    return previewTsdSettlement(context.userId, data.tradeId);
  });

/** Build, sign, and broadcast the TSD Omni transfer on the TEXITcoin chain. */
export const settleTsd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { settleTsdLeg } = await import("./tsd-settlement.server");
    return settleTsdLeg(context.userId, data.tradeId);
  });

/** Confirmation depth for a broadcast TSD leg. */
export const watchTsd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(tradeIdInput)
  .handler(async ({ data, context }) => {
    const { watchTsdLeg } = await import("./tsd-settlement.server");
    return watchTsdLeg(context.userId, data.tradeId);
  });


/* --------------------------- generic leg dispatch -------------------------- */

const legInput = (input: unknown) =>
  z
    .object({
      tradeId: z.string().uuid(),
      leg: z.enum(["txc", "tsd", "usdc", "usdt", "ltc", "isk", "zcu", "wbtc", "wltc", "weth"]),
    })
    .parse(input);

/** Dry run of any settlement leg — every gate, no decryption, no broadcast. */
export const previewLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(legInput)
  .handler(async ({ data, context }) => {
    if (isOmniLeg(data.leg)) {
      const { previewTsdSettlement } = await import("./tsd-settlement.server");
      const p = await previewTsdSettlement(context.userId, data.tradeId, data.leg);
      return { kind: "omni" as const, ...p };
    }
    if (data.leg === "txc" || data.leg === "ltc" || data.leg === "isk") {
      const { previewUtxoSettlement } = await import("./settlement.server");
      const p = await previewUtxoSettlement(context.userId, data.tradeId, data.leg);
      return { kind: "utxo" as const, ...p };
    }
    const { previewEvmSettlement } = await import("./evm-settlement.server");
    const p = await previewEvmSettlement(context.userId, data.tradeId, data.leg);
    return { kind: "evm" as const, ...p };
  });

/** Build, sign, and broadcast any settlement leg on its live chain. */
export const settleLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(legInput)
  .handler(async ({ data, context }) => {
    if (isOmniLeg(data.leg)) {
      const { settleTsdLeg } = await import("./tsd-settlement.server");
      const r = await settleTsdLeg(context.userId, data.tradeId, data.leg);
      return { id: r.txid, amount: r.amount, to: r.to };
    }
    if (data.leg === "txc" || data.leg === "ltc" || data.leg === "isk") {
      const { settleUtxoLeg } = await import("./settlement.server");
      const r = await settleUtxoLeg(context.userId, data.tradeId, data.leg);
      return { id: r.txid, amount: r.amount, to: r.to };
    }
    const { settleEvmLeg } = await import("./evm-settlement.server");
    const r = await settleEvmLeg(context.userId, data.tradeId, data.leg);
    return { id: r.hash, amount: r.amount, to: r.to, chain: r.chain };
  });

/** Confirmation depth for any broadcast leg. */
export const watchLeg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(legInput)
  .handler(async ({ data, context }) => {
    if (isOmniLeg(data.leg)) {
      const { watchTsdLeg } = await import("./tsd-settlement.server");
      const r = await watchTsdLeg(context.userId, data.tradeId, data.leg);
      return { id: r.txid, confirmations: r.confirmations };
    }
    if (data.leg === "txc" || data.leg === "ltc" || data.leg === "isk") {
      const { watchUtxoLeg } = await import("./settlement.server");
      const r = await watchUtxoLeg(context.userId, data.tradeId, data.leg);
      return { id: r.txid, confirmations: r.confirmations };
    }
    const { watchEvmLeg } = await import("./evm-settlement.server");
    const r = await watchEvmLeg(context.userId, data.tradeId, data.leg);
    return { id: r.hash, confirmations: r.confirmations, chain: r.chain };
  });
