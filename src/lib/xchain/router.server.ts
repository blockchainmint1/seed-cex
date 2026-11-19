/**
 * THORChain + Maya Protocol client: live network status, quotes and the
 * independent checks that must pass before any coin could be sent.
 *
 * Seeds never holds the coins: a swap is the member's own wallet sending to the
 * protocol vault with a validated memo. This module only reads public nodes.
 */
import { PROTOCOL_LABEL, SEEDS_AFFILIATE, SWAP_COINS, type Protocol, type SwapCoin } from "./assets";
import {
  fromBaseUnits, independentAnswers, limitOk, memoSafe, MIN_QUOTE_LIFE_SECONDS, toleranceBps, vaultMembership,
} from "./safety";
import { thornodeEndpoints, type NodeEndpoint } from "@/lib/nodes.server";

type ProtocolDef = { prefix: string; servers: () => NodeEndpoint[] };

const publicNodes = (urls: string[]) => (): NodeEndpoint[] => urls.map((url) => ({ url, headers: {}, provider: "public" as const }));

/**
 * Nodes, tried in order. THORChain: thornodeEndpoints() — Liquify's paid plan
 * (LIQUIFY_API_KEY) first, then the public operators TSD Bridge verified, with
 * Liquify's free tier as a last read fallback (same machine, so it never counts
 * twice in the vault check). Maya: the Maya team's own
 * node plus Liquify's (a separate machine — different node id and hosting, checked
 * Nov 19 2026). The vault check counts each distinct node id once, so two
 * addresses for the same machine can never pass it.
 */
export const PROTOCOLS: Record<Protocol, ProtocolDef> = {
  thorchain: {
    prefix: "/thorchain",
    servers: thornodeEndpoints,
  },
  maya: { prefix: "/mayachain", servers: publicNodes(["https://mayanode.mayachain.info", "https://api-maya.liquify.com"]) },
};

const RETRYABLE =
  /invalid height|context did not contain|stale state|unavailable|timeout|fetch|abort|429|rate.?limit|500|502|503|504|unreadable|certificate|tls|ssl|network|connect|socket|reset|refused|resolve|ENOTFOUND/i;

class NodeRefusal extends Error {}

