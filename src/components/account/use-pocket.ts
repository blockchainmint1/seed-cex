import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyHmeLink } from "@/lib/hme-link.functions";
import { getAddressStats } from "@/lib/txc.functions";
import { getTsdBalance } from "@/lib/omni.functions";
import { getUtxoBalances } from "@/lib/utxo.functions";
import { getBtcBalance } from "@/lib/wrap.functions";
import { getEvmPortfolio } from "@/lib/evm.functions";
import { getMyExtraPocketBalances } from "@/lib/pockets/pockets.functions";
import { getReferencePrices } from "@/lib/cmc.functions";
import { DEPOSIT_ASSETS, type DepositAsset, type DepositNetwork } from "@/lib/account/deposit-options";

/** The member's active HME Wallet link (shared cache with the link card). */
export function usePocketLink() {
  const fetchLink = useServerFn(getMyHmeLink);
  return useQuery({ queryKey: ["hme-link"], queryFn: () => fetchLink() });
}

type Raw = {
  txc: { online: boolean; confirmed: number } | null;
  tsd: { online: boolean; balance: number } | null;
  utxo: { symbol: string; online: boolean; balance: number }[];
  btc: { online: boolean; confirmed: number } | null;
  evm: { chain: string; symbol: string; online: boolean; balance: number }[];
  extra: { coin: string; balance: number | null }[];
};

export type BalanceRow = {
  asset: DepositAsset;
  net: DepositNetwork;
  address: string;
  balance: number | null;
  usd: number | null;
};

const EXTRA = ["DOGE", "BCH", "ZEC", "XRP", "TRX", "SOL"];

/** Live balances of every coin at the pocket's receive addresses, plus USD estimates. */
export function usePocketBalances(addresses: Record<string, string> | undefined, linkId: string | undefined) {
  const txcRead = useServerFn(getAddressStats);
  const tsdRead = useServerFn(getTsdBalance);
  const utxoRead = useServerFn(getUtxoBalances);
  const btcRead = useServerFn(getBtcBalance);
  const evmRead = useServerFn(getEvmPortfolio);
  const extraRead = useServerFn(getMyExtraPocketBalances);
  const priceRead = useServerFn(getReferencePrices);
  const a = addresses ?? {};
  const hasExtra = EXTRA.some((c) => Boolean(a[c]));

  const balances = useQuery({
    queryKey: ["hme-pocket-balances", linkId, addresses],
    enabled: Boolean(linkId && addresses),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Raw> => {
      const r = await Promise.allSettled([
        a.TXC ? txcRead({ data: { address: a.TXC } }) : Promise.resolve(null),
        a.TXC ? tsdRead({ data: { address: a.TXC } }) : Promise.resolve(null),
        utxoRead({ data: { ltcAddress: a.LTC, iskAddress: a.ISK } }),
        a.BTC ? btcRead({ data: { address: a.BTC } }) : Promise.resolve(null),
        a.EVM ? evmRead({ data: { address: a.EVM } }) : Promise.resolve(null),
        hasExtra ? extraRead() : Promise.resolve([]),
      ]);
      const v = <T,>(x: PromiseSettledResult<T>, d: T) => (x.status === "fulfilled" ? x.value : d);
      const extra = v(r[5], []);
      return {
        txc: v(r[0], null) as Raw["txc"],
        tsd: v(r[1], null) as Raw["tsd"],
        utxo: (v(r[2], []) ?? []) as Raw["utxo"],
        btc: v(r[3], null) as Raw["btc"],
        evm: (v(r[4], []) ?? []) as Raw["evm"],
        extra: Array.isArray(extra) ? (extra as Raw["extra"]) : [],
      };
    },
  });
  const prices = useQuery({ queryKey: ["reference-prices"], queryFn: () => priceRead(), staleTime: 60_000, refetchInterval: 120_000 });

  const d = balances.data;
  const priceOf = (symbol: string): number | null => {
    if (symbol === "TSD") return 1;
    const q = prices.data?.quotes.find((p) => p.symbol === symbol)?.price;
    if (q != null && Number.isFinite(q)) return q;
    return symbol === "USDC" || symbol === "USDT" ? 1 : null;
  };
  const balanceOf = (asset: DepositAsset, net: DepositNetwork): number | null => {
    if (!d) return null;
    if (net.id === "txc-omni") return d.tsd?.online ? d.tsd.balance : null;
    if (net.id === "txc") return d.txc?.online ? d.txc.confirmed : null;
    if (net.id === "btc") return d.btc?.online ? d.btc.confirmed : null;
    if (net.id === "ltc" || net.id === "isk") {
      const u = d.utxo.find((x) => x.symbol === asset.symbol);
      return u?.online ? u.balance : null;
    }
    if (net.evmChain) {
      const e = d.evm.find((x) => x.chain === net.evmChain && x.symbol === asset.symbol);
      return e?.online ? e.balance : null;
    }
    return d.extra.find((x) => x.coin === net.pocket)?.balance ?? null;
  };

  const rows: BalanceRow[] = [];
  for (const asset of DEPOSIT_ASSETS)
    for (const net of asset.networks) {
      const address = a[net.pocket];
      if (!address) continue;
      const balance = balanceOf(asset, net);
      const price = priceOf(asset.symbol);
      rows.push({ asset, net, address, balance, usd: balance != null && price != null ? balance * price : null });
    }
  const total = rows.reduce((s, r) => s + (r.usd ?? 0), 0);
  const unpriced = rows.some((r) => (r.balance ?? 0) > 0 && r.usd == null);
  return { balances, prices, rows, total, unpriced };
}

export const fmtCoin = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 8 }));
export const fmtUsd = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 && n > 0 ? 4 : 2 });
