import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SWAP_COINS, swapCoinGroup, type SwapCoin } from "@/lib/xchain/assets";
import { searchDexCoins } from "@/lib/dex/dex.functions";
import { DEX_NETWORKS, DEX_NETWORK_IDS, isNative, type DexNetwork } from "@/lib/dex/venues";
import { STARTER_COINS, displaySymbol } from "@/lib/dex/starters";
import { isTsdDex } from "@/lib/dex/swap-rules";
import { normalizeSide, type SwapSide } from "@/lib/swap/plan";
import { fmtCompact, truncateMiddle } from "@/lib/format";

const GROUP_ORDER = ["Coins", "Stablecoins", "Bitcoin & Ether on other networks", "Other tokens"];
const COIN_GROUPS: Array<[string, SwapCoin[]]> = (() => {
  const m = new Map<string, SwapCoin[]>();
  for (const c of SWAP_COINS) m.set(swapCoinGroup(c), [...(m.get(swapCoinGroup(c)) ?? []), c]);
  return [...m.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
})();

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const groupHead = "px-2 pt-3 pb-1 font-mono text-[10px] tracking-[0.18em] text-primary uppercase";
const rowBtn = "flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left hover:bg-surface";

/**
 * One coin list for the whole Swap page: TSD, every THORChain/Maya coin, and any
 * token on Ethereum, Base, BNB Chain or PulseChain (search or paste an address).
 * A pool token THORChain also lists is handed back as that coin, so each coin has one name.
 */
export function AnyCoinPicker({ open, title, onClose, onPick }: { open: boolean; title: string; onClose: () => void; onPick: (s: SwapSide) => void }) {
  const [text, setText] = useState("");
  const [network, setNetwork] = useState<DexNetwork>("ethereum");
  const q = useDebounced(text.trim(), 400);
  const search = useServerFn(searchDexCoins);
  const res = useQuery({
    queryKey: ["dex-search", network, q],
    queryFn: () => search({ data: { q, network } }),
    enabled: open && q.length >= 2,
    staleTime: 60_000,
  });
  useEffect(() => { if (!open) setText(""); }, [open]);
  const typed = text.trim().toLowerCase();
  const searching = typed.length >= 2;
  const settled = searching && q === text.trim() && !res.isFetching;
  const coinMatches = useMemo(
    () => (typed ? SWAP_COINS.filter((c) => `${c.symbol} ${c.name} ${c.network}`.toLowerCase().includes(typed)) : []),
    [typed],
  );
  const showTsd = !typed || "tsd texas stable dollar".includes(typed);
  const showHype = !typed || "hype hyperliquid".includes(typed);
  const showTon = !typed || "ton toncoin usdt usd₮ tether".includes(typed);
  const pick = (s: SwapSide) => { onPick(normalizeSide(s)); onClose(); };
  const tokenRows = searching
    ? (settled ? (res.data ?? []) : []).map((t) => ({ address: t.address, symbol: t.symbol, name: t.name, liquidityUsd: t.liquidityUsd as number | null, ageDays: t.ageDays as number | null }))
    : STARTER_COINS[network].map((t) => ({ ...t, liquidityUsd: null as number | null, ageDays: null as number | null }));

  const coinRow = (c: SwapCoin) => (
    <li key={c.id}>
      <button type="button" className={rowBtn} onClick={() => pick({ kind: "coin", id: c.id })}>
        <span className="min-w-0">
          <span className="block font-semibold">{c.symbol} <span className="font-normal text-muted-foreground">· {c.network}</span></span>
          <span className="block truncate text-xs text-muted-foreground">{c.name}</span>
        </span>
      </button>
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Search any coin by name or symbol, or paste a contract address. Each coin shows its network.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. BTC, PEPE or 0x…" className="pl-9" aria-label="Search coins" />
        </div>
        <ul className="max-h-[55vh] overflow-y-auto">
          {showTsd ? (
            <>
              <li className={groupHead}>Texas Stable Dollar</li>
              <li>
                <button type="button" className={rowBtn} onClick={() => pick({ kind: "tsd" })}>
                  <span>
                    <span className="block font-semibold">TSD <span className="font-normal text-muted-foreground">· TEXITcoin</span></span>
                    <span className="block text-xs text-muted-foreground">Converted through TSD Bridge</span>
                  </span>
                </button>
              </li>
            </>
          ) : null}
          {showHype ? (
            <>
              <li className={groupHead}>Hyperliquid</li>
              <li>
                <button type="button" className={rowBtn} onClick={() => pick({ kind: "hype" })}>
                  <span>
                    <span className="block font-semibold">HYPE <span className="font-normal text-muted-foreground">· Hyperliquid</span></span>
                    <span className="block text-xs text-muted-foreground">Swapped with ETH through Relay</span>
                  </span>
                </button>
              </li>
            </>
          ) : null}
          {showTon ? (
            <>
              <li className={groupHead}>TON</li>
              <li>
                <button type="button" className={rowBtn} onClick={() => pick({ kind: "ton" })}>
                  <span>
                    <span className="block font-semibold">TON <span className="font-normal text-muted-foreground">· TON</span></span>
                    <span className="block text-xs text-muted-foreground">Bought with ETH or TSD through Relay; swaps to USD₮ on STON.fi</span>
                  </span>
                </button>
              </li>
              <li>
                <button type="button" className={rowBtn} onClick={() => pick({ kind: "ton_usdt" })}>
                  <span>
                    <span className="block font-semibold">USD₮ <span className="font-normal text-muted-foreground">· TON</span></span>
                    <span className="block text-xs text-muted-foreground">Tether on TON, swapped from TON on STON.fi</span>
                  </span>
                </button>
              </li>
            </>
          ) : null}
          {typed
            ? coinMatches.length ? (<><li className={groupHead}>Chain-to-chain coins</li>{coinMatches.map(coinRow)}</>) : null
            : COIN_GROUPS.map(([g, list]) => (
                <li key={g}>
                  <div className={groupHead}>{g}</div>
                  <ul>{list.map(coinRow)}</ul>
                </li>
              ))}

          <li className={groupHead}>More coins on pool networks</li>
          <li className="px-2 pb-2">
            <div role="radiogroup" aria-label="Pool network" className="flex flex-wrap gap-1.5">
              {DEX_NETWORK_IDS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === network}
                  onClick={() => setNetwork(n)}
                  className={`rounded-sm border px-2.5 py-1 text-xs ${n === network ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {DEX_NETWORKS[n].name}
                </button>
              ))}
            </div>
          </li>
          {searching && !settled ? <li className="p-2 text-sm text-muted-foreground">Searching {DEX_NETWORKS[network].name}…</li> : null}
          {settled && tokenRows.length === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">No pools on {DEX_NETWORKS[network].name} trade that coin. Try another network or paste its address.</li>
          ) : null}
          {tokenRows.map((c) => {
            const thin = c.liquidityUsd != null && c.liquidityUsd < 10_000;
            const fresh = c.ageDays != null && c.ageDays < 7;
            return (
              <li key={`${network}-${c.address}`}>
                <button type="button" className={rowBtn} onClick={() => pick({ kind: "token", network, address: c.address, symbol: c.symbol, name: c.name })}>
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {displaySymbol(network, c.address, c.symbol)} <span className="font-normal text-muted-foreground">· {DEX_NETWORKS[network].name}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.name}{isNative(c.address) || isTsdDex(c.address) ? "" : ` · ${truncateMiddle(c.address, 6, 4)}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-[11px]">
                    {c.liquidityUsd != null ? <span className={thin ? "text-destructive" : "text-muted-foreground"}>${fmtCompact(c.liquidityUsd)} in pools</span> : null}
                    {fresh ? <span className="block text-warning">new this week</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
          {network === "pulsechain" ? (
            <li className="px-2 py-2 text-[11px] text-muted-foreground">Coins copied from Ethereum when PulseChain started share the same address there, but they're separate coins with their own price.</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
