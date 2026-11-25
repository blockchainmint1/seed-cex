/**
 * Every coin and network Seeds can send out of a member's trading pocket (pure, client-safe, tested).
 *
 * Keys match the deposit screen's coin + network ids (src/lib/account/deposit-options.ts), so the
 * withdraw screen can look one up from what the member picked. A coin is listed only when Seeds has
 * a tested signer for it; Zcash is missing because its signer isn't built yet.
 */
import type { ChainId } from "@/lib/chains";
import type { PocketCoin } from "@/lib/pockets/coins";

export type WithdrawKind = "evm" | "utxo" | "omni" | "btc" | "doge" | "bch" | "xrp" | "trx" | "sol" | "xmr" | "ada" | "xlm" | "ton" | "sui" | "ton_usdt";

export type WithdrawCoin = {
  /** "<symbol>:<network id>", e.g. "USDC:base". */
  key: string;
  symbol: string;
  /** Network id from deposit-options (also stored as pocket_withdrawals.chain). */
  network: string;
  networkLabel: string;
  pocket: PocketCoin;
  kind: WithdrawKind;
  /** Base-unit decimals the amount is typed and stored in. */
  decimals: number;
  /** EVM network the send goes out on. */
  evmChain?: ChainId;
  /** UTXO chains signed by the TEXITcoin-family builder. */
  utxoChain?: "txc" | "isk" | "ltc";
  /** Swap-asset id used to check the destination address format (non-EVM coins). */
  addressAsset?: string;
  /** Coin that pays the network fee, when it isn't the coin itself. */
  feeCoin?: string;
  /** Plain note shown under the amount (what stays behind and why). */
  keepNote?: string;
  explorerTx: string;
  addressHint: string;
};

const EVM_HINT = "0x…";
const evm = (symbol: string, network: string, networkLabel: string, chain: ChainId, decimals: number, feeCoin: string | undefined, explorerTx: string): WithdrawCoin => ({
  key: `${symbol}:${network}`, symbol, network, networkLabel, pocket: "EVM", kind: "evm", decimals, evmChain: chain,
  feeCoin, explorerTx, addressHint: EVM_HINT,
  keepNote: feeCoin ? `Keep a little ${feeCoin} on ${networkLabel} in your pocket for the network fee.` : `A little ${symbol} stays behind for the ${networkLabel} network fee.`,
});

const ETHERSCAN = "https://etherscan.io/tx/";
const BASESCAN = "https://basescan.org/tx/";
const BSCSCAN = "https://bscscan.com/tx/";
const PULSESCAN = "https://scan.pulsechain.com/tx/";
const TXC_TX = "https://mempool.texitcoin.org/tx/";

