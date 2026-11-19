/**
 * Pure rules for Seeds' 5-minute market history (market_snapshots_5min,
 * chain_snapshots, network_snapshots).
 *
 * No I/O, no DOM, no network. The job reads THORChain, hands the raw answers to
 * the functions here, and stores exactly what they return. Everything is tested
 * with `bun test`, so a unit slip or a missing field is caught before it reaches
 * the database.
 *
 * Unit rule: THORChain reports coin and RUNE amounts in 1e8 base units, so every
 * amount is divided by 1e8 and stored in whole coins / whole RUNE. Basis-point
 * fields (savers_fill_bps, derived_depth_bps) are stored as reported.
 */

/** The snapshot cadence, in minutes. The schedule must match this. */
export const SNAPSHOT_INTERVAL_MINUTES = 5;

/** Raw THORNode `/thorchain/pools` entry — every field is a string or bool. */
export type RawPool = {
  asset?: string;
  status?: string;
  short_code?: string;
  asset_tor_price?: string;
  balance_asset?: string;
  balance_rune?: string;
  pending_inbound_asset?: string;
  pending_inbound_rune?: string;
  pool_units?: string;
  LP_units?: string;
  synth_units?: string;
  synth_supply?: string;
  synth_supply_remaining?: string;
  savers_depth?: string;
  savers_units?: string;
  savers_fill_bps?: string;
  savers_capacity_remaining?: string;
  derived_depth_bps?: string;
  synth_mint_paused?: boolean;
  trading_halted?: boolean;
  volume_asset?: string;
  volume_rune?: string;
};

/** Raw THORNode `/thorchain/inbound_addresses` entry. */
export type RawInbound = {
  chain?: string;
  halted?: boolean;
  global_trading_paused?: boolean;
  chain_trading_paused?: boolean;
  chain_lp_actions_paused?: boolean;
  gas_rate?: string;
  gas_rate_units?: string;
  observed_fee_rate?: string;
  outbound_fee?: string;
  outbound_tx_size?: string;
  dust_threshold?: string;
  router?: string;
  address?: string;
};

export type RawConstants = {
  int_64_values?: Record<string, number>;
};

export type RawNode = { status?: string; jail?: boolean; maintenance?: boolean; missing_blocks?: number | string };

/** The market figures the live pages already show (fetchThorMarkets output). */
export type LiveMarket = {
  slug: string;
  pool: string;
  base: string;
  name: string;
  price: number | null;
  liquidity: number | null;
  live: boolean;
  day: { volume: number; changePct: number | null };
};

/** One market, one 5-minute bucket, as stored. */
export type MarketSnapshotRow = {
  bucket: string;
  slug: string;
  pool: string;
  base: string;
  name: string;
  short_code: string | null;
  price: number;
  liquidity: number | null;
  volume_24h: number;
  change_pct: number | null;
  live: boolean;
  status: string | null;
  trading_halted: boolean | null;
  synth_mint_paused: boolean | null;
  balance_asset: number | null;
  balance_rune: number | null;
  pending_inbound_asset: number | null;
  pending_inbound_rune: number | null;
  synth_supply: number | null;
  synth_units: number | null;
  synth_supply_remaining: number | null;
  pool_units: number | null;
  lp_units: number | null;
  savers_depth: number | null;
  savers_units: number | null;
  savers_fill_bps: number | null;
  savers_capacity_remaining: number | null;
  derived_depth_bps: number | null;
  volume_asset: number | null;
  volume_rune: number | null;
  asset_tor_price: number | null;
};

export type ChainSnapshotRow = {
  bucket: string;
  chain: string;
  halted: boolean | null;
  global_trading_paused: boolean | null;
  chain_trading_paused: boolean | null;
  chain_lp_actions_paused: boolean | null;
  gas_rate: number | null;
  gas_rate_units: string | null;
  observed_fee_rate: number | null;
  outbound_fee: number | null;
  outbound_tx_size: number | null;
  dust_threshold: number | null;
  router: string | null;
  address: string | null;
};

export type NetworkSnapshotRow = {
  bucket: string;
  scheduled_queue: number | null;
  native_tx_fee: number | null;
  outbound_tx_fee: number | null;
  asgard_size: number | null;
  desired_validator_set: number | null;
  nodes_total: number | null;
  nodes_active: number | null;
  nodes_jailed: number | null;
  nodes_maintenance: number | null;
  nodes_missing_blocks: number | null;
};

const BASE_UNITS = 1e8;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** THORChain base units → whole coins / RUNE. */
const coins = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : n / BASE_UNITS;
};

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

const text = (v: unknown): string | null => (typeof v === "string" && v ? v.slice(0, 120) : null);

/**
 * The 5-minute bucket a reading belongs to, truncated to the boundary and
 * returned as an ISO string, e.g. "2026-11-19T20:45:00.000Z". Two reads inside
 * the same window land on the same bucket, so a re-run updates rather than adds.
 */
export function snapshotBucket(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  const t = d.getTime();
  const step = SNAPSHOT_INTERVAL_MINUTES * 60_000;
  const now = Number.isFinite(t) ? t : Date.now();
  return new Date(Math.floor(now / step) * step).toISOString();
}

/**
 * Live market figures + raw THORNode pools → rows to store.
 *
 * - A market with no usable price is skipped: a blank would poison every chart
 *   and ranking built on the history.
 * - A market seen twice keeps its first reading.
 * - Pool detail is matched by THORChain asset name; a market whose pool is
 *   missing from the raw read is still stored with its price, and the extra
 *   fields left null rather than guessed.
 * - Output is sorted by slug so a re-run writes the same rows in the same order.
 */
