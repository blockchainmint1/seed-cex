import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownUp, ChevronDown, Clock, ShieldCheck, Wallet } from "lucide-react";
import { PROTOCOL_LABEL, SWAP_COINS, swapCoin, type Protocol, type SwapCoinId } from "@/lib/xchain/assets";
import { getSwapQuotes, getSwapSendContext, getSwapStatus } from "@/lib/xchain/swap.functions";
import { landsOutsideHmeWallet, receivePocket } from "@/lib/xchain/send-rules";
import { getTsdRouteQuote } from "@/lib/xchain/tsd-route.functions";
import { quoteDexSwap } from "@/lib/dex/dex.functions";
import { DEX_NETWORKS } from "@/lib/dex/venues";
import { displaySymbol } from "@/lib/dex/starters";
import { TSD_DEX } from "@/lib/dex/swap-rules";
import { quoteTwoStepSwap } from "@/lib/two-step/two-step.functions";
import { bestIndex, coinForToken, normalizeSide, planSwap, sameSide, type RouteOption, type SwapSide } from "@/lib/swap/plan";
import { fmtCompact } from "@/lib/format";
import { useSession } from "@/hooks/use-session";
import { TsdRouteResult } from "@/components/swap/TsdRoute";
import { MySwaps } from "@/components/swap/MySwaps";
import { AnyCoinPicker } from "@/components/swap/AnyCoinPicker";
import { CrossChainRoutes, type XRoute } from "@/components/swap/CrossChainResult";
import { PocketSwap, QuoteDetails, type DexCoin, type DexQuoteResult } from "@/components/swap/DexResult";
import { TwoStepResult, type TwoStepQuoteResult } from "@/components/swap/TwoStepResult";
import { RelayResult, type RelayQuoteResult } from "@/components/swap/RelayResult";
import { quoteRelaySwap } from "@/lib/relay/relay.functions";
import { HypeChainResult, type HypeChainQuoteResult } from "@/components/swap/HypeChainResult";
import { quoteHypeChainSwap } from "@/lib/hype-chain/hype-chain.functions";
import { quoteTonUsdt } from "@/lib/ston/ston.functions";
import { TonUsdtResult, type TonUsdtQuote } from "@/components/swap/TonUsdtResult";

type SwapSearch = { from?: string; to?: string; amount?: string };
const sideOk = (v: unknown): v is string => v === "TSD" || v === "HYPE" || v === "TON" || v === "USDT_TON" || (typeof v === "string" && Boolean(swapCoin(v as SwapCoinId)));
const toSide = (v: string): SwapSide => (v === "TSD" ? { kind: "tsd" } : v === "HYPE" ? { kind: "hype" } : v === "TON" ? { kind: "ton" } : v === "USDT_TON" ? { kind: "ton_usdt" } : { kind: "coin", id: v as SwapCoinId });

export const Route = createFileRoute("/swap")({
  staticData: { sitemap: true },
  validateSearch: (s: Record<string, unknown>): SwapSearch => ({
    from: sideOk(s.from) ? s.from : undefined,
    to: sideOk(s.to) ? s.to : undefined,
    // The URL may carry the amount as a number (?amount=10) or a string.
    amount: (typeof s.amount === "string" || typeof s.amount === "number") && /^\d{1,9}(\.\d{1,8})?$/.test(String(s.amount)) ? String(s.amount) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Swap Any Coin — THORChain, Maya, Uniswap & More | Seeds" },
      {
        name: "description",
        content:
          "One swap form for every coin: Bitcoin, Ether, Solana and XRP through THORChain and Maya, any token on Uniswap, PancakeSwap and PulseX, and TSD. Seeds picks the best route and every swap pays your own pocket.",
      },
      { property: "og:title", content: "Swap any coin — Seeds" },
      { property: "og:description", content: "Pick what you send and what you get. Seeds compares THORChain, Maya and the pools and shows every fee. Multi-step swaps and outside payouts wait for your Telegram tap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: async () => ({ status: await getSwapStatus() }),
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-7xl px-5 py-16 font-mono text-sm text-destructive">
      {(error as Error).message}
    </div>
  ),
  notFoundComponent: () => <div className="mx-auto max-w-7xl px-5 py-16 font-mono text-sm">Not found.</div>,
  component: SwapPage,
});

const PROTOCOLS: Protocol[] = ["thorchain", "maya"];

const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : n === 0 ? "0" : n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : 6 }) : n.toPrecision(6).replace(/0+$/, "");

