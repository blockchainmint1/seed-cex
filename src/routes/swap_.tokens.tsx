import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowDownUp, ChevronDown, ExternalLink, Search, Send, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MySwaps } from "@/components/swap/MySwaps";
import { useSession } from "@/hooks/use-session";
import { getSwapSendContext } from "@/lib/xchain/swap.functions";
import { DEFAULT_SLIPPAGE_BPS, isTsdDex, SLIPPAGE_CHOICES_BPS } from "@/lib/dex/swap-rules";
import { Input } from "@/components/ui/input";
import { SwapTabs } from "@/components/swap/SwapTabs";
import { getDexSwapContext, quoteDexSwap, searchDexCoins, startDexSwap } from "@/lib/dex/dex.functions";
import { DEX_NETWORKS, DEX_NETWORK_IDS, isNative, type DexNetwork } from "@/lib/dex/venues";
import { STARTER_COINS, displaySymbol, type StarterCoin } from "@/lib/dex/starters";
import { getChain } from "@/lib/chains";
import { fmtCompact, truncateMiddle } from "@/lib/format";

export const Route = createFileRoute("/swap_/tokens")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Swap Any Coin — Uniswap, PancakeSwap & PulseX | Seeds" },
      {
        name: "description",
        content:
          "Swap any coin on Uniswap, PancakeSwap and PulseX from your own trading pocket — Ethereum, Base, BNB Chain and PulseChain, plus TSD. Prices straight from the pools, a sell-back check, and your Telegram tap before anything moves.",
      },
      { property: "og:title", content: "Swap any coin — Seeds" },
      { property: "og:description", content: "Uniswap, PancakeSwap and PulseX swaps from your own pocket on four networks, with plain-English risk warnings and a Telegram tap for every swap." },
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
  const [amount, setAmount] = useState("100");
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
    setAmount(n === "ethereum" ? "100" : "1");
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
          Swaps come out of your trading pocket and go back into it. Beta testers first.
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
              {(() => {
                const out = d?.best ? fmtNum(d.best.amountOut) : null;
                // Long numbers (e.g. hundreds of millions of a meme coin) shrink instead of being cut off.
                const size = out && out.length > 13 ? "text-base sm:text-2xl" : out && out.length > 9 ? "text-lg sm:text-2xl" : "text-2xl";
                return (
                  <div className={`flex h-12 min-w-0 flex-1 items-center truncate font-semibold tabular-nums ${size}`} aria-live="polite">
                    {q.isFetching && !d ? <span className="text-muted-foreground">…</span> : out ?? <span className="text-muted-foreground">—</span>}
                  </div>
                );
              })()}
            </CoinRow>
            {d ? (
              <p className="font-mono text-[11px] text-muted-foreground">
                ≈ {usd(d.valueInUsd)} in · ≈ {usd(d.valueOutUsd)} out · checked {d.routesChecked} route{d.routesChecked === 1 ? "" : "s"} · refreshes every 20s
              </p>
            ) : null}
          </div>

          {q.error ? <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p> : null}
          {d ? <PocketSwap d={d} network={network} from={from} to={to} amount={debounced} /> : null}
          {d ? <QuoteDetails d={d} network={network} from={from} to={to} /> : null}
          <History />
        </section>

        <aside className="space-y-4">
          <div className="rounded-sm border border-border bg-surface p-5 text-sm">
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase">How Seeds prices it</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Every pool listed below is asked directly, and the best answer wins. No outside price service.</li>
              <li>TSD (Ethereum): TSD Bridge turns TSD into USDC in your own pocket, then the pool swaps it — or the other way round.</li>
              <li>Seeds also asks what selling straight back would return, so a coin that can't be sold shows up red.</li>
              <li>Anyone can list a coin on these pools. Warnings never stop you choosing — they make the risk plain.</li>
              <li>Every swap waits for your Approve tap in Telegram, pays back into the same pocket, and gives the pool permission for exactly that amount — never more.</li>
              <li>You pay the network fee from your pocket: ETH on Ethereum and Base, BNB on BNB Chain, PLS on PulseChain.</li>
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

