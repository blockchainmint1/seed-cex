/**
 * Which servers Seeds asks for each blockchain, best first (server-only).
 *
 * Paid providers come first — Alchemy (ALCHEMY_KEY) and NowNodes (NOWNODES_API_KEY) —
 * and free public servers stay at the end as a backup. A provider is skipped when
 * its key isn't set. Alchemy puts its key in the URL path, so callers must never
 * log a full endpoint URL: log `new URL(url).host` at most.
 *
 * Checked live against both keys on 2026-11-19: Alchemy answers Ethereum, Base,
 * BNB Chain, TRON and Solana (Solana switched on in the Alchemy dashboard); NowNodes
 * answers Ethereum, Base, BNB Chain, PulseChain, Solana, TRON, XRP, Cosmos and
 * Cardano (Rosetta). Neither serves THORChain or Maya nodes.
 *
 * THORChain's node API (THORNode) goes through Liquify's paid plan (LIQUIFY_API_KEY,
 * sent as the x-api-key header at the gateway root — checked live 2026-11-19: 5M
 * calls/day vs 50k free). That key covers THORNode only. Midgard (THORChain's history
 * service) has its own Liquify key, LIQUIFY_MIDGARD, sent the same way (5M/day). Maya
 * is not covered by either.
 */

export type NodeNetwork = "ethereum" | "base" | "bsc" | "pulsechain" | "solana" | "tron" | "xrp" | "cosmos" | "hyperevm";
export type NodeEndpoint = { url: string; headers: Record<string, string>; provider: "alchemy" | "nownodes" | "liquify" | "public";
  /** Same machine as an earlier entry: a read fallback only, never a second confirmation. */
  backupOnly?: boolean;
};

const JSON_HEADERS = { "content-type": "application/json", accept: "application/json", "User-Agent": "seeds-exchange/1.0" };

const ALCHEMY_HOST: Partial<Record<NodeNetwork, string>> = {
  ethereum: "eth-mainnet",
  base: "base-mainnet",
  bsc: "bnb-mainnet",
  tron: "tron-mainnet",
  solana: "solana-mainnet",
};

const NOWNODES_URL: Partial<Record<NodeNetwork, string>> = {
  ethereum: "https://eth.nownodes.io",
  base: "https://base.nownodes.io",
  bsc: "https://bsc.nownodes.io",
  pulsechain: "https://pulse.nownodes.io",
  solana: "https://sol.nownodes.io",
  tron: "https://trx.nownodes.io",
  xrp: "https://xrp.nownodes.io",
  cosmos: "https://atom.nownodes.io",
};

const PUBLIC_URLS: Record<NodeNetwork, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth"],
  base: ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://1rpc.io/base"],
  bsc: ["https://bsc-rpc.publicnode.com"],
  pulsechain: ["https://rpc.pulsechain.com", "https://pulsechain-rpc.publicnode.com"],
  solana: ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"],
  tron: ["https://api.trongrid.io", "https://tron-rpc.publicnode.com"],
  xrp: ["https://xrplcluster.com", "https://xrpl.ws", "https://s1.ripple.com:51234", "https://s2.ripple.com:51234"],
  // Hyperliquid's own server + dRPC: two separate operators, so a deposit can be confirmed on both.
  hyperevm: ["https://rpc.hyperliquid.xyz/evm", "https://hyperevm.drpc.org"],
  cosmos: ["https://cosmos-rest.publicnode.com", "https://rest.cosmos.directory/cosmoshub"],
};

/** Networks where NowNodes is the only paid provider, so it goes first. */
const NOWNODES_FIRST = new Set<NodeNetwork>(["pulsechain", "xrp", "cosmos"]);

