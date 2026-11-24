import { createServerFn } from "@tanstack/react-start";
import { CHAIN_IDS } from "@/lib/chains";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Audit T1: paid-node portfolio and token reads only for a signed-in member's own address
 * (active link, saved pocket addresses, or their old wallet record), behind the visitor limit.
 */
async function guardOwnEvm(userId: string, address: string): Promise<void> {
  const { requireIpAllowance } = await import("./ip-rate.server");
  const { IP_LIMITS } = await import("./ip-rate");
  await requireIpAllowance("pocket-read", IP_LIMITS.pocketRead);
  const a = address.trim().toLowerCase();
  const { activeLink } = await import("./pocket-send/pocket.server");
  const link = await activeLink(userId).catch(() => null);
  if (link && Object.values(link.addresses ?? {}).some((v) => typeof v === "string" && v.toLowerCase() === a)) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: saved } = await supabaseAdmin.from("pocket_addresses").select("link_id").eq("user_id", userId).eq("address_lc", a).limit(1);
  if (saved?.length) return;
  const { data: w } = await supabaseAdmin.from("wallets").select("evm_address").eq("user_id", userId).maybeSingle();
  if (w?.evm_address && w.evm_address.toLowerCase() === a) return;
  throw new Error("That address isn't one of your pocket addresses.");
}

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ address: evmAddress, fresh: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await guardOwnEvm(context.userId, data.address);
    const { fetchEvmBalances } = await import("./evm.server");
    const { shared } = await import("./cache/shared-cache.server");
    const { CACHE_TIMES, balanceKey } = await import("./cache/shared-cache-rules");
    const chains = ["base", "ethereum", "bsc", "zcu", "pulsechain", "hyperevm", "avalanche"] as const;
    // One copy per chain, kept only when that chain answered; gas checks and sends read live.
    const results = await Promise.all(chains.map((c) =>
      shared(balanceKey(`evm-${c}`, data.address), { ...CACHE_TIMES.balance, force: data.fresh, good: (rows) => rows.length > 0 && rows.every((r) => r.online) },
        () => fetchEvmBalances(c, data.address))));
    return results.flat();
  });

export const getEvmStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchEvmStatus } = await import("./evm.server");
  const chains = ["base", "ethereum", "bsc", "pulsechain", "hyperevm", "avalanche"] as const;
  return Promise.all(chains.map((c) => fetchEvmStatus(c)));
});

/** ERC-20 tokens on Ethereum and Base for the Balances page (display only, shared copy). */
export const getEvmTokenRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ address: evmAddress, fresh: z.boolean().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await guardOwnEvm(context.userId, data.address);
    const { fetchHeldTokens } = await import("./account/erc-tokens.server");
    const { tokenRows } = await import("./account/erc-tokens");
    const { shared } = await import("./cache/shared-cache.server");
    const { CACHE_TIMES, balanceKey } = await import("./cache/shared-cache-rules");
    const read = (c: "ethereum" | "base") => shared(balanceKey(`erc20-${c}`, data.address), { ...CACHE_TIMES.balance, force: data.fresh, good: (r) => r != null },
      () => fetchHeldTokens(c, data.address));
    const [ethereum, base] = await Promise.all([read("ethereum"), read("base")]);
    return tokenRows({ ethereum, base });
  });
