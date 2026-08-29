import { createServerFn } from "@tanstack/react-start";
import { CHAIN_IDS } from "@/lib/chains";
import { z } from "zod";

const evmAddress = z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, "Not an EVM address");

export const getEvmBalances = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ chain: z.enum(CHAIN_IDS), address: evmAddress }).parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchEvmBalances } = await import("./evm.server");
    return fetchEvmBalances(data.chain, data.address);
  });

export const getEvmPortfolio = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ address: evmAddress }).parse(input))
  .handler(async ({ data }) => {
    const { fetchEvmBalances } = await import("./evm.server");
    const chains = ["base", "ethereum", "bsc", "zcu"] as const;
    const results = await Promise.all(chains.map((c) => fetchEvmBalances(c, data.address)));
    return results.flat();
  });

export const getEvmStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchEvmStatus } = await import("./evm.server");
  const chains = ["base", "ethereum", "bsc"] as const;
  return Promise.all(chains.map((c) => fetchEvmStatus(c)));
});
