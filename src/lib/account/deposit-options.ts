/**
 * Every coin and network a member can deposit into (or withdraw from) their
 * HME trading pocket — client-safe, pure, tested.
 *
 * One receive address per pocket key family: TSD rides on the TEXITcoin
 * address, every EVM network shares the EVM address. A network is open for
 * deposits only when the coins can get back out again — HME Wallet can send
 * them, Seeds can swap them back to TSD, or (PulseChain only) Seeds sends them
 * out for the member after a hold. Anything else would be a one-way trip, so it
 * stays closed.
 */
import { POCKET_SPECS, type PocketCoin } from "@/lib/pockets/coins";

export type EvmChain = "ethereum" | "base" | "bsc" | "zcu" | "pulsechain" | "hyperevm";

export type DepositNetwork = {
  /** Unique across the catalog, used in URLs. */
  id: string;
  label: string;
  pocket: PocketCoin;
  evmChain?: EvmChain;
  /** Shown on the deposit screen, most important first. */
  notes: string[];
  /**
   * HME Wallet holds the key but can't send on this network (PulseChain), so
   * Seeds signs withdrawals for the member — to an address they pick, after a hold.
   */
  seedsSends?: boolean;
};

export type MarketPath = "/trade/tsd-txc" | "/trade/btc-tsd" | "/trade/eth-tsd" | "/trade/tsd-usdc" | "/trade/ltc-tsd" | "/trade/isk-tsd" | "/trade/zcu-tsd" | "/trade/pls-tsd" | "/trade/hex-tsd" | "/trade/phex-tsd" | "/trade/hype-tsd";
export type DepositAsset = { symbol: string; name: string; networks: DepositNetwork[]; market?: MarketPath };

const EVM_NOTE = "Same 0x address on every EVM network. Pick the network you are sending on — the coins only show on that network.";
const evm = (chain: EvmChain, label: string, gas: string, extra: string[] = []): DepositNetwork => ({
  id: chain, label, pocket: "EVM", evmChain: chain,
  notes: [...extra, EVM_NOTE, `Keep a little ${gas} at this address to pay network fees when the coins move.`],
});

const PULSE_NOTES = (coin: string) => [
  "HME Wallet can't send on PulseChain yet. Seeds sends it out for you instead: to an address you choose, after a hold of at least 24 hours that you can cancel.",
  `Send ${coin} on PulseChain only — not on Ethereum. The same 0x address exists on both, but they are different coins.`,
  "Keep a little PLS at this address to pay PulseChain network fees.",
];
const pulse = (coin: string): DepositNetwork => ({ id: "pulsechain", label: "PulseChain", pocket: "EVM", evmChain: "pulsechain", notes: PULSE_NOTES(coin), seedsSends: true });

const HYPE_NOTES = [
  "HME Wallet can't send on HyperEVM yet. Seeds sends it out for you instead: to an address you choose, after a hold you can cancel.",
  "Send HYPE on HyperEVM (network 999) only. Not from HyperCore, Solana or any other network — Solana \"HYPE\" tokens are copycats.",
  "Moving HYPE off Hyperliquid's exchange (HyperCore)? Transfer it to HyperEVM there first, then send it here.",
  "Keep a little HYPE at this address to pay HyperEVM network fees (each send costs well under a cent).",
];
const hyperevm: DepositNetwork = { id: "hyperevm", label: "HyperEVM", pocket: "EVM", evmChain: "hyperevm", notes: HYPE_NOTES, seedsSends: true };

const HME_CANT = "HME Wallet can't hold this coin. To take it out, withdraw it through Seeds or swap it back to TSD.";
const EXTRA_NOTES: Record<"DOGE" | "BCH" | "XRP" | "TRX" | "SOL" | "ZEC", string[]> = {
  DOGE: [HME_CANT, "Send DOGE on the Dogecoin network only."],
  BCH: [HME_CANT, "Send Bitcoin Cash only — not Bitcoin or Bitcoin SV."],
  XRP: [HME_CANT, "No destination tag needed: this address is yours alone.", "The XRP Ledger only activates a new address once it receives its minimum reserve, and that reserve can't be moved out."],
  TRX: [HME_CANT, "Send TRX on the TRON network only."],
  SOL: [HME_CANT, "Send SOL on the Solana network only. A tiny amount always stays behind to keep the address open."],
  ZEC: ["Transparent t1 addresses only — shielded Zcash is not supported."],
};

