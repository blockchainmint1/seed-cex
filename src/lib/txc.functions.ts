import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getChainSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchChainSnapshot } = await import("./txc.server");
  const { shared } = await import("./cache/shared-cache.server");
  const { CACHE_TIMES } = await import("./cache/shared-cache-rules");
  return shared("txc:chain", { ...CACHE_TIMES.nodeStatus, good: (s) => s.online }, () => fetchChainSnapshot());
});

export const getAddressStats = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ address: z.string().trim().min(20).max(120), fresh: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchAddressStats } = await import("./txc.server");
    const { shared } = await import("./cache/shared-cache.server");
    const { CACHE_TIMES, balanceKey } = await import("./cache/shared-cache-rules");
    // Display only; sends read the chain live.
    // `arriving` = TXC still waiting for a block from someone else, only for the grey note.
    return shared(balanceKey("txc", data.address), { ...CACHE_TIMES.balance, force: data.fresh, good: (s) => s.online }, async () => {
      const { fetchArrivingFor } = await import("./utxo/io.server");
      const [stats, arriving] = await Promise.all([fetchAddressStats(data.address), fetchArrivingFor("txc", data.address).catch(() => 0)]);
      return { ...stats, arriving };
    });
  });
