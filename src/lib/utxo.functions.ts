import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Confirmed balance of a legacy address on Litecoin or Iskandercoin. */
export const getUtxoBalances = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        ltcAddress: z.string().trim().max(120).nullish(),
        iskAddress: z.string().trim().max(120).nullish(),
        fresh: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { loadDisplayUtxosFor, fetchArrivingFor, utxoChainOnline } = await import("./utxo/io.server");
    const { shared } = await import("./cache/shared-cache.server");
    const { CACHE_TIMES, balanceKey } = await import("./cache/shared-cache-rules");
    const entries = [
      { chain: "ltc" as const, symbol: "LTC", address: data.ltcAddress ?? null },
      { chain: "isk" as const, symbol: "ISK", address: data.iskAddress ?? null },
    ];

    return Promise.all(
      entries.map(async (e) => {
        if (!e.address || !utxoChainOnline(e.chain)) {
          return { ...e, balance: 0, arriving: 0, online: false };
        }
        // Display only (sends pick coins from a live read). ISK reads the
        // mempool.iskandercoin.com address index first, so it keeps a minute like the rest.
        const address = e.address;
        return shared(balanceKey(e.chain, address), { ...CACHE_TIMES.balance, force: data.fresh, good: (r) => r.online }, async () => {
          try {
            // `arriving` = coins still waiting for a block, only for the grey note (never the balance).
            const [utxos, arriving] = await Promise.all([loadDisplayUtxosFor(e.chain, address), fetchArrivingFor(e.chain, address)]);
            return { ...e, balance: utxos.reduce((sum, u) => sum + u.amount, 0), arriving, online: true };
          } catch {
            return { ...e, balance: 0, arriving: 0, online: false };
          }
        });
      }),
    );
  });
