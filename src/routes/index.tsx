import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getMarketStats } from "@/lib/market.functions";
import { getCmcSummary } from "@/lib/cmc.functions";
import { fmtAmount, fmtPrice } from "@/lib/format";
import { PAIRS } from "@/lib/chains";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seeds — The World's Only Non-Custodial Centralized Crypto Exchange" },
      {
        name: "description",
        content:
          "Trade crypto on a centralized exchange that never takes your keys. Seeds is the easiest way to get started with cryptocurrency — like LocalBitcoins and Binance had a baby.",
      },
      { property: "og:title", content: "Seeds — The World's Only Non-Custodial Centralized Crypto Exchange" },
      {
        property: "og:description",
        content:
          "Trade crypto on a centralized exchange that never takes your keys. Seeds is the easiest way to get started with cryptocurrency — like LocalBitcoins and Binance had a baby.",
      },
    ],
  }),
  component: Index,
});

const PAIR_LABELS: Record<string, string> = {
  "USDC_TXC": "USDC / TXC",
  "USDT_TXC": "USDT / TXC",
  "TSD_USDC": "TSD / USDC",
  "LTC_TSD": "LTC / TSD",
  "ISK_TSD": "ISK / TSD",
  "ZCU_TSD": "ZCU / TSD",
};

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-l border-border pl-4">
      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl text-foreground tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Index() {
  const summary = useQuery({
    queryKey: ["cmc-summary"],
    queryFn: () => getCmcSummary(),
    refetchInterval: 30_000,
  });

  const stats = useQuery({
    queryKey: ["market-stats", "USDC_TXC"],
    queryFn: () => getMarketStats({ data: { pair: "USDC_TXC" } }),
    refetchInterval: 30_000,
  });

  const markets = (summary.data ?? []).slice(0, 6);
  const totalVolume = markets.reduce((sum, m) => sum + (m.base_volume ?? 0), 0);

  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-7xl px-5 py-20 md:py-28">
          <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
            Not your keys, not your coins — until now
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl leading-[1.05] font-black tracking-tight text-foreground uppercase md:text-6xl">
            The world's only
            <br />
            <span className="text-primary">non-custodial centralized exchange.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Seeds gives you the speed, depth, and ease of a centralized exchange — without ever
            taking custody of your funds. Your seed stays encrypted in your browser. We settle trades
            directly from your wallet. It's the easiest way to get started with crypto: like
            LocalBitcoins and Binance had a baby.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded-sm bg-primary px-6 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
            <Link
              to="/trade/usdc-txc"
              className="rounded-sm border border-border px-6 py-3 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
            >
              View markets
            </Link>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat
              label="Active markets"
              value={String(PAIRS.length)}
              hint="spot trading pairs"
            />
            <Stat
              label="24h volume"
              value={totalVolume > 0 ? fmtAmount(totalVolume) : "—"}
              hint="across all markets"
            />
            <Stat
              label="USDC/TXC last"
              value={stats.data?.last != null ? fmtPrice(stats.data.last) : "—"}
              hint="live order book"
            />
            <Stat
              label="Settlement"
              value="On-chain"
              hint="direct from your wallet"
            />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Create an account in seconds",
              body: "Sign up with email or connect your wallet. No KYC up front. No deposit forms. No waiting for approvals.",
            },
            {
              n: "02",
              title: "Your seed, your keys, your coins",
              body: "Generate or import a BIP-39 seed in your browser. It's encrypted locally with AES-256-GCM before anything leaves your device.",
            },
            {
              n: "03",
              title: "Trade like a CEX, settle like a wallet",
              body: "Place limit or market orders on a live order book. Trades settle directly on-chain from your authorized trading branch — no omnibus account.",
            },
          ].map((c) => (
            <div key={c.n} className="bg-surface p-8">
              <p className="font-mono text-xs tracking-[0.2em] text-primary">{c.n}</p>
              <h3 className="mt-3 font-display text-lg font-bold tracking-tight text-foreground">
                {c.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
                Live markets
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Trade the pairs that matter
              </h2>
            </div>
            <Link
              to="/trade/usdc-txc"
              className="font-mono text-xs tracking-wider text-primary uppercase hover:underline"
            >
              View all markets →
            </Link>
          </div>

          <div className="mt-8 overflow-hidden rounded-sm border border-border">
            <table className="w-full text-left">
              <thead className="bg-surface font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-3">Pair</th>
                  <th className="px-4 py-3 text-right">Last price</th>
                  <th className="px-4 py-3 text-right">24h volume</th>
                  <th className="px-4 py-3 text-right">24h change</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {markets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Markets loading…
                    </td>
                  </tr>
                ) : (
                  markets.map((m) => {
                    const pairId = m.trading_pairs?.toLowerCase().replace(/_/g, "-") ?? "usdc-txc";
                    const change = m.price_change_percent_24h ?? 0;
                    const positive = change >= 0;
                    return (
                      <tr key={m.trading_pairs} className="hover:bg-surface/50">
                        <td className="px-4 py-4 font-mono text-sm text-foreground">
                          {PAIR_LABELS[m.trading_pairs] ?? m.trading_pairs}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-sm tabular-nums text-foreground">
                          {fmtPrice(m.last_price ?? 0)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-sm tabular-nums text-muted-foreground">
                          {fmtAmount(m.base_volume ?? 0)}
                        </td>
                        <td
                          className={`px-4 py-4 text-right font-mono text-sm tabular-nums ${
                            positive ? "text-success" : "text-destructive"
                          }`}
                        >
                          {positive ? "+" : ""}
                          {change.toFixed(2)}%
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            to={`/trade/${pairId}`}
                            className="inline-flex rounded-sm border border-border px-3 py-1.5 font-mono text-[10px] tracking-wider text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
                          >
                            Trade
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
                Physical cold storage
              </p>
              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground uppercase md:text-5xl">
                The SEEDS coin.
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
                A physical, tamper-evident cold-storage coin that holds your encrypted seed. Tap it
                to your phone, scan the QR, and you're in. No app stores. No seed sheets. No
                complexity. The easiest on-ramp to self-custody ever made.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  Encrypted BIP-39 seed sealed in metal
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  Tap-to-unlock NFC + QR backup
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  $20 — ships worldwide
                </li>
              </ul>
              <div className="mt-8">
                <button
                  disabled
                  className="rounded-sm bg-primary px-6 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase opacity-60 cursor-not-allowed"
                >
                  Pre-order coming soon
                </button>
              </div>
            </div>
            <div className="flex aspect-square items-center justify-center rounded-sm border border-border bg-background p-8">
              <div className="text-center">
                <div className="mx-auto h-40 w-40 rounded-full border-4 border-primary/30 bg-primary/10" />
                <p className="mt-6 font-mono text-xs tracking-wider text-muted-foreground uppercase">
                  SEEDS cold-storage coin placeholder
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your kickass design goes here.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="rounded-sm border border-warn/40 bg-warn/5 p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-warn uppercase">
            Read this before you deposit anything
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Seeds is non-custodial.</strong> You control the
            keys. You authorize a capped, expiring trading branch for settlement. Trades are
            irreversible once broadcast. Start small, authorize only what you are actively trading,
            and never share your full seed with anyone.
          </p>
        </div>
      </section>
    </>
  );
}

