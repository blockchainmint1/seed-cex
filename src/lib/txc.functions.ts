import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getChainSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchChainSnapshot } = await import("./txc.server");
  return fetchChainSnapshot();
});

export const getAddressStats = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ address: z.string().trim().min(20).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchAddressStats } = await import("./txc.server");
    return fetchAddressStats(data.address);
  });