export function marketRows(markets: LiveMarket[], pools: RawPool[], bucket: string): MarketSnapshotRow[] {
  const byAsset = new Map<string, RawPool>();
  for (const p of pools ?? []) {
    const a = text(p?.asset);
    if (a && !byAsset.has(a.toUpperCase())) byAsset.set(a.toUpperCase(), p);
  }
  const seen = new Set<string>();
  const out: MarketSnapshotRow[] = [];
  for (const m of markets ?? []) {
    if (!m || !m.slug || seen.has(m.slug)) continue;
    const price = num(m.price);
    if (price == null || price <= 0) continue;
    seen.add(m.slug);
    const p = byAsset.get(String(m.pool).toUpperCase()) ?? {};
    const liq = num(m.liquidity);
    const vol = num(m.day?.volume);
    out.push({
      bucket,
      slug: m.slug,
      pool: m.pool,
      base: m.base,
      name: m.name,
      short_code: text(p.short_code),
      price,
      liquidity: liq != null && liq >= 0 ? liq : null,
      volume_24h: vol != null && vol >= 0 ? vol : 0,
      change_pct: num(m.day?.changePct),
      live: m.live === true,
      status: text(p.status)?.toLowerCase() ?? null,
      trading_halted: bool(p.trading_halted),
      synth_mint_paused: bool(p.synth_mint_paused),
      balance_asset: coins(p.balance_asset),
      balance_rune: coins(p.balance_rune),
      pending_inbound_asset: coins(p.pending_inbound_asset),
      pending_inbound_rune: coins(p.pending_inbound_rune),
      synth_supply: coins(p.synth_supply),
      synth_units: num(p.synth_units),
      synth_supply_remaining: coins(p.synth_supply_remaining),
      pool_units: num(p.pool_units),
      lp_units: num(p.LP_units),
      savers_depth: coins(p.savers_depth),
      savers_units: num(p.savers_units),
      savers_fill_bps: num(p.savers_fill_bps),
      savers_capacity_remaining: coins(p.savers_capacity_remaining),
      derived_depth_bps: num(p.derived_depth_bps),
      volume_asset: coins(p.volume_asset),
      volume_rune: coins(p.volume_rune),
      asset_tor_price: coins(p.asset_tor_price),
    });
  }
  return out.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * THORNode `/thorchain/inbound_addresses` → per-chain rows.
 *
 * A chain with no name is dropped; everything else is stored as read, with
 * amounts converted out of base units.
 */
export function chainRows(inbound: RawInbound[], bucket: string): ChainSnapshotRow[] {
  const seen = new Set<string>();
  const out: ChainSnapshotRow[] = [];
  for (const r of inbound ?? []) {
    const chain = text(r?.chain)?.toUpperCase();
    if (!chain || seen.has(chain)) continue;
    seen.add(chain);
    out.push({
      bucket,
      chain,
      halted: bool(r.halted),
      global_trading_paused: bool(r.global_trading_paused),
      chain_trading_paused: bool(r.chain_trading_paused),
      chain_lp_actions_paused: bool(r.chain_lp_actions_paused),
      gas_rate: num(r.gas_rate),
      gas_rate_units: text(r.gas_rate_units),
      observed_fee_rate: num(r.observed_fee_rate),
      outbound_fee: coins(r.outbound_fee),
      outbound_tx_size: coins(r.outbound_tx_size),
      dust_threshold: coins(r.dust_threshold),
      router: text(r.router),
      address: text(r.address),
    });
  }
  return out.sort((a, b) => (a.chain < b.chain ? -1 : a.chain > b.chain ? 1 : 0));
}

/**
 * Queue length + fee constants + (optional) node list → one network row.
 *
 * Node counts are only filled when the node list was read; otherwise they stay
 * null instead of being reported as zero, which would look like a collapse.
 */
export function networkRow(
  queueLength: number | null,
  constants: RawConstants | null,
  nodes: RawNode[] | null,
  bucket: string,
): NetworkSnapshotRow {
  const ints = constants?.int_64_values ?? {};
  const list = Array.isArray(nodes) ? nodes : null;
  const active = list ? list.filter((n) => String(n?.status).toLowerCase() === "active").length : null;
  const jailed = list ? list.filter((n) => n?.jail === true).length : null;
  const maint = list ? list.filter((n) => n?.maintenance === true).length : null;
  const missing = list
    ? list.reduce((s, n) => {
        const m = num(n?.missing_blocks);
        return s + (m != null && m > 0 ? m : 0);
      }, 0)
    : null;
  return {
    bucket,
    scheduled_queue: queueLength != null && Number.isFinite(queueLength) && queueLength >= 0 ? Math.round(queueLength) : null,
    native_tx_fee: coins(ints.NativeTransactionFee),
    outbound_tx_fee: coins(ints.OutboundTransactionFee),
    asgard_size: num(ints.AsgardSize),
    desired_validator_set: num(ints.DesiredValidatorSet),
    nodes_total: list ? list.length : null,
    nodes_active: active,
    nodes_jailed: jailed,
    nodes_maintenance: maint,
    nodes_missing_blocks: missing,
  };
}

/** 5-minute detail is kept this long; hourly rollups and network rows much longer. */
export const SNAPSHOT_RAW_RETENTION_DAYS = 90;
export const SNAPSHOT_ROLLUP_RETENTION_DAYS = 730;
