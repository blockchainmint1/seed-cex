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
 * Cardano (Rosetta). Neither serves THORChain or Maya nodes, so those stay public.
 */

export type NodeNetwork = "ethereum" | "base" | "bsc" | "pulsechain" | "solana" | "tron" | "xrp" | "cosmos";
export type NodeEndpoint = { url: string; headers: Record<string, string>; provider: "alchemy" | "nownodes" | "public" };

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