/** Symbol + network for any side of a swap. */
function sideLabel(s: SwapSide): { symbol: string; network: string } {
  if (s.kind === "tsd") return { symbol: "TSD", network: "TEXITcoin" };
  if (s.kind === "hype") return { symbol: "HYPE", network: "Hyperliquid" };
  if (s.kind === "ton") return { symbol: "TON", network: "TON" };
  if (s.kind === "ton_usdt") return { symbol: "USD₮", network: "TON" };
  if (s.kind === "coin") {
    const c = swapCoin(s.id)!;
    return { symbol: c.symbol, network: c.network };
  }
  return { symbol: displaySymbol(s.network, s.address, s.symbol), network: DEX_NETWORKS[s.network].name };
}

/** The pool-token form of a side, for a pool route on that network. */
function asDexCoin(s: SwapSide, address: string): DexCoin {
  if (s.kind === "tsd") return { address: TSD_DEX, symbol: "TSD", name: "Texas Stable Dollar" };
  if (s.kind === "token") return { address: s.address, symbol: s.symbol, name: s.name ?? s.symbol };
  if (s.kind === "hype") return { address, symbol: "HYPE", name: "Hyperliquid" };
  if (s.kind === "ton") return { address, symbol: "TON", name: "Toncoin" };
  if (s.kind === "ton_usdt") return { address, symbol: "USD₮", name: "Tether USD on TON" };
  const c = swapCoin(s.id)!;
  return { address, symbol: c.symbol, name: c.name };
}

type Result =
  | { kind: "xchain"; opt: Extract<RouteOption, { kind: "xchain" }>; out: number | null; label: string; routes: XRoute[]; inputUsd: number | null; error?: undefined }
  | { kind: "tsd"; opt: Extract<RouteOption, { kind: "tsd" }>; out: number | null; label: string; data: Awaited<ReturnType<typeof getTsdRouteQuote>>; error?: undefined }
  | { kind: "dex"; opt: Extract<RouteOption, { kind: "dex" }>; out: number | null; label: string; data: DexQuoteResult; error?: undefined }
  | { kind: "two"; opt: Extract<RouteOption, { kind: "two" }>; out: number | null; label: string; data: TwoStepQuoteResult; error?: undefined }
  | { kind: "relay"; opt: Extract<RouteOption, { kind: "relay" }>; out: number | null; label: string; data: RelayQuoteResult; error?: undefined }
  | { kind: "hype_chain"; opt: Extract<RouteOption, { kind: "hype_chain" }>; out: number | null; label: string; data: HypeChainQuoteResult; error?: undefined }
  | { kind: "ston"; opt: Extract<RouteOption, { kind: "ston" }>; out: number | null; label: string; data: TonUsdtQuote; error?: undefined }
  | { kind: "error"; opt: RouteOption; out: null; label: string; error: string };

function optionLabel(o: RouteOption): string {
  if (o.kind === "xchain") return "THORChain / Maya";
  if (o.kind === "tsd") return "TSD Bridge + THORChain / Maya";
  if (o.kind === "dex") return `Pools on ${DEX_NETWORKS[o.network].name}`;
  if (o.kind === "relay") return "Relay";
  if (o.kind === "ston") return "STON.fi on TON";
  if (o.kind === "hype_chain") return o.via === "tsd" ? "TSD Bridge + Relay via ETH" : "THORChain / Maya + Relay via ETH";
  return `Two steps on ${DEX_NETWORKS[o.network].name}`;
}

