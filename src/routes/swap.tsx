import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownUp, Check, Clock, ExternalLink, ShieldCheck, Wallet, X } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTOCOL_LABEL, SWAP_COINS, swapCoin, swapCoinGroup, type Protocol, type SwapCoin, type SwapCoinId } from "@/lib/xchain/assets";
import { getSwapQuotes, getSwapSendContext, getSwapStatus, sendSwap } from "@/lib/xchain/swap.functions";
import { landsOutsideHmeWallet, receivePocket, sendBlocker, sendSource, SWAP_LIMITS } from "@/lib/xchain/send-rules";
import { useSession } from "@/hooks/use-session";
import { MyTsdSwaps, TSD_BUY_COINS, TSD_SELL_COINS, TsdRouteResult } from "@/components/swap/TsdRoute";
import { getTsdRouteQuote } from "@/lib/xchain/tsd-route.functions";
import { fmtCompact } from "@/lib/format";
import { SwapTabs } from "@/components/swap/SwapTabs";

export const Route = createFileRoute("/swap")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Cross-Chain Swap — 46 coins on THORChain & Maya | Seeds" },
      {
        name: "description",
        content:
          "Live cross-chain swap prices through THORChain and Maya Protocol for every coin they trade: BTC, ETH, SOL, XRP, ADA, AVAX, ATOM, DOGE, stablecoins on six networks and more.",
      },
      { property: "og:title", content: "Cross-Chain Swap — Seeds" },
      {
        property: "og:description",
        content: "Compare THORChain and Maya routes side by side, with every fee and safety check shown up front.",
      },
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
const coins = (n: number | null | undefined, digits = 8) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const minutes = (s: number | null) => (s == null ? "—" : s < 90 ? `~${Math.max(1, Math.round(s))}s` : `~${Math.round(s / 60)} min`);

const COIN_GROUPS: Array<[string, SwapCoin[]]> = (() => {
  const m = new Map<string, SwapCoin[]>();
  for (const c of SWAP_COINS) {
    const g = swapCoinGroup(c);
    m.set(g, [...(m.get(g) ?? []), c]);
  }
  const order = ["Coins", "Stablecoins", "Bitcoin & Ether on other networks", "Other tokens"];
  return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
})();

/** A side of the swap: any THORChain/Maya coin, or TSD (converted through TSD Bridge). */
type Side = SwapCoinId | "TSD";
const TSD_LABEL = { symbol: "TSD", network: "TEXITcoin" } as const;
const sideNetwork = (v: Side) => (v === "TSD" ? TSD_LABEL.network : swapCoin(v)!.network);

function groupsFor(list: readonly SwapCoin[]): Array<[string, SwapCoin[]]> {
  const ids = new Set(list.map((c) => c.id));
  return COIN_GROUPS.map(([g, cs]) => [g, cs.filter((c) => ids.has(c.id))] as [string, SwapCoin[]]).filter(([, cs]) => cs.length);
}