async function nodeGetOne<T>(node: NodeEndpoint, path: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(`${node.url}${path}`, {
    headers: { accept: "application/json", "x-client-id": "seeds-honest-money", ...node.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // A refused key, a used-up allowance or a server fault: try the next server.
  if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) throw new Error(`node error ${res.status}`);
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`unreadable response ${res.status}`);
  }
  const obj = json as { code?: number; message?: string; error?: string };
  const msg = obj && typeof obj === "object" && !Array.isArray(obj) ? (obj.message ?? obj.error ?? null) : null;
  if (!res.ok || (msg && (typeof obj.code === "number" || typeof obj.error === "string"))) {
    const m = msg ?? `node error ${res.status}`;
    if (RETRYABLE.test(m)) throw new Error(m);
    throw new NodeRefusal(m);
  }
  return json as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nodeGet<T>(p: Protocol, path: string): Promise<T> {
  const def = PROTOCOLS[p];
  const nodes = def.servers();
  let last: unknown = null;
  // Single-operator protocols rate-limit bursts: give them one paced retry.
  const attempts = nodes.length === 1 ? [nodes[0]!, nodes[0]!] : nodes;
  for (let i = 0; i < attempts.length; i++) {
    try {
      return await nodeGetOne<T>(attempts[i]!, `${def.prefix}${path}`);
    } catch (e) {
      if (e instanceof NodeRefusal) throw e;
      last = e;
      if (nodes.length === 1 && i === 0) await sleep(1500);
    }
  }
  throw new Error(`${PROTOCOL_LABEL[p]} unreachable: ${last instanceof Error ? last.message : "no node answered"}`);
}

type InboundRow = {
  chain: string; address: string; router?: string; halted: boolean;
  global_trading_paused?: boolean; chain_trading_paused?: boolean;
};
type PoolRow = { asset: string; status: string; balance_asset: string; asset_tor_price?: string; balance_cacao?: string };
type AsgardVault = { status?: string; addresses?: Array<{ chain: string; address: string }>; routers?: Array<{ chain: string; router: string }> };

const paused = (x: InboundRow | undefined) => !x || x.halted || !!x.global_trading_paused || !!x.chain_trading_paused;

/** Servers asked for the vault check: backup copies of an earlier machine are left out. */
function confirmingServers(p: Protocol): NodeEndpoint[] {
  return PROTOCOLS[p].servers().filter((s) => !s.backupOnly);
}

// ---------- status (cached briefly per worker; status is not money-moving) ----------

export type CoinStatus = {
  id: string;
  priceUsd: number | null;
  routes: Record<Protocol, { listed: boolean; live: boolean; depthUsd: number | null; note: string | null }>;
};
export type SwapStatus = {
  generatedAt: string;
  protocols: Record<Protocol, { reachable: boolean; error: string | null; nodes: number }>;
  coins: CoinStatus[];
};

let statusCache: { at: number; value: SwapStatus } | null = null;
const STATUS_TTL_MS = 20_000;
/** Inbound (halt) lists from the last status read, reused for at most 20s by quotes. */
const inboundCache = new Map<Protocol, { at: number; rows: InboundRow[] }>();

async function inboundFor(p: Protocol): Promise<InboundRow[]> {
  const hit = inboundCache.get(p);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.rows;
  const rows = await nodeGet<InboundRow[]>(p, "/inbound_addresses");
  inboundCache.set(p, { at: Date.now(), rows });
  return rows;
}

async function readProtocol(p: Protocol) {
  try {
    const [inbound, pools] = await Promise.all([
      nodeGet<InboundRow[]>(p, "/inbound_addresses"),
      nodeGet<PoolRow[]>(p, "/pools"),
    ]);
    inboundCache.set(p, { at: Date.now(), rows: inbound });
    return { inbound, pools, error: null as string | null };
  } catch (e) {
    return { inbound: [] as InboundRow[], pools: [] as PoolRow[], error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * USD prices: THORChain publishes asset_tor_price per pool. Maya does not, so a
 * Maya-only coin is priced through CACAO: its CACAO price in Maya's pool, times
 * CACAO's dollar price implied by Maya's BTC pool and THORChain's BTC price.
 * Display only — prices never decide what is sent.
 */
function priceMap(thorPools: PoolRow[], mayaPools: PoolRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const pool of thorPools) {
    const px = pool.asset_tor_price ? Number(pool.asset_tor_price) / 1e8 : NaN;
    if (Number.isFinite(px) && px > 0) m.set(pool.asset, px);
  }
  const cacaoPer = (pool: PoolRow | undefined) => {
    const a = Number(pool?.balance_asset), c = Number(pool?.balance_cacao);
    return a > 0 && c > 0 ? c / a : NaN;
  };
  const btcUsd = m.get("BTC.BTC");
  const perBtc = cacaoPer(mayaPools.find((x) => x.asset === "BTC.BTC" && x.status === "Available"));
  if (btcUsd && Number.isFinite(perBtc)) {
    for (const pool of mayaPools) {
      if (m.has(pool.asset) || pool.status !== "Available") continue;
      const per = cacaoPer(pool);
      if (Number.isFinite(per)) m.set(pool.asset, (btcUsd * per) / perBtc);
    }
  }
  return m;
}

export async function swapStatus(): Promise<SwapStatus> {
  if (statusCache && Date.now() - statusCache.at < STATUS_TTL_MS) return statusCache.value;
  const [thor, maya] = await Promise.all([readProtocol("thorchain"), readProtocol("maya")]);
  const prices = priceMap(thor.pools, maya.pools);
  const reads: Record<Protocol, typeof thor> = { thorchain: thor, maya };
  const coins: CoinStatus[] = SWAP_COINS.map((c) => {
    const priceUsd = prices.get(c.asset) ?? null;
    const routes = {} as CoinStatus["routes"];
    for (const p of ["thorchain", "maya"] as Protocol[]) {
      const r = reads[p];
      const pool = r.pools.find((x) => x.asset === c.asset);
      const inb = r.inbound.find((x) => x.chain === c.chain);
      const listed = c.protocols.includes(p) && !!pool;
      const live = listed && pool!.status === "Available" && !paused(inb);
      const depthUsd = pool && priceUsd ? fromBaseUnits(pool.balance_asset) * priceUsd : null;
      const note = !c.protocols.includes(p)
        ? "Not offered"
        : r.error
          ? "Unreachable"
          : !pool
            ? "No pool"
            : pool.status !== "Available"
              ? `Pool ${pool.status.toLowerCase()}`
              : paused(inb)
                ? "Trading paused"
                : null;
      routes[p] = { listed, live, depthUsd, note };
    }
    return { id: c.id, priceUsd, routes };
  });
  const value: SwapStatus = {
    generatedAt: new Date().toISOString(),
    protocols: {
      thorchain: { reachable: !thor.error, error: thor.error, nodes: confirmingServers("thorchain").length },
      maya: { reachable: !maya.error, error: maya.error, nodes: confirmingServers("maya").length },
    },
    coins,
  };
  if (!thor.error) statusCache = { at: Date.now(), value };
  return value;
}

// ---------- quotes ----------

type RawQuote = {
  inbound_address?: string; router?: string; memo?: string; expected_amount_out: string; expiry: number;
  recommended_min_amount_in?: string; dust_threshold?: string; max_streaming_quantity?: number;
  total_swap_seconds?: number; warning?: string; notes?: string;
  fees?: { asset?: string; affiliate?: string; outbound?: string; liquidity?: string; total?: string; slippage_bps?: number; total_bps?: number };
};

export type RouteCheck = { label: string; pass: boolean; detail: string };

export type RouteQuote = {
  protocol: Protocol;
  label: string;
  ok: boolean;
  error: string | null;
  expectedOut: number;
  expectedOutUsd: number | null;
  minOut: number | null;
  fees: { liquidity: number; outbound: number; affiliate: number; totalUsd: number | null; totalBps: number | null; slippageBps: number | null };
  toleranceBps: number | null;
  seconds: number | null;
  minIn: number | null;
  expiresAt: string | null;
  memo: string | null;
  checks: RouteCheck[];
  /** Every pre-send check passed. Sending itself is still disabled in Seeds. */
  sendReady: boolean;
  blockedReason: string | null;
};

function quotePath(from: SwapCoin, to: SwapCoin, amount: bigint, destination: string | null, tolBps: number | null, p: Protocol) {
  const q = new URLSearchParams({
    from_asset: from.asset,
    to_asset: to.asset,
    amount: amount.toString(),
    streaming_interval: "1",
    streaming_quantity: "0",
  });
  if (destination) q.set("destination", destination);
  if (tolBps != null) q.set("liquidity_tolerance_bps", String(tolBps));
  const aff = SEEDS_AFFILIATE[p];
  if (aff) {
    q.set("affiliate", aff.name);
    q.set("affiliate_bps", String(aff.bps));
  }
  return `/quote/swap?${q.toString()}`;
}

/** Which machine answers at `node` (its p2p node id), cached 10 minutes; null when it won't say. */
const nodeIdCache = new Map<string, { at: number; id: string }>();
async function nodeIdOf(node: NodeEndpoint): Promise<string | null> {
  const hit = nodeIdCache.get(node.url);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
  try {
    const j = await nodeGetOne<{ default_node_info?: { default_node_id?: string } }>(node, "/cosmos/base/tendermint/v1beta1/node_info", 8_000);
    const id = j.default_node_info?.default_node_id;
    if (!id || !/^[0-9a-f]{40}$/i.test(id)) return null;
    nodeIdCache.set(node.url, { at: Date.now(), id });
    return id;
  } catch {
    return null;
  }
}

/**
 * ACTIVE vault addresses (and routers) for a chain, one answer per distinct node.
 * Silent servers and servers that can't be identified are left out.
 */
async function vaultAnswers(p: Protocol, chain: string) {
  const def = PROTOCOLS[p];
  const ask = async (node: NodeEndpoint) => {
    try {
      const [list, nodeId] = await Promise.all([nodeGetOne<AsgardVault[]>(node, `${def.prefix}/vaults/asgard`, 12_000), nodeIdOf(node)]);
      if (!Array.isArray(list)) return null;
      const active = list.filter((v) => v.status === "ActiveVault");
      return {
        nodeId,
        value: {
          vaults: active.flatMap((v) => (v.addresses ?? []).filter((a) => a.chain === chain).map((a) => a.address)),
          routers: active.flatMap((v) => (v.routers ?? []).filter((r) => r.chain === chain).map((r) => r.router)),
        },
      };
    } catch {
      return null;
    }
  };
  return independentAnswers(await Promise.all(confirmingServers(p).map(ask)));
}

/** Server-only details needed to sign; never returned to the browser. */
export type SendPlan = { vault: string; router: string | null; expiry: number; memo: string };

async function quoteOne(
  p: Protocol, from: SwapCoin, to: SwapCoin, amount: bigint, destination: string | null, prices: Map<string, number>,
  capture?: { plan: SendPlan | null },
): Promise<RouteQuote> {
  const label = PROTOCOL_LABEL[p];
  const empty: RouteQuote = {
    protocol: p, label, ok: false, error: null, expectedOut: 0, expectedOutUsd: null, minOut: null,
    fees: { liquidity: 0, outbound: 0, affiliate: 0, totalUsd: null, totalBps: null, slippageBps: null },
    toleranceBps: null, seconds: null, minIn: null, expiresAt: null, memo: null, checks: [], sendReady: false, blockedReason: null,
  };
  if (!from.protocols.includes(p) || !to.protocols.includes(p)) {
    return { ...empty, error: `${label} does not offer ${!from.protocols.includes(p) ? from.symbol : to.symbol}.` };
  }
  try {
    const inbound = await inboundFor(p);
    const src = inbound.find((x) => x.chain === from.chain);
    const dst = inbound.find((x) => x.chain === to.chain);
    if (paused(src) || paused(dst)) {
      return { ...empty, error: `${label} has paused ${paused(src) ? from.network : to.network} trading right now.` };
    }

    // 1) Price preview, used to size the price protection for this trade.
    const preview = await nodeGet<RawQuote>(p, quotePath(from, to, amount, null, null, p));
    const tol = toleranceBps(preview.fees?.slippage_bps);
    // 2) Final quote with price protection (and the destination, when given).
    const q = destination ? await nodeGet<RawQuote>(p, quotePath(from, to, amount, destination, tol, p)) : preview;

    const outPx = prices.get(to.asset) ?? null;
    const feeAsset = q.fees?.asset ?? to.asset;
    const feePx = prices.get(feeAsset) ?? null;
    const liq = fromBaseUnits(q.fees?.liquidity);
    const outb = fromBaseUnits(q.fees?.outbound);
    const affl = fromBaseUnits(q.fees?.affiliate);
    const expectedOut = fromBaseUnits(q.expected_amount_out);
    const minIn = q.recommended_min_amount_in ? fromBaseUnits(q.recommended_min_amount_in) : null;
    const nowS = Math.floor(Date.now() / 1000);

    const checks: RouteCheck[] = [];
    checks.push({ label: "Both networks open for trading", pass: true, detail: `${from.network} and ${to.network} not paused` });
    const bigEnough = minIn == null || Number(amount) / 1e8 >= minIn;
    checks.push({
      label: "Amount above the network minimum",
      pass: bigEnough,
      detail: minIn == null ? "No minimum published" : `Minimum ≈ ${minIn} ${from.symbol}`,
    });
    const lifeLeft = Number(q.expiry) - nowS;
    checks.push({ label: "Quote still fresh", pass: lifeLeft >= MIN_QUOTE_LIFE_SECONDS, detail: `${Math.max(0, Math.round(lifeLeft / 60))} min left` });

    let memo: string | null = null;
    let minOut: number | null = null;
    if (destination) {
      memo = q.memo ?? null;
      const ms = memo
        ? memoSafe(memo, { protocol: p, from, to, destination, maxStreaming: Number(q.max_streaming_quantity ?? 1) || 1, affiliate: SEEDS_AFFILIATE[p] })
        : { ok: false, reason: "quote returned no memo" };
      checks.push({ label: "Swap instruction pays exactly your address and coin", pass: ms.ok, detail: ms.reason ?? "Memo validated" });
      const lim = memo ? limitOk(memo, Number(q.expected_amount_out), tol) : false;
      checks.push({
        label: "Price protection set",
        pass: lim,
        detail: lim ? `Refund instead of filling more than ${(tol / 100).toFixed(1)}% under this quote` : "Memo price limit missing or too loose",
      });
      const limitRaw = memo ? Number(memo.split(":")[3]?.split("/")[0]) : NaN;
      minOut = Number.isFinite(limitRaw) ? limitRaw / 1e8 : null;

      const answers = await vaultAnswers(p, from.chain);
      const vm = vaultMembership(q.inbound_address ?? "", answers.map((a) => a.vaults));
      checks.push({
        label: "Vault confirmed by 2 independent servers",
        pass: !vm.error,
        detail: vm.error ?? `Listed active by ${vm.confirms} of ${confirmingServers(p).length} servers`,
      });
      if (from.evm) {
        const want = (q.router ?? "").toLowerCase();
        const routerConfirms = answers.filter((a) => a.routers.some((r) => r.toLowerCase() === want)).length;
        checks.push({
          label: "Router contract confirmed",
          pass: !!want && routerConfirms >= 2,
          detail: want ? `Router listed by ${routerConfirms} server${routerConfirms === 1 ? "" : "s"}` : "Quote named no router",
        });
      }
    } else {
      checks.push({ label: "Destination address", pass: false, detail: "Add a receiving address to run the send checks" });
    }

    const failed = checks.find((c) => !c.pass);
    if (capture && !failed && memo && q.inbound_address) {
      capture.plan = { vault: q.inbound_address, router: q.router ?? null, expiry: Number(q.expiry), memo };
    }
    return {
      ...empty,
      ok: expectedOut > 0 && bigEnough,
      error: bigEnough ? null : `Below ${label}'s minimum of about ${minIn} ${from.symbol}.`,
      expectedOut,
      expectedOutUsd: outPx ? expectedOut * outPx : null,
      minOut,
      fees: {
        liquidity: liq,
        outbound: outb,
        affiliate: affl,
        totalUsd: feePx ? (liq + outb + affl) * feePx : null,
        totalBps: q.fees?.total_bps ?? null,
        slippageBps: q.fees?.slippage_bps ?? null,
      },
      toleranceBps: tol,
      seconds: q.total_swap_seconds ?? null,
      minIn,
      expiresAt: new Date(Number(q.expiry) * 1000).toISOString(),
      memo,
      checks,
      sendReady: !failed,
      blockedReason: failed ? failed.detail : null,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...empty, error: friendlyError(label, msg) };
  }
}

function friendlyError(label: string, msg: string): string {
  if (/memo too long/i.test(msg)) return `${label} can't fit this swap's instruction on the sending network. Try sending a different coin.`;
  if (/not enough asset to pay for fees|less than|amount.*too small|dust/i.test(msg)) return `Amount too small for ${label} to cover network fees.`;
  if (/destination|address/i.test(msg)) return `${label} rejected the receiving address.`;
  if (/trading.*halt|halted|paused/i.test(msg)) return `${label} has paused this route.`;
  if (/unreachable/i.test(msg)) return msg;
  return `${label}: ${msg.slice(0, 160)}`;
}

export async function swapQuotes(from: SwapCoin, to: SwapCoin, amount: bigint, destination: string | null) {
  const status = await swapStatus();
  const prices = new Map<string, number>();
  for (const c of status.coins) {
    const coin = SWAP_COINS.find((x) => x.id === c.id);
    if (coin && c.priceUsd) prices.set(coin.asset, c.priceUsd);
  }
  const routes = await Promise.all((["thorchain", "maya"] as Protocol[]).map((p) => quoteOne(p, from, to, amount, destination, prices)));
  const inPx = prices.get(from.asset) ?? null;
  return { routes, inputUsd: inPx ? (Number(amount) / 1e8) * inPx : null, quotedAt: new Date().toISOString() };
}

async function livePrices(): Promise<Map<string, number>> {
  const status = await swapStatus();
  const prices = new Map<string, number>();
  for (const c of status.coins) {
    const coin = SWAP_COINS.find((x) => x.id === c.id);
    if (coin && c.priceUsd) prices.set(coin.asset, c.priceUsd);
  }
  return prices;
}

/**
 * Fresh quote for signing: the route plus the vault/router/expiry the send must
 * use. plan is null unless every pre-send check passed.
 */
export async function quoteForSend(p: Protocol, from: SwapCoin, to: SwapCoin, amount: bigint, destination: string) {
  const prices = await livePrices();
  const capture: { plan: SendPlan | null } = { plan: null };
  const route = await quoteOne(p, from, to, amount, destination, prices, capture);
  const inPx = prices.get(from.asset) ?? null;
  return { route, plan: route.sendReady ? capture.plan : null, inputUsd: inPx ? (Number(amount) / 1e8) * inPx : null };
}

/** THORNode's view of an inbound swap transaction; null if not seen yet. */
export async function protocolTxStatus(p: Protocol, txid: string): Promise<unknown | null> {
  try {
    return await nodeGet<unknown>(p, `/tx/status/${encodeURIComponent(txid)}`);
  } catch {
    return null;
  }
}

/** One protocol's quote (no vault returned): used to price TSD routes. */
export async function protocolQuote(p: Protocol, from: SwapCoin, to: SwapCoin, amount: bigint, destination: string | null) {
  const prices = await livePrices();
  const route = await quoteOne(p, from, to, amount, destination, prices);
  const inPx = prices.get(from.asset) ?? null;
  return { route, inputUsd: inPx ? (Number(amount) / 1e8) * inPx : null };
}

export const thorQuote = (from: SwapCoin, to: SwapCoin, amount: bigint, destination: string | null) => protocolQuote("thorchain", from, to, amount, destination);
