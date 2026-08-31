import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const addressInput = (input: unknown) =>
  z.object({ address: z.string().trim().min(20).max(120) }).parse(input);

/** Public TSD dashboard payload: property facts, supply, holders. */
export const getTsdSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTsdSnapshot } = await import("./omni.server");
  return fetchTsdSnapshot();
});

/** TSD balance for a single TEXITcoin address. */
export const getTsdBalance = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }) => {
    const { fetchOmniBalance } = await import("./omni.server");
    return fetchOmniBalance(data.address);
  });

/** Wrapped-asset balances (wBTC/wLTC/wETH) for a TEXITcoin address. */
export const getWrappedBalances = createServerFn({ method: "POST" })
  .inputValidator(addressInput)
  .handler(async ({ data }) => {
    const { fetchOmniBalance } = await import("./omni.server");
    const { OMNI_LEG_IDS, omniLegAsset } = await import("@/lib/chains");
    return Promise.all(
      OMNI_LEG_IDS.filter((id) => id !== "tsd").map(async (id) => {
        const { symbol, propertyId } = omniLegAsset(id);
        const res = await fetchOmniBalance(data.address, propertyId);
        return { symbol, balance: res.balance, online: res.online };
      }),
    );
  });

/** TSD balances for several addresses at once (savings + trading branch). */
export const getTsdBalances = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ addresses: z.array(z.string().trim().min(20).max(120)).max(10) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchOmniBalance } = await import("./omni.server");
    return Promise.all(data.addresses.map((a) => fetchOmniBalance(a)));
  });