function SwapPage() {
  const loader = Route.useLoaderData();
  const fetchStatus = useServerFn(getSwapStatus);
  const { data: status } = useQuery({
    queryKey: ["swap-status"],
    queryFn: () => fetchStatus(),
    initialData: loader.status,
    refetchInterval: 30_000,
  });

  // A link can open the form on a pair (e.g. the setup guide's "Convert 10 TSD to ETH").
  const search = Route.useSearch();
  const initPair = search.from && search.to && search.from !== search.to;
  const [from, setFrom] = useState<SwapSide>(initPair ? toSide(search.from!) : { kind: "tsd" });
  const [to, setTo] = useState<SwapSide>(initPair ? toSide(search.to!) : { kind: "coin", id: "BTC" as SwapCoinId });
  const [amount, setAmount] = useState(search.amount ?? "50");
  const [picking, setPicking] = useState<null | "from" | "to">(null);
  const [destination, setDestination] = useState("");
  const [elsewhere, setElsewhere] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  const { user } = useSession();
  const fetchSendCtx = useServerFn(getSwapSendContext);
  const { data: sendCtx } = useQuery({
    queryKey: ["swap-send-ctx", user?.id ?? null],
    queryFn: () => fetchSendCtx(),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  const plan = planSwap(from, to);
  const toCoin = to.kind === "coin" ? swapCoin(to.id)! : null;
  const hasXchain = plan.options.some((o) => o.kind === "xchain");
  const ownPocket = toCoin ? receivePocket(toCoin) : null;
  const ownAddress = ownPocket ? (sendCtx?.link?.addresses as Record<string, string> | undefined)?.[ownPocket] ?? null : null;
  const toPocket = Boolean(ownAddress) && !elsewhere;
  // Only THORChain/Maya can pay an outside address; every other route pays the member's own pocket.
  const outside = hasXchain && elsewhere;

  const fetchX = useServerFn(getSwapQuotes);
  const fetchTsd = useServerFn(getTsdRouteQuote);
  const fetchDex = useServerFn(quoteDexSwap);
  const fetchTwo = useServerFn(quoteTwoStepSwap);
  const fetchRelay = useServerFn(quoteRelaySwap);
  const fetchChain = useServerFn(quoteHypeChainSwap);
  const fetchSton = useServerFn(quoteTonUsdt);
  const quote = useMutation({
    mutationFn: async (): Promise<Result[]> => {
      const opts = outside ? plan.options.filter((o) => o.kind === "xchain") : plan.options;
      return Promise.all(opts.map(async (o): Promise<Result> => {
        const label = optionLabel(o);
        try {
          if (o.kind === "xchain") {
            const r = await fetchX({ data: { from: o.from, to: o.to, amount, destination: toPocket ? ownAddress ?? "" : destination } });
            const best = r.routes.filter((x) => x.ok).sort((a, b) => b.expectedOut - a.expectedOut)[0];
            return { kind: "xchain", opt: o, out: best?.expectedOut ?? null, label: best ? `${best.label}` : label, routes: r.routes, inputUsd: r.inputUsd ?? null };
          }
          if (o.kind === "tsd") {
            const d = await fetchTsd({ data: { direction: o.direction, coin: o.coin, amount } });
            return { kind: "tsd", opt: o, out: d.ok ? d.out : null, label, data: d };
          }
          if (o.kind === "dex") {
            const d = await fetchDex({ data: { network: o.network, tokenIn: o.tokenIn, tokenOut: o.tokenOut, amount } });
            const name = d.best ? `${d.best.venueName} on ${DEX_NETWORKS[o.network].name}${d.tsd ? " + TSD Bridge" : ""}` : label;
            return { kind: "dex", opt: o, out: d.best?.amountOut ?? null, label: name, data: d };
          }
          if (o.kind === "relay") {
            const d = await fetchRelay({ data: { direction: o.direction, amount } });
            return { kind: "relay", opt: o, out: d.out, label, data: d };
          }
          if (o.kind === "ston") {
            const d = await fetchSton({ data: { amount } });
            return { kind: "ston", opt: o, out: d.out, label, data: d };
          }
          if (o.kind === "hype_chain") {
            const d = await fetchChain({ data: { direction: o.direction, via: o.via, coin: o.coin, amount } });
            if (!d.ok) return { kind: "error", opt: o, out: null, label, error: d.error ?? "No price right now." };
            return { kind: "hype_chain", opt: o, out: d.out, label, data: d };
          }
          const d = await fetchTwo({ data: { direction: o.direction, network: o.network, token: o.token, coin: o.coin, amount } });
          const name = d.ok && d.mid && d.protocol
            ? (o.direction === "dex_then_x" ? `${d.venueName} + ${PROTOCOL_LABEL[d.protocol]}` : `${PROTOCOL_LABEL[d.protocol]} + ${d.venueName}`) + ` via ${d.mid.symbol}`
            : label;
          return { kind: "two", opt: o, out: d.ok ? d.out : null, label: name, data: d };
        } catch (e) {
          return { kind: "error", opt: o, out: null, label, error: e instanceof Error ? e.message : String(e) };
        }
      }));
    },
    onSuccess: () => setChosen(null),
  });
  const reset = () => { quote.reset(); setChosen(null); };

  useEffect(() => {
    if (toPocket && ownAddress && destination !== ownAddress) setDestination(ownAddress);
  }, [toPocket, ownAddress, destination]);

  function setPair(f: SwapSide, t: SwapSide) {
    setFrom(normalizeSide(f));
    setTo(normalizeSide(t));
    setDestination("");
    setElsewhere(false);
    reset();
  }
  function choose(s: SwapSide) {
    if (picking === "from") setPair(s, sameSide(s, to) ? from : to);
    else setPair(sameSide(s, from) ? to : from, s);
  }

  const results = quote.data ?? [];
  const best = bestIndex(results.map((r) => r.out));
  const pickIdx = chosen ?? best;
  const sel = pickIdx != null ? results[pickIdx] : null;
  const fromL = sideLabel(from), toL = sideLabel(to);
  const fromPrice = from.kind === "tsd" ? 1 : from.kind === "coin" ? status.coins.find((c) => c.id === from.id)?.priceUsd ?? null : null;
  const amountNum = Number(amount);
  const linkCtx = sendCtx?.link ? { mode: sendCtx.link.mode, hasKey: sendCtx.link.hasKey, pockets: sendCtx.link.pockets as string[] } : null;
  const validAmount = /^\d+(\.\d+)?$/.test(amount) && amountNum > 0;
  const landsOutside = toCoin && landsOutsideHmeWallet(toCoin) ? toCoin : null;
  const tokenOnly = to.kind === "token" && !coinForToken(to.network, to.address);

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-5 py-14">
      <header className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Swap</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">Any coin, one form.</h1>
        <p className="max-w-2xl text-muted-foreground">
          Swap TSD, any of the {SWAP_COINS.length} coins THORChain and Maya trade, or any coin on Ethereum, Base, BNB Chain and
          PulseChain. Pick what you send and what you get — Seeds asks every route that can do it, shows the best price, and never holds your coins.
        </p>
        <p className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          Anyone can compare prices. Swapping from your trading pocket is open to beta testers first.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="min-w-0 space-y-6">
          <form
            className="space-y-4 rounded-sm border border-border bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (plan.options.length && validAmount) quote.mutate();
            }}
          >
            <div className="space-y-2">
              <label htmlFor="swap-amount" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">You send</label>
              <div className="flex gap-2">
                <input
                  id="swap-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); reset(); }}
                  className="h-12 min-w-0 flex-1 rounded-sm border border-input bg-background px-3 num text-lg outline-none focus:border-primary"
                />
                <SideButton label="Coin you send" side={from} onClick={() => setPicking("from")} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                ≈ {usd(Number.isFinite(amountNum) && fromPrice ? amountNum * fromPrice : null)} · {fromL.network}
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setPair(to, from)}
                aria-label="Swap direction"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">You receive</span>
              <div className="flex gap-2">
                <div className="flex h-12 min-w-0 flex-1 items-center truncate rounded-sm border border-input bg-background px-3 num text-lg" aria-live="polite">
                  {sel?.out != null ? fmtNum(sel.out) : <span className="text-muted-foreground">—</span>}
                </div>
                <SideButton label="Coin you receive" side={to} onClick={() => setPicking("to")} />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">{toL.network}{sel ? ` · via ${sel.label}` : ""}</p>
            </div>

            {plan.problem ? <p className="border-l-2 border-warn pl-3 text-xs text-foreground">{plan.problem}</p> : null}

            {hasXchain && toCoin ? (
              <div className="space-y-2">
                {toPocket ? (
                  <>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5" /> Lands in your own trading pocket
                      <span className="font-mono text-[11px] text-foreground">{ownAddress!.slice(0, 8)}…{ownAddress!.slice(-6)}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => { setElsewhere(true); setDestination(""); reset(); }}
                      className="font-mono text-[11px] text-muted-foreground underline underline-offset-2 hover:text-primary"
                    >
                      Send it somewhere else
                    </button>
                  </>
                ) : (
                  <>
                    <label htmlFor="swap-dest" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                      {ownAddress ? "Outside" : "Your"} {toCoin.network} receiving address {ownAddress ? null : <span className="normal-case tracking-normal">(optional)</span>}
                    </label>
                    <input
                      id="swap-dest"
                      value={destination}
                      placeholder={toCoin.addressHint}
                      onChange={(e) => { setDestination(e.target.value.trim()); reset(); }}
                      className="h-11 w-full rounded-sm border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                    />
                    {ownAddress ? (
                      <>
                        <p className="border-l-2 border-warn pl-3 text-xs text-foreground">
                          Paying anywhere but your own pocket counts as a withdrawal: you’ll need two-factor on, a code from the last 10 minutes, and an Approve tap in Telegram. Only THORChain and Maya can pay an outside address.
                        </p>
                        <button
                          type="button"
                          onClick={() => { setElsewhere(false); reset(); }}
                          className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
                        >
                          <Wallet className="h-3.5 w-3.5" />
                          Send it to my trading pocket instead
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Add it to run the full send checks: the swap instruction is verified to pay exactly this address.</p>
                    )}
                  </>
                )}
              </div>
            ) : plan.options.length ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Lands in your own trading pocket{to.kind === "tsd" ? " as TSD on TEXITcoin" : tokenOnly ? ` on ${toL.network}` : ""}.
              </p>
            ) : null}
            {landsOutside && (toPocket || !hasXchain) ? (
              <p className="border-l-2 border-warn pl-3 text-xs text-foreground">
                HME Wallet can’t hold {landsOutside.symbol}. It stays in your Seeds trading pocket — swap it back to TSD before you revoke Seeds’ access.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={quote.isPending || !validAmount || !plan.options.length}
              className="h-11 w-full rounded-md bg-action text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {quote.isPending ? "Asking every route…" : "Get price"}
            </button>
          </form>

          {results.length > 1 ? (
            <div className="rounded-sm border border-border bg-surface">
              <h2 className="border-b border-border px-4 py-3 font-mono text-[11px] tracking-[0.2em] uppercase">Routes checked</h2>
              <ul role="radiogroup" aria-label="Route" className="divide-y divide-border">
                {results.map((r, i) => (
                  <li key={`${r.opt.kind}-${i}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={i === pickIdx}
                      disabled={r.out == null}
                      onClick={() => setChosen(i)}
                      className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm disabled:cursor-not-allowed ${i === pickIdx ? "bg-primary/10" : "hover:bg-background"}`}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{r.label}</span>
                        {r.out == null ? (
                          <span className="block truncate text-xs text-muted-foreground">{r.kind === "error" ? r.error : r.kind === "two" ? r.data.error : r.kind === "tsd" ? r.data.error : "No price right now."}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right font-mono text-xs tabular-nums">
                        {r.out != null ? `${fmtNum(r.out)} ${toL.symbol}` : "—"}
                        {i === best ? <span className="ml-2 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground uppercase">Best</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {results.length === 1 && results[0]!.out == null ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {results[0]!.kind === "error" ? results[0]!.error : results[0]!.kind === "two" ? results[0]!.data.error ?? "No route right now." : results[0]!.kind === "tsd" ? results[0]!.data.error ?? "No route right now." : results[0]!.kind === "dex" ? "No pool trades this pair right now." : null}
            </p>
          ) : null}

          {sel ? <Selected r={sel} from={from} to={to} amount={amount} destination={destination} signedIn={Boolean(user)} sendCtx={sendCtx ?? null} linkCtx={linkCtx} onSent={reset} /> : null}

          <MySwaps signedIn={Boolean(user)} sends={sendCtx?.sends ?? []} />
        </section>

        <aside className="space-y-4">
          <div className="rounded-sm border border-border bg-surface p-5 text-sm">
            <h2 className="mb-3 font-mono text-[11px] tracking-[0.2em] uppercase">How Seeds picks the route</h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              <li>Same network (like ETH → PEPE): Uniswap, PancakeSwap or PulseX, priced straight from the pools.</li>
              <li>Different networks (like BTC → ETH): THORChain or Maya, compared side by side.</li>
              <li>TSD on one side: TSD Bridge turns it into USDC in your own pocket first (or last).</li>
              <li>When no single network reaches (like PEPE → BTC): two swaps through a plain coin such as ETH or USDC, with one Telegram tap.</li>
              <li>When more than one can do it, every route is asked and the best price is picked for you. You can choose another.</li>
              <li>HYPE on Hyperliquid swaps through Relay, an outside bridge, paid back to the same pocket address. Other coins and TSD reach HYPE in one tap through ETH.</li>
              <li>TON is bought the same way: ETH through Relay, paid into your own TON pocket. TSD and other coins reach TON in one tap through ETH.</li>
              <li>Every swap pays back into your own pocket. Multi-step routes run on one Approve tap in Telegram, and paying an outside address needs two-factor and a tap.</li>
            </ul>
          </div>
          <div className="rounded-sm border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-mono text-[11px] tracking-[0.2em] uppercase">Network status</h2>
              <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(status.generatedAt).toLocaleTimeString("en-US", { hour12: false })}
              </span>
            </div>
            <div className="max-h-[40rem] overflow-y-auto">
            <table className="w-full font-mono text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-[10px] tracking-wider text-muted-foreground uppercase">
                  <th className="px-4 py-2 font-normal">Coin</th>
                  <th className="px-2 py-2 text-right font-normal">Price</th>
                  <th className="px-2 py-2 text-center font-normal">THOR</th>
                  <th className="px-4 py-2 text-center font-normal">Maya</th>
                </tr>
              </thead>
              <tbody>
                {status.coins.map((c) => {
                  const coin = swapCoin(c.id)!;
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-2">
                        {coin.symbol}
                        <span className="block text-[10px] text-muted-foreground">{coin.network}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{usd(c.priceUsd)}</td>
                      {PROTOCOLS.map((p) => {
                        const r = c.routes[p];
                        return (
                          <td key={p} className={`py-2 text-center ${p === "maya" ? "px-4" : "px-2"}`}>
                            {r.live ? (
                              <span title={r.depthUsd ? `Pool depth ${usd(r.depthUsd)}` : undefined} className="text-primary">
                                ● <span className="text-[10px] text-muted-foreground">{r.depthUsd ? `$${fmtCompact(r.depthUsd)}` : "live"}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">{r.note ?? "—"}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              ● live, with pool depth. Scroll for all {status.coins.length} coins. Prices from THORChain pools; Maya-only coins are priced through Maya.{" "}
              {PROTOCOLS.filter((p) => !status.protocols[p].reachable)
                .map((p) => `${PROTOCOL_LABEL[p]} is not answering right now.`)
                .join(" ")}
            </p>
          </div>
        </aside>
      </div>
      <section className="grid gap-6 md:grid-cols-3">
        {[
          {
            t: "1 · Quote",
            d: "Seeds asks every route that can do your pair — THORChain, Maya, Uniswap, PancakeSwap, PulseX, plus TSD Bridge when TSD is on one side — and shows every fee up front.",
          },
          {
            t: "2 · Check",
            d: "Before any coin moves, the swap must pay exactly your pocket and coin, carry price protection, and pass a fresh price check and test run. Chain-to-chain vaults are confirmed by two independent servers.",
          },
          {
            t: "3 · Confirm and go",
            d: "Confirm on the page and Seeds sends from your own trading pocket (beta testers for now). Multi-step swaps and outside payouts wait for one Approve tap in Telegram. A two-step swap stops safely — with the in-between coin in your pocket — if the price falls below your minimum.",
          },
        ].map((s) => (
          <div key={s.t} className="rounded-sm border border-border bg-surface p-5">
            <h3 className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">{s.t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      <p className="max-w-3xl text-xs text-muted-foreground">
        THORChain, Maya Protocol, Uniswap, PancakeSwap and PulseX are independent networks; Seeds does not run them. Quotes expire within minutes and
        large trades move the price. Anyone can list a coin on the pools — warnings never stop you choosing, they make the risk plain. Tokens such as
        WBTC or USDC on BNB Chain are issued by third parties on those networks. TSD swaps convert through TSD Bridge, the single issuer of Texas Stable Dollar — see{" "}
        <Link to="/tsd" className="text-primary underline-offset-2 hover:underline">TSD</Link>.
      </p>

      <AnyCoinPicker
        open={picking !== null}
        title={picking === "from" ? "Pick the coin you send" : "Pick the coin you receive"}
        onClose={() => setPicking(null)}
        onPick={choose}
      />
    </div>
  );
}

function SideButton({ label, side, onClick }: { label: string; side: SwapSide; onClick: () => void }) {
  const l = sideLabel(side);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-12 w-40 shrink-0 items-center justify-between gap-1.5 rounded-sm border border-input bg-background px-3 text-left font-mono text-sm hover:border-primary sm:w-48"
    >
      <span className="min-w-0 truncate">
        {l.symbol} <span className="text-muted-foreground">· {l.network}</span>
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The detail card for the chosen route, with its own send step. */
function Selected({ r, from, to, amount, destination, signedIn, sendCtx, linkCtx, onSent }: {
  r: Result;
  from: SwapSide;
  to: SwapSide;
  amount: string;
  destination: string;
  signedIn: boolean;
  sendCtx: Awaited<ReturnType<typeof getSwapSendContext>> | null;
  linkCtx: { mode: string; hasKey: boolean; pockets: string[] } | null;
  onSent: () => void;
}) {
  if (r.kind === "xchain") {
    return (
      <CrossChainRoutes
        routes={r.routes}
        fromCoin={swapCoin(r.opt.from)!}
        toCoin={swapCoin(r.opt.to)!}
        amount={amount}
        destination={destination}
        inputUsd={r.inputUsd}
        signedIn={signedIn}
        sendCtx={sendCtx}
        onSent={onSent}
      />
    );
  }
  if (r.kind === "tsd") {
    return (
      <TsdRouteResult
        direction={r.opt.direction}
        coin={swapCoin(r.opt.coin)!}
        amount={amount}
        q={r.data}
        signedIn={signedIn}
        link={linkCtx as never}
        isAdmin={Boolean(sendCtx?.isAdmin)}
      />
    );
  }
  if (r.kind === "dex") {
    const net = r.opt.network;
    const fromC = asDexCoin(from, r.opt.tokenIn);
    const toC = asDexCoin(to, r.opt.tokenOut);
    return (
      <>
        <PocketSwap d={r.data} network={net} from={fromC} to={toC} amount={amount} />
        <QuoteDetails d={r.data} network={net} from={fromC} to={toC} />
      </>
    );
  }
  if (r.kind === "relay") return <RelayResult q={r.data} amount={amount} />;
  if (r.kind === "ston") return <TonUsdtResult q={r.data} amount={amount} />;
  if (r.kind === "hype_chain") return <HypeChainResult q={r.data} amount={amount} symbol={sideLabel(r.opt.direction === "from_hype" ? to : from).symbol} />;
  if (r.kind === "two") {
    return <TwoStepResult q={r.data} amount={amount} symbolIn={sideLabel(from).symbol} symbolOut={sideLabel(to).symbol} />;
  }
  return null;
}
