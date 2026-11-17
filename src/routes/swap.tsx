import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownUp, Check, Clock, ShieldCheck, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROTOCOL_LABEL, SWAP_COINS, swapCoin, type Protocol, type SwapCoinId } from "@/lib/xchain/assets";
import { getSwapQuotes, getSwapStatus } from "@/lib/xchain/swap.functions";
import { fmtCompact } from "@/lib/format";

export const Route = createFileRoute("/swap")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Cross-Chain Swap — BTC, ETH, SOL, XRP & more | Seeds" },
      {
        name: "description",
        content:
          "Live cross-chain swap prices through THORChain and Maya Protocol for BTC, ETH, LTC, DOGE, BCH, XRP, SOL, ZEC, BNB and TRX — native coins, no wrapped tokens.",
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

function CoinSelect({ value, onChange, label }: { value: SwapCoinId; onChange: (v: SwapCoinId) => void; label: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SwapCoinId)}>
      <SelectTrigger aria-label={label} className="h-12 w-36 shrink-0 rounded-sm font-mono sm:w-44 [&>span]:truncate">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SWAP_COINS.map((c) => (
          <SelectItem key={c.id} value={c.id} className="font-mono">
            {c.symbol} <span className="text-muted-foreground">· {c.network}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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

  const [from, setFrom] = useState<SwapCoinId>("BTC");
  const [to, setTo] = useState<SwapCoinId>("ETH");
  const [amount, setAmount] = useState("0.01");
  const [destination, setDestination] = useState("");
  const quote = useMutation({
    mutationFn: () => fetchQuotes({ data: { from, to, amount, destination } }),
  });

  const fromCoin = swapCoin(from)!;
  const toCoin = swapCoin(to)!;
  const fromPrice = status.coins.find((c) => c.id === from)?.priceUsd ?? null;
  const amountNum = Number(amount);
  const routes = quote.data?.routes ?? [];
  const bestPrice = routes.filter((r) => r.ok).sort((a, b) => b.expectedOut - a.expectedOut)[0] ?? null;

  function flip() {
    setFrom(to);
    setTo(from);
    setDestination("");
    quote.reset();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-5 py-14">
      <header className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Cross-chain swap</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-5xl">
          Real coins, chain to chain.
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Live prices through THORChain and Maya Protocol for Bitcoin, Ether, Litecoin, Dogecoin, Bitcoin Cash, XRP,
          Solana, Zcash, BNB and TRON. Native coins only — no wrapped tokens, and Seeds never holds your coins.
        </p>
        <p className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Price preview — sending opens once HME Wallet can sign for each coin. Nothing on this page moves funds.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <section className="min-w-0 space-y-6">
          <form
            className="space-y-4 rounded-sm border border-border bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              quote.mutate();
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
                    quote.reset();
                  }}
                  className="h-12 min-w-0 flex-1 rounded-sm border border-input bg-background px-3 num text-lg outline-none focus:border-primary"
                />
                <CoinSelect
                  label="Coin you send"
                  value={from}
                  onChange={(v) => {
                    setFrom(v);
                    if (v === to) {
                      setTo(from);
                      setDestination("");
                    }
                    quote.reset();
                  }}
                />
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                ≈ {usd(Number.isFinite(amountNum) && fromPrice ? amountNum * fromPrice : null)} · {fromCoin.network}
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
                  {bestPrice ? coins(bestPrice.expectedOut) : <span className="text-muted-foreground">—</span>}
                </div>
                <CoinSelect
                  label="Coin you receive"
                  value={to}
                  onChange={(v) => {
                    setTo(v);
                    if (v === from) setFrom(to);
                    setDestination("");
                    quote.reset();
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="swap-dest" className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                Your {toCoin.network} receiving address <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id="swap-dest"
                value={destination}
                placeholder={toCoin.addressHint}
                onChange={(e) => {
                  setDestination(e.target.value.trim());
                  quote.reset();
                }}
                className="h-11 w-full rounded-sm border border-input bg-background px-3 font-mono text-sm outline-none focus:border-primary"
              />
              <p className="text-xs text-muted-foreground">
                Add it to run the full send checks: the swap instruction is verified to pay exactly this address.
              </p>
            </div>

            <button
              type="submit"
              disabled={quote.isPending || !amount}
              className="h-11 w-full rounded-md bg-action text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {quote.isPending ? "Asking THORChain and Maya…" : "Compare routes"}
            </button>
            {quote.error ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {(quote.error as Error).message}
              </p>
            ) : null}
          </form>

          {quote.data ? (
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
                          {r.sendReady
                            ? "All send checks passed. Sending opens with HME Wallet support."
                            : `Not send-ready: ${r.blockedReason}`}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{r.error ?? "No route."}</p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : null}
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
            <table className="w-full font-mono text-xs">
              <thead>
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
            <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
              ● live, with pool depth. Prices from THORChain pools.{" "}
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
            d: "We ask THORChain and Maya for a live price, then show every fee: price impact, the network fee to deliver your coin, and the Seeds fee (none today).",
          },
          {
            t: "2 · Check",
            d: "Before any coin could move, the swap instruction must pay exactly your address and coin, carry price protection, and point at a vault confirmed by two independent servers.",
          },
          {
            t: "3 · Send from your wallet",
            d: "You send from your own HME Wallet. The protocol swaps through its pools and delivers native coins to your address — Seeds never holds them.",
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
        large trades move the price. Maya currently offers BTC, ETH, ZEC, USDC and USDT from this list, and publishes one
        public server, so Maya routes show prices but cannot pass the two-server check yet. Want to trade into Texas
        Stable Dollar? See <Link to="/tsd" className="text-primary underline-offset-2 hover:underline">TSD</Link>.
      </p>
    </div>
  );
}