function History() {
  const { user } = useSession();
  const fetchSendCtx = useServerFn(getSwapSendContext);
  const { data } = useQuery({
    queryKey: ["swap-send-ctx", user?.id ?? null],
    queryFn: () => fetchSendCtx(),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  if (!user) return null;
  return <MySwaps signedIn sends={data?.sends ?? []} />;
}

const pct = (bps: number) => `${bps / 100}%`;

/** Swap from the member's own pocket: shows what's there, price protection, and the Telegram step. */
function PocketSwap({ d, network, from, to, amount }: { d: Awaited<ReturnType<typeof quoteDexSwap>>; network: DexNetwork; from: Coin; to: Coin; amount: string }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE_BPS);
  const [confirming, setConfirming] = useState(false);
  const fetchCtx = useServerFn(getDexSwapContext);
  const ctx = useQuery({
    queryKey: ["dex-ctx", user?.id ?? null, network, from.address],
    queryFn: () => fetchCtx({ data: { network, tokenIn: from.address } }),
    enabled: Boolean(user),
    refetchInterval: 60_000,
  });
  const start = useServerFn(startDexSwap);
  const go = useMutation({
    mutationFn: () => start({ data: { network, tokenIn: from.address, tokenOut: to.address, amount, shownOut: d.best!.amountOut, slippageBps: slippage } }),
    onSuccess: () => {
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["dex-swaps"] });
    },
  });
  const fromSym = displaySymbol(network, from.address, from.symbol);
  const toSym = displaySymbol(network, to.address, to.symbol);
  const def = DEX_NETWORKS[network];

  if (!user) {
    return (
      <p className="rounded-sm border border-border bg-surface p-4 text-sm text-muted-foreground">
        <Link to="/auth" search={{ redirect: "/swap/tokens" }} className="text-primary underline">Sign in</Link> to swap from your trading pocket.
      </p>
    );
  }
  if (!d.best) return null;
  const c = ctx.data;
  const minOut = d.best.amountOut * (1 - slippage / 10_000);
  const short = c?.balanceIn != null && Number(amount) > c.balanceIn;
  const blocked = c?.blocker ?? null;

  return (
    <div className="space-y-4 rounded-sm border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold">Swap from my pocket</h2>
        {c?.pocket ? <span className="font-mono text-[11px] text-muted-foreground">{truncateMiddle(c.pocket, 6, 4)}</span> : null}
      </div>
      {c && !blocked ? (
        <dl className="grid gap-2 font-mono text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
            <dt className="text-muted-foreground">{fromSym} in your pocket</dt>
            <dd className={`tabular-nums ${short ? "text-destructive" : ""}`}>{c.balanceIn == null ? "—" : fmtNum(c.balanceIn)}</dd>
          </div>
          <div className="flex justify-between gap-3 rounded-sm border border-border bg-background px-3 py-2">
            <dt className="text-muted-foreground">{c.nativeSymbol} for fees</dt>
            <dd className="tabular-nums">{c.nativeBalance == null ? "—" : fmtNum(c.nativeBalance)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="space-y-2">
        <div className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">Price protection</div>
        <div role="radiogroup" aria-label="Price protection" className="flex flex-wrap gap-2">
          {SLIPPAGE_CHOICES_BPS.map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={slippage === b}
              onClick={() => setSlippage(b)}
              className={`rounded-sm border px-3 py-1.5 text-sm ${slippage === b ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {pct(b)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          You get at least <span className="font-semibold text-foreground tabular-nums">{fmtNum(minOut)} {toSym}</span>, or the swap cancels itself and your coins stay put.
          {slippage >= 300 ? " Coins with a built-in tax may need 3–10%." : ""}
        </p>
      </div>

      {blocked ? <p className="rounded-sm border border-warning/50 bg-warning/10 p-3 text-sm">{blocked}</p> : null}
      {short && !blocked ? <p className="text-sm text-destructive">Your pocket holds less {fromSym} than that.</p> : null}
      {go.data ? (
        <p role="status" className="flex items-start gap-2 rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
          <Send className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Check Telegram and tap Approve. The request ends in 15 minutes, and nothing moves until you tap it. Progress shows under My swaps.
        </p>
      ) : null}
      {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}

      <Button
        type="button"
        className="w-full bg-action text-action-foreground hover:bg-action/90 disabled:opacity-40"
        disabled={!c || Boolean(blocked) || short || go.isPending}
        onClick={() => { go.reset(); setConfirming(true); }}
      >
        Swap {fromSym} → {toSym}
      </Button>

      <Dialog open={confirming} onOpenChange={(o) => { if (!go.isPending) setConfirming(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Swap from your pocket?</DialogTitle>
            <DialogDescription>Seeds asks your Telegram for an Approve tap first. Nothing moves until you tap it.</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <Line k="You send" v={`${fmtNum(Number(amount))} ${fromSym}`} />
            <Line k="You get about" v={`${fmtNum(d.best.amountOut)} ${toSym}`} />
            <Line k="At least" v={`${fmtNum(minOut)} ${toSym}`} />
            <Line k="Through" v={`${d.best.venueName} on ${def.name}${d.tsd ? " + TSD Bridge" : ""}`} />
            <Line k="Lands in" v="Your own trading pocket" />
            <Line k="Network fee" v={`Paid in ${def.nativeSymbol} from your pocket`} />
          </dl>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {d.tsd ? (
              <li>
                {d.tsd.side === "buy"
                  ? `TSD Bridge first turns your TSD into about ${fmtNum(d.tsd.usdc)} USDC in your own pocket (fee ${d.tsd.bridgeFeeBps / 100}%). If the pool price moves more than 2% meanwhile, Seeds stops and you keep the USDC.`
                  : `The pool swaps to about ${fmtNum(d.tsd.usdc)} USDC in your pocket, then TSD Bridge issues TSD for it (fee ${d.tsd.bridgeFeeBps / 100}%).`}
              </li>
            ) : null}
            <li>The pool gets permission to spend exactly this amount, never more. Tokens need one extra small network fee for that the first time.</li>
            <li>Before sending, Seeds checks the price again and does a test run. If either fails, nothing is swapped.</li>
            {d.risk.level !== "ok" ? <li className="text-destructive">{d.risk.level === "danger" ? "High risk:" : "Be careful:"} {d.risk.reasons[0]}</li> : null}
          </ul>
          {go.error ? <p role="alert" className="text-sm text-destructive">{(go.error as Error).message}</p> : null}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={go.isPending} onClick={() => setConfirming(false)}>Not now</Button>
            <Button type="button" className="bg-action text-action-foreground hover:bg-action/90" disabled={go.isPending} onClick={() => go.mutate()}>
              {go.isPending ? "Checking the price…" : "Send to Telegram for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
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
        {[from, to].filter((c) => !isNative(c.address) && !isTsdDex(c.address)).map((c) => (
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
  // Search mode follows what's typed right now, so a starter coin can't be tapped by accident mid-typing.
  const searching = text.trim().length >= 2;
  const settled = searching && q === text.trim() && !res.isFetching;
  const rows: Coin[] = searching
    ? (settled ? (res.data ?? []) : []).map((t) => ({ address: t.address, symbol: t.symbol, name: t.name, liquidityUsd: t.liquidityUsd, ageDays: t.ageDays }))
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
          {searching && !settled ? <li className="p-2 text-sm text-muted-foreground">Searching…</li> : null}
          {settled && rows.length === 0 ? (
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
        </ul>
      </DialogContent>
    </Dialog>
  );
}
