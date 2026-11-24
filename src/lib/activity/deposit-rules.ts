/**
 * Deposit history rules (pure, tested). Pockets belong to members, so a deposit is
 * simply coins arriving at a pocket address from somewhere else.
 *
 * - Chain history (TXC + its Omni tokens, ISK, Ethereum, Base, BNB Chain): every
 *   incoming transaction, past and new, with its transaction id.
 * - Every other coin: Seeds records a rise in the pocket balance from now on
 *   ("watch"), less what Seeds' own swaps delivered in the same window.
 * A transaction that is a Seeds swap, trade or P2P delivery is labelled, not hidden.
 */

/** Networks whose full history Seeds reads (cheap: own indexer, Esplora, Alchemy). */
export const HISTORY_NETWORKS = ["txc", "isk", "ethereum", "base", "bsc"] as const;
export type HistoryNetwork = (typeof HISTORY_NETWORKS)[number];

export const NETWORK_LABEL: Record<string, string> = {
  txc: "TEXITcoin", "txc-omni": "TEXITcoin · Omni", isk: "Iskandercoin", ethereum: "Ethereum", base: "Base", bsc: "BNB Chain",
  ltc: "Litecoin", btc: "Bitcoin", zcu: "ZeroChill", pulsechain: "PulseChain", hyperevm: "HyperEVM", doge: "Dogecoin", bch: "Bitcoin Cash",
  xrp: "XRP Ledger", trx: "TRON", sol: "Solana",
};

export type FoundDeposit = { txid: string; coin: string; amount: number; blockTime: string | null; from: string | null; tokenAddress?: string | null };

/* ------------------------------ Esplora (TXC / ISK) ------------------------------ */

export type EsploraTx = {
  txid: string;
  vin?: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } | null; is_coinbase?: boolean }>;
  vout?: Array<{ scriptpubkey?: string; scriptpubkey_type?: string; scriptpubkey_address?: string; value: number }>;
  status?: { confirmed?: boolean; block_time?: number };
};

const OMNI_MARKER = "6f6d6e69"; // "omni"

/** The transaction carries an Omni Layer message (an OP_RETURN starting with "omni"). */
export function isOmniCarrier(tx: EsploraTx): boolean {
  return (tx.vout ?? []).some((o) => (o.scriptpubkey_type === "op_return" || (o.scriptpubkey ?? "").startsWith("6a")) && (o.scriptpubkey ?? "").includes(OMNI_MARKER));
}

/** Coins this transaction paid INTO `address` from somewhere else (confirmed only). Sends from the address are not deposits. */
export function esploraDeposit(tx: EsploraTx, address: string, coin: string): FoundDeposit | null {
  if (!tx.status?.confirmed) return null;
  const vin = tx.vin ?? [];
  if (vin.some((i) => i.prevout?.scriptpubkey_address === address)) return null;
  const sats = (tx.vout ?? []).filter((o) => o.scriptpubkey_address === address).reduce((s, o) => s + (Number(o.value) || 0), 0);
  if (!(sats > 0)) return null;
  const from = vin.find((i) => i.prevout?.scriptpubkey_address)?.prevout?.scriptpubkey_address ?? null;
  return { txid: tx.txid, coin, amount: sats / 1e8, blockTime: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : null, from };
}

export type OmniTx = { txid?: string; valid?: boolean; type?: string; type_int?: number; sendingaddress?: string; referenceaddress?: string; propertyid?: number; amount?: string; blocktime?: number; confirmations?: number };

/** A valid Omni "simple send" of a known token to `address` from another address. */
export function omniDeposit(t: OmniTx, address: string, tokens: Record<number, string>): FoundDeposit | null {
  if (!t.valid || !t.txid || t.referenceaddress !== address || !t.sendingaddress || t.sendingaddress === address) return null;
  if (t.type_int !== undefined && t.type_int !== 0) return null;
  const coin = t.propertyid != null ? tokens[t.propertyid] : undefined;
  const amount = Number(t.amount);
  if (!coin || !(amount > 0) || !(Number(t.confirmations ?? 1) > 0)) return null;
  return { txid: t.txid, coin, amount, blockTime: t.blocktime ? new Date(t.blocktime * 1000).toISOString() : null, from: t.sendingaddress };
}

/* ------------------------------ Alchemy (EVM) ------------------------------ */

export type AlchemyTransfer = {
  hash: string;
  from?: string;
  to?: string;
  value?: number | null;
  asset?: string | null;
  category?: string;
  rawContract?: { address?: string | null; value?: string | null; decimal?: string | null };
  metadata?: { blockTimestamp?: string };
};

/**
 * Incoming transfers of the coins Seeds lists on that network only — anyone can airdrop
 * look-alike tokens to an address, and those must never show as a deposit.
 */
export function alchemyDeposits(list: AlchemyTransfer[], address: string, known: { native: string; tokens: Record<string, { symbol: string; decimals: number }> }): FoundDeposit[] {
  const me = address.toLowerCase();
  const out: FoundDeposit[] = [];
  for (const t of list) {
    if ((t.to ?? "").toLowerCase() !== me || (t.from ?? "").toLowerCase() === me) continue;
    let coin: string | null = null, amount = 0, tokenAddress: string | null = null;
    if (t.category === "external" || t.category === "internal") {
      coin = known.native;
      amount = Number(t.value ?? 0);
    } else if (t.category === "erc20") {
      const c = (t.rawContract?.address ?? "").toLowerCase();
      const k = known.tokens[c];
      if (!k) continue;
      coin = k.symbol;
      tokenAddress = c;
      const raw = t.rawContract?.value;
      amount = raw ? Number(BigInt(raw)) / 10 ** k.decimals : Number(t.value ?? 0);
    }
    if (!coin || !(amount > 0) || !Number.isFinite(amount)) continue;
    out.push({ txid: t.hash, coin, amount, blockTime: t.metadata?.blockTimestamp ?? null, from: t.from ?? null, tokenAddress });
  }
  return out;
}

/* ------------------------------ balance watch ------------------------------ */

/**
 * A balance rise that wasn't Seeds' own doing: what went up, less what Seeds swaps
 * delivered in the same window. Null on the first look (no starting point yet), a
 * fall, or anything within 2% of what Seeds delivered.
 */
export function watchedDeposit(prev: number | null, now: number | null, delivered: number): number | null {
  if (prev == null || now == null || !Number.isFinite(prev) || !Number.isFinite(now)) return null;
  const rise = now - prev;
  if (!(rise > 0)) return null;
  const left = rise - Math.max(0, delivered);
  if (left <= Math.max(rise * 0.02, 1e-9)) return null;
  return left;
}

/* ------------------------------ Seeds deliveries ------------------------------ */

export type SeedsTx = Record<string, string>;

/** "Seeds swap" / "Seeds trade" / "P2P trade" / "TSD Bridge" when this transaction is one Seeds made, else null. */
export function seedsLabel(txid: string, known: SeedsTx): string | null {
  return known[txid.toLowerCase()] ?? null;
}

/** How long a member's deposit history waits before Seeds looks again. */
export const SYNC_EVERY_MS = 2 * 60_000;
/** Most history pages read on the first look (25 transactions each on Esplora, 100 on Alchemy). */
export const FIRST_PAGES = 8;