export const WITHDRAW_COINS: WithdrawCoin[] = [
  { key: "TSD:txc-omni", symbol: "TSD", network: "txc-omni", networkLabel: "TEXITcoin · Omni #39", pocket: "TXC", kind: "omni", decimals: 8, feeCoin: "TXC",
    keepNote: "Keep about 0.001 TXC at your TEXITcoin address: moving TSD costs a small TXC fee.", explorerTx: TXC_TX, addressHint: "T…" },
  { key: "TXC:txc", symbol: "TXC", network: "txc", networkLabel: "TEXITcoin", pocket: "TXC", kind: "utxo", utxoChain: "txc", decimals: 8,
    keepNote: "A tiny bit of TXC stays behind for the network fee.", explorerTx: TXC_TX, addressHint: "T…" },
  { key: "ISK:isk", symbol: "ISK", network: "isk", networkLabel: "Iskandercoin", pocket: "ISK", kind: "utxo", utxoChain: "isk", decimals: 8,
    keepNote: "A tiny bit of ISK stays behind for the network fee.", explorerTx: "https://explorer.iskandercoin.com/tx/", addressHint: "I…" },
  { key: "LTC:ltc", symbol: "LTC", network: "ltc", networkLabel: "Litecoin", pocket: "LTC", kind: "utxo", utxoChain: "ltc", decimals: 8, addressAsset: "LTC.LTC",
    keepNote: "A tiny bit of LTC stays behind for the network fee.", explorerTx: "https://blockchair.com/litecoin/transaction/", addressHint: "ltc1… or L… / M…" },
  { key: "BTC:btc", symbol: "BTC", network: "btc", networkLabel: "Bitcoin", pocket: "BTC", kind: "btc", decimals: 8, addressAsset: "BTC.BTC",
    keepNote: "A little BTC stays behind for the Bitcoin network fee.", explorerTx: "https://mempool.space/tx/", addressHint: "bc1… or 1… / 3…" },
  evm("ETH", "ethereum", "Ethereum", "ethereum", 18, undefined, ETHERSCAN),
  evm("ETH", "base", "Base", "base", 18, undefined, BASESCAN),
  evm("USDC", "ethereum", "Ethereum", "ethereum", 6, "ETH", ETHERSCAN),
  evm("USDC", "base", "Base", "base", 6, "ETH", BASESCAN),
  evm("USDC", "bsc", "BNB Chain", "bsc", 18, "BNB", BSCSCAN),
  evm("USDT", "ethereum", "Ethereum", "ethereum", 6, "ETH", ETHERSCAN),
  evm("USDT", "base", "Base", "base", 6, "ETH", BASESCAN),
  evm("USDT", "bsc", "BNB Chain", "bsc", 18, "BNB", BSCSCAN),
  evm("BNB", "bsc", "BNB Chain", "bsc", 18, undefined, BSCSCAN),
  evm("ZCU", "zcu", "ZeroChill", "zcu", 18, undefined, "https://explorer.zerochill.com/tx/"),
  evm("HEX", "ethereum", "Ethereum", "ethereum", 8, "ETH", ETHERSCAN),
  evm("PLS", "pulsechain", "PulseChain", "pulsechain", 18, undefined, PULSESCAN),
  evm("pHEX", "pulsechain", "PulseChain", "pulsechain", 8, "PLS", PULSESCAN),
  evm("HYPE", "hyperevm", "HyperEVM", "hyperevm", 18, undefined, "https://hyperevmscan.io/tx/"),
  evm("AVAX", "avalanche", "Avalanche C-Chain", "avalanche", 18, undefined, "https://snowtrace.io/tx/"),
  { key: "DOGE:doge", symbol: "DOGE", network: "doge", networkLabel: "Dogecoin", pocket: "DOGE", kind: "doge", decimals: 8, addressAsset: "DOGE.DOGE",
    keepNote: "A little DOGE stays behind for the network fee.", explorerTx: "https://blockchair.com/dogecoin/transaction/", addressHint: "D…" },
  { key: "BCH:bch", symbol: "BCH", network: "bch", networkLabel: "Bitcoin Cash", pocket: "BCH", kind: "bch", decimals: 8, addressAsset: "BCH.BCH",
    keepNote: "A little BCH stays behind for the network fee.", explorerTx: "https://blockchair.com/bitcoin-cash/transaction/", addressHint: "bitcoincash:q… or q…" },
  { key: "XRP:xrp", symbol: "XRP", network: "xrp", networkLabel: "XRP Ledger", pocket: "XRP", kind: "xrp", decimals: 6, addressAsset: "XRP.XRP",
    keepNote: "The XRP Ledger keeps a reserve (about 1 XRP) locked at every address; it can't be withdrawn.", explorerTx: "https://livenet.xrpl.org/transactions/", addressHint: "r…" },
  { key: "TRX:trx", symbol: "TRX", network: "trx", networkLabel: "TRON", pocket: "TRX", kind: "trx", decimals: 6, addressAsset: "TRON.TRX",
    keepNote: "Keep about 1 TRX behind for TRON's network fee.", explorerTx: "https://tronscan.org/#/transaction/", addressHint: "T…" },
  { key: "SOL:sol", symbol: "SOL", network: "sol", networkLabel: "Solana", pocket: "SOL", kind: "sol", decimals: 9, addressAsset: "SOL.SOL",
    keepNote: "About 0.002 SOL stays behind for fees and Solana's account minimum.", explorerTx: "https://solscan.io/tx/", addressHint: "Solana address" },
  { key: "ADA:ada", symbol: "ADA", network: "ada", networkLabel: "Cardano", pocket: "ADA", kind: "ada", decimals: 6, addressAsset: "ADA.ADA",
    keepNote: "Cardano charges about 0.17 ADA per send, and any ADA left behind must be at least about 1 ADA (or send everything). Coins holding other Cardano tokens are never touched.", explorerTx: "https://cardanoscan.io/transaction/", addressHint: "addr1…" },
  { key: "XMR:xmr", symbol: "XMR", network: "xmr", networkLabel: "Monero", pocket: "XMR", kind: "xmr", decimals: 12,
    keepNote: "A small Monero network fee (usually under 0.0001 XMR) comes out of your pocket on top. Coins you just received can be sent after about 20 minutes.", explorerTx: "https://xmrchain.net/tx/", addressHint: "4… or 8…" },
  { key: "XLM:xlm", symbol: "XLM", network: "xlm", networkLabel: "Stellar", pocket: "XLM", kind: "xlm", decimals: 7,
    keepNote: "Stellar's account reserve and selling liabilities stay behind, plus the network fee. Send only to a personal G-address that needs no memo; exchange deposits requiring a memo aren't supported.", explorerTx: "https://stellar.expert/explorer/public/tx/", addressHint: "G… (no memo required)" },
  { key: "TON:ton", symbol: "TON", network: "ton", networkLabel: "TON", pocket: "TON", kind: "ton", decimals: 9,
    keepNote: "Keep TON for network fees and wallet storage. Native TON only; no jettons. Send only to an address that needs no comment or memo.", explorerTx: "https://tonviewer.com/", addressHint: "UQ… or EQ… (mainnet, no memo)" },
  { key: "USDT:ton", symbol: "USDT", network: "ton", networkLabel: "TON", pocket: "TON", kind: "ton_usdt", decimals: 6, feeCoin: "TON",
    keepNote: "Tether's USD₮ on TON only. Each send attaches 0.05 TON for network fees (most comes back), so keep TON in your pocket for fees. Plain payment notes are included when supplied.", explorerTx: "https://tonviewer.com/transaction/", addressHint: "UQ… or EQ… address, or ton://transfer/…" },
  { key: "SUI:sui", symbol: "SUI", network: "sui", networkLabel: "Sui", pocket: "SUI", kind: "sui", decimals: 9,
    keepNote: "A little SUI stays behind for gas. Only native SUI coins are spent; other Sui tokens and objects are never touched.", explorerTx: "https://suiscan.xyz/mainnet/tx/", addressHint: "0x… (64 hexadecimal characters)" },
];

export function withdrawCoin(symbol: string | undefined, network: string | undefined): WithdrawCoin | null {
  if (!symbol || !network) return null;
  return WITHDRAW_COINS.find((c) => c.symbol.toUpperCase() === symbol.toUpperCase() && c.network === network) ?? null;
}

export function withdrawCoinByKey(key: string): WithdrawCoin | null {
  return WITHDRAW_COINS.find((c) => c.key === key) ?? null;
}

/** Native EVM coin of a network (pays its fee). */
export const EVM_NATIVE: Record<string, string> = { ethereum: "ETH", base: "ETH", bsc: "BNB", zcu: "ZCU", pulsechain: "PLS", hyperevm: "HYPE", avalanche: "AVAX" };

/** Never pay more than this in network fees for one EVM withdrawal, in the network's own coin. */
export const EVM_MAX_FEE: Record<string, number> = { ethereum: 0.02, base: 0.002, bsc: 0.01, zcu: 10, pulsechain: 5000, hyperevm: 0.01, avalanche: 0.05 };
