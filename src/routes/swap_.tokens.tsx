import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDownUp, ChevronDown, ExternalLink, Search, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SwapTabs } from "@/components/swap/SwapTabs";
import { quoteDexSwap, searchDexCoins } from "@/lib/dex/dex.functions";
import { DEX_NETWORKS, DEX_NETWORK_IDS, isNative, type DexNetwork } from "@/lib/dex/venues";
import { STARTER_COINS, displaySymbol, type StarterCoin } from "@/lib/dex/starters";
import { getChain } from "@/lib/chains";
import { fmtCompact, truncateMiddle } from "@/lib/format";

export const Route = createFileRoute("/swap_/tokens")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Swap Any Coin — Uniswap, PancakeSwap & PulseX Prices | Seeds" },
      {
        name: "description",
        content:
          "Live prices straight from Uniswap, PancakeSwap and PulseX pools on Ethereum, Base, BNB Chain and PulseChain. Search any coin or paste its address, with a sell-back safety check on every quote.",
      },
      { property: "og:title", content: "Swap any coin — Seeds" },
      { property: "og:description", content: "Uniswap, PancakeSwap and PulseX prices on four networks, read straight from the pools, with plain-English risk warnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TokensSwapPage,
});

type Coin = StarterCoin & { liquidityUsd?: number | null; ageDays?: number | null };

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const fmtNum = (n: number) =>
  n === 0 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 6 }) : n.toPrecision(6).replace(/0+$/, "");