function CoinSelect({ value, onChange, label, options, withTsd }: { value: Side; onChange: (v: Side) => void; label: string; options: readonly SwapCoin[]; withTsd: boolean }) {
  return (
    // Radix fires an empty change when the option list swaps under the current value (inside a form); ignore it.
    <Select value={value} onValueChange={(v) => { if (v === "TSD" || swapCoin(v as SwapCoinId)) onChange(v as Side); }}>
      <SelectTrigger aria-label={label} className="h-12 w-36 shrink-0 rounded-sm font-mono sm:w-44 [&>span]:truncate">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {withTsd ? (
          <SelectGroup>
            <SelectLabel className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase">Texas Stable Dollar</SelectLabel>
            <SelectItem value="TSD" className="font-mono">
              TSD <span className="text-muted-foreground">· {TSD_LABEL.network}</span>
            </SelectItem>
          </SelectGroup>
        ) : null}
        {groupsFor(options).map(([group, list]) => (
          <SelectGroup key={group}>
            <SelectLabel className="font-mono text-[10px] tracking-[0.18em] text-primary uppercase">{group}</SelectLabel>
            {list.map((c) => (
              <SelectItem key={c.id} value={c.id} className="font-mono">
                {c.symbol} <span className="text-muted-foreground">· {c.network}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Keeps a from/to pair valid: never the same coin twice, and TSD only against coins TSD Bridge + THORChain can do both ways. */
function fixPair(from: Side, to: Side): [Side, Side] {
  if (from === "TSD" && to !== "TSD" && !TSD_BUY_COINS.some((c) => c.id === to)) return [from, "BTC"];
  if (to === "TSD" && from !== "TSD" && !TSD_SELL_COINS.some((c) => c.id === from)) return ["BTC", to];
  return [from, to];
}

function SwapPage() {
  const loader = Route.useLoaderData();
  const fetchStatus = useServerFn(getSwapStatus);
  const fetchQuotes = useServerFn(getSwapQuotes);
  const { data: status } = useQuery({
    queryKey: ["swap-status"],
    queryFn: () => fetchStatus(),
    initialData: loader.status,
    refetchInterval: 30_000,
  });

  const [from, setFrom] = useState<Side>("TSD");
  const [to, setTo] = useState<Side>("BTC");
  const [amount, setAmount] = useState("50");
  const [destination, setDestination] = useState("");
  // With TSD on one side the swap runs TSD Bridge ↔ USDC ↔ THORChain; otherwise THORChain and Maya are compared directly.
  const tsdDirection = from === "TSD" ? ("buy" as const) : to === "TSD" ? ("sell" as const) : null;
  const tsdCoinId = (tsdDirection === "buy" ? to : from) as SwapCoinId;
  const quote = useMutation({
    mutationFn: () => fetchQuotes({ data: { from: from as SwapCoinId, to: to as SwapCoinId, amount, destination } }),
  });
  const fetchTsdQuote = useServerFn(getTsdRouteQuote);
  const tsdQuote = useMutation({
    mutationFn: () => fetchTsdQuote({ data: { direction: tsdDirection!, coin: tsdCoinId, amount } }),
  });
  const resetQuotes = () => {
    quote.reset();
    tsdQuote.reset();
  };
  function setPair(f: Side, t: Side) {
    const [nf, nt] = fixPair(f, t);
    setFrom(nf);
    setTo(nt);
    setDestination("");
    resetQuotes();
  }

  const { user } = useSession();
  const fetchSendCtx = useServerFn(getSwapSendContext);
  const { data: sendCtx } = useQuery({
    queryKey: ["swap-send-ctx", user?.id ?? null],
    queryFn: () => fetchSendCtx(),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });

  const fromCoin = from === "TSD" ? null : swapCoin(from)!;
  const toCoin = to === "TSD" ? null : swapCoin(to)!;
  const tsdCoin = tsdDirection ? swapCoin(tsdCoinId)! : null;
  const ownPocket = toCoin ? receivePocket(toCoin) : null;
  const ownAddress = ownPocket ? (sendCtx?.link?.addresses as Record<string, string> | undefined)?.[ownPocket] ?? null : null;
  const fromPrice = from === "TSD" ? 1 : status.coins.find((c) => c.id === from)?.priceUsd ?? null;
  const amountNum = Number(amount);
  const routes = quote.data?.routes ?? [];
  const bestPrice = routes.filter((r) => r.ok).sort((a, b) => b.expectedOut - a.expectedOut)[0] ?? null;
  const tq = tsdQuote.data;
  const receiveShown = tsdDirection ? (tq?.ok ? tq.out : null) : bestPrice?.expectedOut ?? null;
  const pending = quote.isPending || tsdQuote.isPending;
  const linkCtx = sendCtx?.link ? { mode: sendCtx.link.mode, hasKey: sendCtx.link.hasKey, pockets: sendCtx.link.pockets as string[] } : null;

  function flip() {
    setPair(to, from);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-5 py-14">
      <header className="space-y-3">
        <SwapTabs active="cross" />
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Cross-chain swap</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">
          Real coins, chain to chain.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Swap TSD or any of {SWAP_COINS.length} coins THORChain and Maya trade — Bitcoin, Ether, Solana and XRP to Cardano,
          Avalanche, Cosmos and stablecoins on six networks. Pick what you send and what you get; Seeds finds the route and
          never holds your coins.
        </p>
        <p className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Anyone can compare prices. Sending from your trading pocket is in a small test with the Seeds team first.
        </p>
      </header>


      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="min-w-0 space-y-6">
          <form
            className="space-y-4 rounded-sm border border-border bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (tsdDirection) tsdQuote.mutate();
              else quote.mutate();
            }}
          >
            <div className="space-y-2">
              <label htmlFor="swap-amount" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                You send
              </label>
              <div className="flex gap-2">
                <input
                  id="swap-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.]/g, ""));
                    resetQuotes();
                  }}
                  className="h-12 min-w-0 flex-1 rounded-sm border border-input bg-background px-3 num text-lg outline-none focus:border-primary"
                />
                <CoinSelect
                  label="Coin you send"
                  value={from}
                  options={to === "TSD" ? TSD_SELL_COINS : SWAP_COINS}
                  withTsd={to !== "TSD"}
                  onChange={(v) => setPair(v, v === to ? from : to)}
                />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                ≈ {usd(Number.isFinite(amountNum) && fromPrice ? amountNum * fromPrice : null)} · {sideNetwork(from)}
              </p>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={flip}
                aria-label="Swap direction"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <ArrowDownUp className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">You receive</span>
              <div className="flex gap-2">
                <div className="flex h-12 min-w-0 flex-1 items-center rounded-sm border border-input bg-background px-3 num text-lg">
                  {receiveShown != null ? coins(receiveShown, to === "TSD" ? 2 : 8) : <span className="text-muted-foreground">—</span>}
                </div>
                <CoinSelect
                  label="Coin you receive"
                  value={to}
                  options={from === "TSD" ? TSD_BUY_COINS : SWAP_COINS}
                  withTsd={from !== "TSD"}
                  onChange={(v) => setPair(v === from ? to : from, v)}
                />
              </div>
            </div>

            {tsdDirection ? (
              <div className="space-y-2">
                <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> Lands in your own trading pocket{to === "TSD" ? " as TSD on TEXITcoin" : ""}.
                </p>
                {tsdDirection === "buy" && tsdCoin && landsOutsideHmeWallet(tsdCoin) ? (
                  <p className="border-l-2 border-warn pl-3 text-xs text-foreground">
                    HME Wallet can’t hold {tsdCoin.symbol}. It stays in your Seeds trading pocket — swap it back to TSD before you revoke Seeds’ access.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="swap-dest" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                  Your {toCoin!.network} receiving address <span className="normal-case tracking-normal">(optional)</span>
                </label>
                <input
                  id="swap-dest"
                  value={destination}
                  placeholder={toCoin!.addressHint}
                  onChange={(e) => {
                    setDestination(e.target.value.trim());
                    resetQuotes();
                  }}
                  className="h-11 w-full rounded-sm border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Add it to run the full send checks: the swap instruction is verified to pay exactly this address.
                </p>
                {ownAddress && destination !== ownAddress ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDestination(ownAddress);
                      resetQuotes();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    Send it to my trading pocket
                  </button>
                ) : null}
                {ownAddress && destination === ownAddress && landsOutsideHmeWallet(toCoin!) ? (
                  <p className="border-l-2 border-warn pl-3 text-xs text-foreground">
                    HME Wallet can’t hold {toCoin!.symbol}. It stays in your Seeds trading pocket — swap it back to TSD before you revoke Seeds’ access.
                  </p>
                ) : null}
              </div>
            )}

            <button
              type="submit"
              disabled={pending || !amount}
              className="h-11 w-full rounded-md bg-action text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Finding the best route…" : "Get price"}
            </button>
            {quote.error || tsdQuote.error ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {((quote.error ?? tsdQuote.error) as Error).message}
              </p>
            ) : null}
          </form>

          {tsdDirection && tq && tsdCoin ? (
            <TsdRouteResult
              direction={tsdDirection}
              coin={tsdCoin}
              amount={amount}
              q={tq}
              signedIn={Boolean(user)}
              link={linkCtx}
              isAdmin={Boolean(sendCtx?.isAdmin)}
            />
          ) : null}
          {!tsdDirection && quote.data && fromCoin && toCoin ? (
            <div className="grid gap-4 md:grid-cols-2">
              {routes.map((r) => {
                const isBest = bestPrice?.protocol === r.protocol;
                return (
                  <article
                    key={r.protocol}
                    className={`space-y-4 rounded-sm border bg-surface p-5 ${isBest ? "border-primary" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-lg font-bold">{r.label}</h2>
                      {isBest ? (
                        <span className="rounded-sm bg-primary px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary-foreground uppercase">
                          Best price
                        </span>
                      ) : null}
                    </div>
                    {r.ok ? (
                      <>
                        <div>
                          <p className="font-display text-2xl font-bold tabular-nums">
                            {coins(r.expectedOut)} {toCoin.symbol}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground">
                            ≈ {usd(r.expectedOutUsd)}
                            {r.minOut != null ? ` · never less than ${coins(r.minOut)}` : ""}
                          </p>
                        </div>
                        <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-xs">
                          <dt className="text-muted-foreground">Price impact</dt>
                          <dd className="text-right tabular-nums">{coins(r.fees.liquidity)} {toCoin.symbol}</dd>
                          <dt className="text-muted-foreground">Delivery network fee</dt>
                          <dd className="text-right tabular-nums">{coins(r.fees.outbound)} {toCoin.symbol}</dd>
                          <dt className="text-muted-foreground">Seeds fee</dt>
                          <dd className="text-right tabular-nums">{r.fees.affiliate > 0 ? `${coins(r.fees.affiliate)} ${toCoin.symbol}` : "None"}</dd>
                          <dt className="text-muted-foreground">Total cost</dt>
                          <dd className="text-right tabular-nums">
                            {usd(r.fees.totalUsd)}
                            {r.fees.totalBps != null ? ` (${(r.fees.totalBps / 100).toFixed(2)}%)` : ""}
                          </dd>
                          <dt className="text-muted-foreground">Arrives in</dt>
                          <dd className="text-right tabular-nums">{minutes(r.seconds)}</dd>
                        </dl>
                        <ul className="space-y-1.5 border-t border-border pt-3">
                          {r.checks.map((c) => (
                            <li key={c.label} className="flex gap-2 text-xs">
                              {c.pass ? (
                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              ) : (
                                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                              )}
                              <span>
                                {c.label}
                                <span className="block font-mono text-[10px] text-muted-foreground">{c.detail}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {r.sendReady ? "All send checks passed." : `Not send-ready: ${r.blockedReason}`}
                        </p>
                        {r.sendReady && r.protocol === "thorchain" ? (
                          <SendPanel
                            signedIn={Boolean(user)}
                            ctx={sendCtx ?? null}
                            from={fromCoin}
                            to={toCoin}
                            amount={amount}
                            destination={destination}
                            expectedOut={r.expectedOut}
                            minOut={r.minOut}
                            inputUsd={quote.data?.inputUsd ?? null}
                            onSent={() => quote.reset()}
                          />
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{r.error ?? "No route."}</p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : null}
          {sendCtx?.sends?.length ? <MySwaps sends={sendCtx.sends} /> : null}
          <MyTsdSwaps signedIn={Boolean(user)} />
        </section>

        <aside className="space-y-4">
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
            d: "We ask THORChain and Maya — plus TSD Bridge when TSD is on one side — for a live price, then show every fee: price impact, the network fee to deliver your coin, and the Seeds fee (none today).",
          },
          {
            t: "2 · Check",
            d: "Before any coin could move, the swap instruction must pay exactly your address and coin, carry price protection, and point at a vault confirmed by two independent servers.",
          },
          {
            t: "3 · Send from your pocket",
            d: "Seeds re-checks everything, then sends from your instant-access trading pocket with per-swap and daily limits. THORChain swaps through its pools and delivers native coins to your address — or refunds you if the price slips.",
          },
        ].map((s) => (
          <div key={s.t} className="rounded-sm border border-border bg-surface p-5">
            <h3 className="font-mono text-[11px] tracking-[0.2em] text-primary uppercase">{s.t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      <p className="max-w-3xl text-xs text-muted-foreground">
        THORChain and Maya Protocol are independent networks; Seeds does not run them. Quotes expire within minutes and
        large trades move the price. Tokens such as WBTC or USDC on BNB Chain are issued by third parties on those
        networks, not by THORChain or Maya. Maya publishes one public server, so Maya routes show prices but cannot pass
        the two-server check yet. TSD swaps convert through TSD Bridge, the single issuer of Texas Stable Dollar — see{" "}
        <Link to="/tsd" className="text-primary underline-offset-2 hover:underline">TSD</Link>.
      </p>
    </div>
  );
}

type SendCtx = Awaited<ReturnType<typeof getSwapSendContext>>;

const TRACKER = (txid: string) => `https://runescan.io/tx/${txid.replace(/^0x/i, "").toUpperCase()}`;

function SendPanel(props: {
  signedIn: boolean;
  ctx: SendCtx | null;
  from: SwapCoin;
  to: SwapCoin;
  amount: string;
  destination: string;
  expectedOut: number;
  minOut: number | null;
  inputUsd: number | null;
  onSent: () => void;
}) {
  const qc = useQueryClient();
  const send = useServerFn(sendSwap);
  const [agree, setAgree] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      send({ data: { from: props.from.id, to: props.to.id, amount: props.amount, destination: props.destination, shownOut: props.expectedOut } }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["swap-send-ctx"] }),
  });

  if (mutation.data) {
    return (
      <div className="space-y-2 rounded-sm border border-primary bg-primary/10 p-3 text-xs">
        <p className="font-semibold">Sent. THORChain is swapping it now.</p>
        <p className="text-muted-foreground">
          You'll get about {coins(mutation.data.expectedOut)} {props.to.symbol}
          {mutation.data.minOut != null ? `, or a refund if it would be under ${coins(mutation.data.minOut)}` : ""}. Progress shows under “My swaps”.
        </p>
        <a href={TRACKER(mutation.data.txid)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-primary underline">
          Track on RuneScan <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  if (!props.signedIn) {
    return (
      <p className="border-t border-border pt-3 text-xs text-muted-foreground">
        <Link to="/auth" search={{ redirect: "/swap" }} className="text-primary underline">Sign in</Link> to send this from your trading pocket.
      </p>
    );
  }
  if (!props.ctx) return null;
  const link = props.ctx.link ? { mode: props.ctx.link.mode, hasKey: props.ctx.link.hasKey, pockets: props.ctx.link.pockets as string[] } : null;
  const blocker = sendBlocker({ from: props.from, link, isAdmin: props.ctx.isAdmin, amountUsd: props.inputUsd });
  if (blocker) return <p className="border-t border-border pt-3 text-xs text-muted-foreground">{blocker}</p>;
  const src = sendSource(props.from)!;
  const fromAddr = (props.ctx.link?.addresses as Record<string, string> | undefined)?.[src.pocket];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-xs">
        Send <span className="num font-semibold">{props.amount} {props.from.symbol}</span> ({usd(props.inputUsd)}) from your trading pocket
        {fromAddr ? <span className="block truncate font-mono text-[10px] text-muted-foreground">{fromAddr}</span> : null}
      </p>
      <p className="text-xs">
        To <span className="block truncate font-mono text-[10px] text-muted-foreground">{props.destination}</span>
      </p>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-primary" />
        <span>
          I checked the receiving address. Blockchain sends can't be undone. Limits during the test: ${SWAP_LIMITS.perSwapUsd.toLocaleString("en-US")} per swap, ${SWAP_LIMITS.dailyUsd.toLocaleString("en-US")} a day.
        </span>
      </label>
      <button
        type="button"
        disabled={!agree || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="h-10 w-full rounded-md bg-action text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {mutation.isPending ? "Re-checking and sending…" : `Send ${props.amount} ${props.from.symbol}`}
      </button>
      {mutation.error ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          {(mutation.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  signing: "Sending…",
  sent: "Swapping",
  done: "Delivered",
  refunded: "Refunded",
  failed: "Not sent",
  unknown: "Checking",
};

function assetLabel(asset: string) {
  const c = SWAP_COINS.find((x) => x.asset === asset);
  return c ? `${c.symbol} · ${c.network}` : asset;
}

function MySwaps({ sends }: { sends: SendCtx["sends"] }) {
  return (
    <div className="rounded-sm border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 font-mono text-[11px] tracking-[0.2em] uppercase">My swaps</h2>
      <ul className="divide-y divide-border sm:hidden">
        {sends.map((s) => (
          <li key={s.id} className="space-y-1 px-4 py-3 font-mono text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <span className={s.status === "failed" ? "text-destructive" : s.status === "done" ? "text-primary" : ""}>{STATUS_LABEL[s.status] ?? s.status}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            <p>
              {coins(Number(s.amount_in))} {assetLabel(s.from_asset)} → ~{coins(Number(s.expected_out))} {assetLabel(s.to_asset)}
            </p>
            {s.error ? <p className="text-[10px] text-muted-foreground">{s.error}</p> : null}
            {s.txid && s.status !== "failed" ? (
              <a href={TRACKER(s.txid)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                Track on RuneScan <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[40rem] font-mono text-xs">
          <thead>
            <tr className="text-left text-[10px] tracking-wider text-muted-foreground uppercase">
              <th className="px-4 py-2 font-normal">When</th>
              <th className="px-2 py-2 font-normal">Sent</th>
              <th className="px-2 py-2 font-normal">For</th>
              <th className="px-2 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Track</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((s) => (
              <tr key={s.id} className="border-t border-border align-top">
                <td className="px-4 py-2 whitespace-nowrap">{new Date(s.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-2 py-2">
                  {coins(Number(s.amount_in))} <span className="block text-[10px] text-muted-foreground">{assetLabel(s.from_asset)}</span>
                </td>
                <td className="px-2 py-2">
                  ~{coins(Number(s.expected_out))} <span className="block text-[10px] text-muted-foreground">{assetLabel(s.to_asset)}</span>
                </td>
                <td className="px-2 py-2">
                  <span className={s.status === "failed" ? "text-destructive" : s.status === "done" ? "text-primary" : ""}>{STATUS_LABEL[s.status] ?? s.status}</span>
                  {s.error ? <span className="block max-w-56 text-[10px] text-muted-foreground">{s.error}</span> : null}
                </td>
                <td className="px-4 py-2">
                  {s.txid && s.status !== "failed" ? (
                    <a href={TRACKER(s.txid)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                      RuneScan <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