export const DEPOSIT_ASSETS: DepositAsset[] = [
  { symbol: "TSD", name: "Texas Stable Dollar", market: "/trade/tsd-txc", networks: [{
    id: "txc-omni", label: "TEXITcoin · Omni #39", pocket: "TXC",
    notes: ["Send TSD (Omni property #39) only. It arrives at your TEXITcoin address.", "Also keep a little TXC at this address — moving TSD costs a small TXC fee."],
  }] },
  { symbol: "TXC", name: "TEXITcoin", market: "/trade/tsd-txc", networks: [{ id: "txc", label: "TEXITcoin", pocket: "TXC", notes: ["Send TXC on the TEXITcoin network only."] }] },
  { symbol: "BTC", name: "Bitcoin", market: "/trade/btc-tsd", networks: [{ id: "btc", label: "Bitcoin", pocket: "BTC", notes: ["Send native Bitcoin only — not Lightning, not wrapped BTC on another network."] }] },
  { symbol: "ETH", name: "Ether", market: "/trade/eth-tsd", networks: [evm("ethereum", "Ethereum", "ETH"), evm("base", "Base", "ETH")] },
  { symbol: "USDC", name: "USD Coin", market: "/trade/tsd-usdc", networks: [evm("ethereum", "Ethereum", "ETH"), evm("base", "Base", "ETH"), evm("bsc", "BNB Chain", "BNB")] },
  { symbol: "USDT", name: "Tether", networks: [evm("ethereum", "Ethereum", "ETH"), evm("base", "Base", "ETH"), evm("bsc", "BNB Chain", "BNB")] },
  { symbol: "LTC", name: "Litecoin", market: "/trade/ltc-tsd", networks: [{ id: "ltc", label: "Litecoin", pocket: "LTC", notes: ["Send LTC on the Litecoin network only."] }] },
  { symbol: "ISK", name: "Iskandercoin", market: "/trade/isk-tsd", networks: [{ id: "isk", label: "Iskandercoin", pocket: "ISK", notes: ["Send ISK on the Iskandercoin network only."] }] },
  { symbol: "BNB", name: "BNB", networks: [evm("bsc", "BNB Chain", "BNB")] },
  { symbol: "ZCU", name: "ZeroChill", market: "/trade/zcu-tsd", networks: [evm("zcu", "ZeroChill", "ZCU")] },
  { symbol: "PLS", name: "PulseChain", market: "/trade/pls-tsd", networks: [pulse("PLS")] },
  { symbol: "HEX", name: "HEX on Ethereum", market: "/trade/hex-tsd", networks: [evm("ethereum", "Ethereum", "ETH", [
    "This is HEX on Ethereum. HEX on PulseChain is a different coin — deposit it as pHEX.",
    "To see or send it in HME Wallet, add HEX as a custom token: 0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39.",
  ])] },
  { symbol: "pHEX", name: "HEX on PulseChain", market: "/trade/phex-tsd", networks: [pulse("pHEX")] },
  { symbol: "HYPE", name: "Hyperliquid", market: "/trade/hype-tsd", networks: [hyperevm] },
  ...(["DOGE", "BCH", "XRP", "TRX", "SOL", "ZEC"] as const).map((c): DepositAsset => ({
    symbol: c, name: POCKET_SPECS[c].name.replace(" (transparent)", ""),
    networks: [{ id: c.toLowerCase(), label: POCKET_SPECS[c].name, pocket: c, notes: EXTRA_NOTES[c] }],
  })),
];


export function findAsset(symbol: string | undefined): DepositAsset | undefined {
  if (!symbol) return undefined;
  const want = symbol.toUpperCase();
  return DEPOSIT_ASSETS.find((a) => a.symbol.toUpperCase() === want);
}

export function findNetwork(asset: DepositAsset | undefined, id: string | undefined): DepositNetwork | undefined {
  if (!asset) return undefined;
  return asset.networks.find((n) => n.id === id) ?? (asset.networks.length === 1 ? asset.networks[0] : undefined);
}

/** The pocket key family's address map key in the HME link (EVM = "EVM"). */
export function addressFor(net: DepositNetwork, addresses: Record<string, string | undefined>): string | null {
  return addresses[net.pocket] ?? null;
}

/** How a coin on this network leaves the pocket. */
export type WithdrawRoute = "hme" | "swap" | "seeds" | "none";
export function withdrawRoute(net: DepositNetwork): WithdrawRoute {
  if (net.seedsSends) return "seeds";
  const spec = POCKET_SPECS[net.pocket];
  if (spec.hmeToday) return "hme";
  return spec.signing === "ready" ? "swap" : "none";
}

export type DepositState = { ok: true; address: string } | { ok: false; reason: string };

/**
 * Can the member deposit this coin on this network right now, and where to.
 * `seedsSendBlocker`: for networks Seeds sends out (PulseChain), why Seeds can't
 * send for this member right now (null = it can). Unknown counts as closed.
 */
export function depositState(
  net: DepositNetwork, linked: boolean, addresses: Record<string, string | undefined>, seedsSendBlocker?: string | null,
): DepositState {
  if (!linked) return { ok: false, reason: "Link your HME Wallet trading pocket first — deposits go to that pocket." };
  if (withdrawRoute(net) === "seeds" && seedsSendBlocker !== null)
    return { ok: false, reason: `Deposits on ${net.label} stay off for you until Seeds can send them back out: ${seedsSendBlocker ?? "checking…"}` };
  if (withdrawRoute(net) === "none")
    return { ok: false, reason: `Seeds can't send ${POCKET_SPECS[net.pocket].name} out yet, so deposits stay off — anything sent now would be stuck.` };
  const address = addressFor(net, addresses);
  if (!address)
    return { ok: false, reason: `Your linked pocket doesn't include ${POCKET_SPECS[net.pocket].name} yet. Use "Add new coins" on Account → Security once HME Wallet can share it.` };
  return { ok: true, address };
}