const usd = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${n.toPrecision(3)}`;

function TokensSwapPage() {
  const [network, setNetwork] = useState<DexNetwork>("ethereum");
  const [from, setFrom] = useState<Coin>(STARTER_COINS.ethereum[0]);
  const [to, setTo] = useState<Coin>(STARTER_COINS.ethereum[1]);
  const [amount, setAmount] = useState("1");
  const [picking, setPicking] = useState<null | "from" | "to">(null);
  const debounced = useDebounced(amount, 500);
  const quote = useServerFn(quoteDexSwap);

  const valid = /^\d+(\.\d+)?$/.test(debounced) && Number(debounced) > 0 && from.address.toLowerCase() !== to.address.toLowerCase();
  const q = useQuery({
    queryKey: ["dex-quote", network, from.address, to.address, debounced],
    queryFn: () => quote({ data: { network, tokenIn: from.address, tokenOut: to.address, amount: debounced } }),
    enabled: valid,
    refetchInterval: 20_000,
    retry: false,
  });

  function pickNetwork(n: DexNetwork) {
    setNetwork(n);
    setFrom(STARTER_COINS[n][0]);
    setTo(STARTER_COINS[n][1]);
  }
  function choose(c: Coin) {
    if (picking === "from") {
      if (c.address.toLowerCase() === to.address.toLowerCase()) setTo(from);
      setFrom(c);
    } else {
      if (c.address.toLowerCase() === from.address.toLowerCase()) setFrom(to);
      setTo(c);
    }
    setPicking(null);
  }

  const d = q.data;
  const def = DEX_NETWORKS[network];

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-5 py-14">
      <header className="space-y-3">
        <SwapTabs active="tokens" />
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Any coin</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">Thousands of coins, one network at a time.</h1>
        <p className="max-w-2xl text-muted-foreground">
          Search any coin on Ethereum, Base, BNB Chain or PulseChain — or paste its address. Seeds reads the price straight
          from the Uniswap, PancakeSwap and PulseX pools and checks it can be sold back before you decide.
        </p>
        <p className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          Prices only for now. Swapping from your trading pocket starts as a small test with the Seeds team.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <section className="min-w-0 space-y-5">
          <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
            <div role="radiogroup" aria-label="Network" className="flex flex-wrap gap-2">
              {DEX_NETWORK_IDS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === network}
                  onClick={() => pickNetwork(n)}
                  className={`rounded-sm border px-3 py-1.5 text-sm transition-colors ${
                    n === network ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {DEX_NETWORKS[n].name}
                </button>
              ))}
            </div>

            <CoinRow label="You send" coin={from} network={network} onPick={() => setPicking("from")}>
              <Input
                inputMode="decimal"
                aria-label="Amount to send"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className="h-12 min-w-0 flex-1 border-0 bg-transparent px-0 text-2xl font-semibold tabular-nums shadow-none focus-visible:ring-0"
              />
            </CoinRow>

            <div className="flex justify-center">
              <button
                type="button"
                aria-label="Swap direction"
                onClick={() => { setFrom(to); setTo(from); }}
                className="rounded-full border border-border bg-background p-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            <CoinRow label="You get" coin={to} network={network} onPick={() => setPicking("to")}>
              <div className="h-12 min-w-0 flex-1 truncate py-2 text-2xl font-semibold tabular-nums" aria-live="polite">
                {q.isFetching && !d ? <span className="text-muted-foreground">…</span> : d?.best ? fmtNum(d.best.amountOut) : <span className="text-muted-foreground">—</span>}
              </div>
            </CoinRow>
            {d ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                ≈ {usd(d.valueInUsd)} in · ≈ {usd(d.valueOutUsd)} out · checked {d.routesChecked} route{d.routesChecked === 1 ? "" : "s"} · refreshes every 20s
              </p>
            ) : null}
          </div>

          {q.error ? <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p> : null}
          {d ? <QuoteDetails d={d} network={network} from={from} to={to} /> : null}
        </section>

        <aside className="space-y-4">
          <div className="rounded-sm border border-border bg-surface p-5 text-sm">
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase">How Seeds prices it</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Every pool listed below is asked directly, and the best answer wins. No outside price service.</li>
              <li>Seeds also asks what selling straight back would return, so a coin that can't be sold shows up red.</li>
              <li>Anyone can list a coin on these pools. Warnings never stop you choosing — they make the risk plain.</li>
              <li>When swapping goes live, coins stay in your own trading pocket and every swap waits for your Approve tap in Telegram.</li>
            </ul>
          </div>
          <div className="rounded-sm border border-border bg-surface p-5 text-sm">
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase">Pools on {def.name}</h2>
            <ul className="space-y-1.5">
              {def.venues.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3">
                  <span>{v.name}</span>
                  <a
                    href={`${getChain(network).explorer}${v.kind === "v3" ? v.quoter : v.router}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
                  >
                    {truncateMiddle(v.router, 6, 4)} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <CoinPicker open={picking !== null} network={network} onClose={() => setPicking(null)} onPick={choose} />
    </div>
  );
}

function CoinRow({ label, coin, network, onPick, children }: { label: string; coin: Coin; network: DexNetwork; onPick: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-border bg-background p-3">
      <div className="mb-1 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{label}</div>
      <div className="flex items-center gap-3">
        {children}
        <button
          type="button"
          onClick={onPick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2 text-sm font-semibold hover:border-primary"
        >
          {displaySymbol(network, coin.address, coin.symbol)}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function QuoteDetails({ d, network, from, to }: { d: Awaited<ReturnType<typeof quoteDexSwap>>; network: DexNetwork; from: Coin; to: Coin }) {
  const tone =
    d.risk.level === "danger" ? "border-destructive/50 bg-destructive/10" : d.risk.level === "caution" ? "border-warning/50 bg-warning/10" : "border-primary/40 bg-primary/10";
  const title = d.risk.level === "danger" ? "High risk" : d.risk.level === "caution" ? "Be careful" : "Looks normal";
  const fromSym = displaySymbol(network, from.address, from.symbol);
  const toSym = displaySymbol(network, to.address, to.symbol);
  const explorer = getChain(network).explorer;
  return (
    <div className="space-y-4">
      {d.best ? (
        <div className="rounded-sm border border-border bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-bold">Best price: {d.best.venueName}</h2>
            <span className="font-mono text-[11px] text-muted-foreground">{d.best.via ? `through ${d.best.via}` : "direct pool"}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            1 {fromSym} ≈ {fmtNum(d.best.amountOut / d.amountIn)} {toSym}
          </p>
          {d.others.length ? (
            <ul className="mt-3 space-y-1 border-t border-border pt-3 font-mono text-xs">
              {d.others.map((o) => (
                <li key={o.venueName} className="flex justify-between gap-3 text-muted-foreground">
                  <span>{o.venueName}{o.hops > 1 ? " · 2 steps" : ""}</span>
                  <span className="tabular-nums">{fmtNum(o.amountOut)} {toSym}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={`rounded-sm border p-5 ${tone}`} role="status">
        <div className="mb-2 flex items-center gap-2 font-semibold">
          {d.risk.level === "ok" ? <ShieldCheck className="h-4 w-4 text-primary" /> : <AlertTriangle className={`h-4 w-4 ${d.risk.level === "danger" ? "text-destructive" : "text-warning"}`} />}
          {title}
        </div>
        {d.roundTripLoss !== null ? (
          <p className="mb-2 text-sm">
            Sell-back check: selling straight back would return about {Math.round((1 - d.roundTripLoss) * 1000) / 10}% of what you put in.
          </p>
        ) : null}
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {d.risk.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>

      <div className="grid gap-2 font-mono text-[11px] sm:grid-cols-2">
        {[from, to].filter((c) => !isNative(c.address)).map((c) => (
          <a key={c.address} href={`${explorer}${c.address}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 text-primary hover:underline">
            <span className="shrink-0">{displaySymbol(network, c.address, c.symbol)} contract</span>
            <span className="truncate">{c.address}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

function CoinPicker({ open, network, onClose, onPick }: { open: boolean; network: DexNetwork; onClose: () => void; onPick: (c: Coin) => void }) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 350);
  const search = useServerFn(searchDexCoins);
  const res = useQuery({
    queryKey: ["dex-search", network, q],
    queryFn: () => search({ data: { q, network } }),
    enabled: open && q.length >= 2,
    staleTime: 60_000,
  });
  useEffect(() => { if (!open) setText(""); }, [open]);
  const rows: Coin[] = q.length >= 2
    ? (res.data ?? []).map((t) => ({ address: t.address, symbol: t.symbol, name: t.name, liquidityUsd: t.liquidityUsd, ageDays: t.ageDays }))
    : [...STARTER_COINS[network]];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pick a coin on {DEX_NETWORKS[network].name}</DialogTitle>
          <DialogDescription>
            Search by name or symbol, or paste a contract address.
            {network === "pulsechain"
              ? " Coins copied from Ethereum when PulseChain started share the same address there, but they're separate coins with their own price."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. PEPE or 0x…" className="pl-9" aria-label="Search coins" />
        </div>
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
          {q.length >= 2 && res.isFetching && !res.data ? <li className="p-2 text-sm text-muted-foreground">Searching…</li> : null}
          {q.length >= 2 && res.data && rows.length === 0 ? (
            <li className="p-2 text-sm text-muted-foreground">No pools on {DEX_NETWORKS[network].name} trade that coin. Try another network or paste its address.</li>
          ) : null}
          {rows.map((c) => {
            const thin = c.liquidityUsd != null && c.liquidityUsd < 10_000;
            const fresh = c.ageDays != null && c.ageDays < 7;
            return (
              <li key={c.address}>
                <button type="button" onClick={() => onPick(c)} className="flex w-full items-center justify-between gap-3 rounded-sm px-2 py-2 text-left hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block font-semibold">{displaySymbol(network, c.address, c.symbol)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.name}{isNative(c.address) ? "" : ` · ${truncateMiddle(c.address, 6, 4)}`}
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
        </ul>
      </DialogContent>
    </Dialog>
  );
}
