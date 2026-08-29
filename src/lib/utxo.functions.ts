import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Confirmed balance of a legacy address on Litecoin or Iskandercoin. */
export const getUtxoBalances = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        ltcAddress: z.string().trim().max(120).nullish(),
        iskAddress: z.string().trim().max(120).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { loadUtxosFor, utxoChainOnline } = await import("./utxo/io.server");
    const entries = [
      { chain: "ltc" as const, symbol: "LTC", address: data.ltcAddress ?? null },
      { chain: "isk" as const, symbol: "ISK", address: data.iskAddress ?? null },
    ];

    return Promise.all(
      entries.map(async (e) => {
        if (!e.address || !utxoChainOnline(e.chain)) {
          return { ...e, balance: 0, online: false };
        }
        try {
          const utxos = await loadUtxosFor(e.chain, e.address);
          return { ...e, balance: utxos.reduce((sum, u) => sum + u.amount, 0), online: true };
        } catch {
          return { ...e, balance: 0, online: false };
        }
      }),
    );
  });
