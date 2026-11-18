/**
 * Every coin and network a member can deposit into (or withdraw from) their
 * HME trading pocket — client-safe, pure, tested.
 *
 * One receive address per pocket key family: TSD rides on the TEXITcoin
 * address, every EVM network shares the EVM address. A network is open for
 * deposits only when the coins can get back out again — HME Wallet can send
 * them, or Seeds can at least swap them back to TSD. Anything else would be a
 * one-way trip, so it stays closed.
 */
import { POCKET_SPECS, type PocketCoin } from "@/lib/pockets/coins";

export type EvmChain = "ethereum" | "base" | "bsc" | "zcu";

export type DepositNetwork = {
  /** Unique across the catalog, used in URLs. */
  id: string;
  label: string;
  pocket: PocketCoin;
  evmChain?: EvmChain;
  /** Shown on the deposit screen, most important first. */
  notes: string[];
};

export type MarketPath = "/trade/tsd-txc" | "/trade/btc-tsd" | "/trade/eth-tsd" | "/trade/tsd-usdc" | "/trade/ltc-tsd" | "/trade/isk-tsd" | "/trade/zcu-tsd";
export type DepositAsset = { symbol: string; name: string; networks: DepositNetwork[]; market?: MarketPath };

const EVM_NOTE = "Same 0x address on every EVM network. Pick the network you are sending on — the coins only show on that network.";
const evm = (chain: EvmChain, label: string, gas: string, extra: string[] = []): DepositNetwork => ({
  id: chain, label, pocket: "EVM", evmChain: chain,
  notes: [...extra, EVM_NOTE, `Keep a little ${gas} at this address to pay network fees when the coins move.`],
});

const HME_CANT = "HME Wallet can't hold this coin. To take it out, swap it back to TSD on Seeds first.";
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
  ...(["DOGE", "BCH", "XRP", "TRX", "SOL", "ZEC"] as const).map((c): DepositAsset => ({
    symbol: c, name: POCKET_SPECS[c].name.replace(" (transparent)", ""),
    networks: [{ id: c.toLowerCase(), label: POCKET_SPECS[c].name, pocket: c, notes: EXTRA_NOTES[c] }],
  })),
];


export function findAsset(symbol: string | undefined): DepositAsset | undefined {
  if (!symbol) return undefined;
  return DEPOSIT_ASSETS.find((a) => a.symbol === symbol.toUpperCase());
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
export type WithdrawRoute = "hme" | "swap" | "none";
export function withdrawRoute(net: DepositNetwork): WithdrawRoute {
  const spec = POCKET_SPECS[net.pocket];
  if (spec.hmeToday) return "hme";
  return spec.signing === "ready" ? "swap" : "none";
}

export type DepositState = { ok: true; address: string } | { ok: false; reason: string };

/** Can the member deposit this coin on this network right now, and where to. */
export function depositState(net: DepositNetwork, linked: boolean, addresses: Record<string, string | undefined>): DepositState {
  if (!linked) return { ok: false, reason: "Link your HME Wallet trading pocket first — deposits go to that pocket." };
  if (withdrawRoute(net) === "none")
    return { ok: false, reason: `Seeds can't send ${POCKET_SPECS[net.pocket].name} out yet, so deposits stay off — anything sent now would be stuck.` };
  const address = addressFor(net, addresses);
  if (!address)
    return { ok: false, reason: `Your linked pocket doesn't include ${POCKET_SPECS[net.pocket].name} yet. Re-link HME Wallet (Security tab) once it can share this coin.` };
  return { ok: true, address };
}