export function nodeEndpoints(net: NodeNetwork): NodeEndpoint[] {
  const out: NodeEndpoint[] = [];
  const alchemyKey = process.env.ALCHEMY_KEY;
  const nowKey = process.env.NOWNODES_API_KEY;
  const alchemy: NodeEndpoint[] = alchemyKey && ALCHEMY_HOST[net]
    ? [{ url: `https://${ALCHEMY_HOST[net]}.g.alchemy.com/v2/${alchemyKey}`, headers: { ...JSON_HEADERS }, provider: "alchemy" }]
    : [];
  const nownodes: NodeEndpoint[] = nowKey && NOWNODES_URL[net]
    ? [{ url: NOWNODES_URL[net]!, headers: { ...JSON_HEADERS, "api-key": nowKey }, provider: "nownodes" }]
    : [];
  out.push(...(NOWNODES_FIRST.has(net) ? [...nownodes, ...alchemy] : [...alchemy, ...nownodes]));
  out.push(...PUBLIC_URLS[net].map((url) => ({ url, headers: { ...JSON_HEADERS }, provider: "public" as const })));
  return out;
}

const THORNODE_PUBLIC = ["https://thorchain.ibs.team/api", "https://api-thorchain.rorcual.xyz"];
const LIQUIFY_FREE = "https://gateway.liquify.com/chain/thorchain_api";
const LIQUIFY_PAID = "https://gateway.liquify.com";

/**
 * THORNode servers, best first. With LIQUIFY_API_KEY: Liquify paid (key in a header,
 * never the address), then the two other public operators, then Liquify's free tier
 * as a last read fallback (same machine as the paid entry, so marked backupOnly).
 * Without the key: Liquify free first, as before.
 */
export function thornodeEndpoints(): NodeEndpoint[] {
  const key = process.env.LIQUIFY_API_KEY?.trim();
  const accept = { accept: "application/json" };
  const pub = (url: string, backupOnly = false): NodeEndpoint => ({ url, headers: { ...accept }, provider: "public", ...(backupOnly ? { backupOnly } : {}) });
  if (!key) return [pub(LIQUIFY_FREE), ...THORNODE_PUBLIC.map((u) => pub(u))];
  return [
    { url: LIQUIFY_PAID, headers: { ...accept, "x-api-key": key }, provider: "liquify" },
    ...THORNODE_PUBLIC.map((u) => pub(u)),
    pub(LIQUIFY_FREE, true),
  ];
}

const MIDGARD_FREE = ["https://gateway.liquify.com/chain/thorchain_midgard", "https://midgard.thorswap.net"];

/**
 * Midgard servers (prices, candles, volume history), best first: Liquify paid
 * (LIQUIFY_MIDGARD in a header) when set, then Liquify's free tier, then THORSwap's.
 */
export function midgardEndpoints(): NodeEndpoint[] {
  const key = process.env.LIQUIFY_MIDGARD?.trim();
  const accept = { accept: "application/json" };
  const free = MIDGARD_FREE.map((url): NodeEndpoint => ({ url, headers: { ...accept }, provider: "public" }));
  return key ? [{ url: LIQUIFY_PAID, headers: { ...accept, "x-api-key": key }, provider: "liquify" }, ...free] : free;
}

/** Cardano through NowNodes' Rosetta API (Koios stays as the free backup). */
export function cardanoRosetta(): NodeEndpoint | null {
  const key = process.env.NOWNODES_API_KEY;
  return key ? { url: "https://ada.nownodes.io", headers: { ...JSON_HEADERS, "api-key": key }, provider: "nownodes" } : null;
}

/** Bitcoin Core JSON-RPC through Alchemy: backup for fee estimates and broadcasts when Blockbook can't be reached. */
export function bitcoinRpc(): NodeEndpoint | null {
  const key = process.env.ALCHEMY_KEY;
  return key ? { url: `https://bitcoin-mainnet.g.alchemy.com/v2/${key}`, headers: { ...JSON_HEADERS }, provider: "alchemy" } : null;
}

/**
 * True when a failed call should move on to the next server: the server didn't
 * answer, timed out, rate-limited us or refused our key. A real answer (including
 * "this transaction is invalid") must not be retried elsewhere as if it never happened.
 */
export function shouldFailOver(status: number | null): boolean {
  return status === null || status === 401 || status === 403 || status === 404 || status === 408 || status === 429 || status >= 500;
}
