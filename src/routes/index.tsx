import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getChainSnapshot } from "@/lib/txc.functions";
import { getMarketStats } from "@/lib/market.functions";
import { fmtAgo, fmtAmount, fmtPrice } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Seeds — Non-Custodial USDC/TXC Exchange" },
      {
        name: "description",
        content:
          "Trade USDC and TEXITcoin without handing over your keys. Seeds encrypts your recovery phrase in the browser and settles trades through peer-to-peer escrow.",
      },
      { property: "og:title", content: "Seeds — Non-Custodial USDC/TXC Exchange" },
      {
        property: "og:description",
        content:
          "Trade USDC and TEXITcoin without handing over your keys. Seeds encrypts your recovery phrase in the browser and settles trades through peer-to-peer escrow.",
      },
    ],
  }),
  component: Index,
});

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
  const chain = useQuery({
    queryKey: ["chain-snapshot"],
    queryFn: () => getChainSnapshot(),
    refetchInterval: 60_000,
  });
  const stats = useQuery({
    queryKey: ["market-stats", "USDC_TXC"],
    queryFn: () => getMarketStats({ data: { pair: "USDC_TXC" } }),
    refetchInterval: 30_000,
  });

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
            Non-custodial · Texas built
          </p>
          <h1 className="mt-5 max-w-4xl font-display text-4xl leading-[1.05] font-black tracking-tight text-foreground uppercase md:text-6xl">
            Your seed. Your coins.
            <br />
            <span className="text-primary">Nobody else's server.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Seeds is a USDC/TXC exchange with no custody desk. Your recovery phrase is generated and
            encrypted inside your own browser — we only ever hold ciphertext we cannot open. Trades
            settle peer-to-peer through escrow, not an omnibus account.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/trade/usdc-txc"
              className="rounded-sm bg-primary px-6 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase transition-opacity hover:opacity-90"
            >
              Open USDC/TXC book
            </Link>
            <Link
              to="/auth"
              className="rounded-sm border border-border px-6 py-3 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
            >
              Create a vault
            </Link>
          </div>

          <div className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat
              label="TXC last"
              value={stats.data?.last != null ? fmtPrice(stats.data.last) : "—"}
              hint="USDC per TXC"
            />
            <Stat
              label="24h volume"
              value={stats.data ? fmtAmount(stats.data.volume24h) : "—"}
              hint="TXC"
            />
            <Stat
              label="Chain height"
              value={chain.data?.height != null ? chain.data.height.toLocaleString() : "—"}
              hint={chain.data?.lastBlockAt ? fmtAgo(chain.data.lastBlockAt) : "mempool offline"}
            />
            <Stat
              label="Mempool"
              value={chain.data?.mempoolCount != null ? String(chain.data.mempoolCount) : "—"}
              hint="pending tx"
            />
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-7xl gap-px bg-border md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Seed born in your browser",
              body: "A BIP-39 phrase is generated locally, stretched with 600,000 PBKDF2 rounds, and sealed with AES-256-GCM under a password only you know.",
            },
            {
              n: "02",
              title: "We store the safe, not the key",
              body: "Only ciphertext, a salt, and your public addresses reach our database. There is no recovery path through us — that is the entire point.",
            },
            {
              n: "03",
              title: "Escrowed peer settlement",
              body: "Orders match on a public book, then each leg funds a dedicated escrow. Seeds arbitrates disputes; it never takes possession of both sides.",
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

      <section className="mx-auto max-w-7xl px-5 py-16">
        <div className="rounded-sm border border-warn/40 bg-warn/5 p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-warn uppercase">
            Read this before you deposit anything
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">Both legs now settle on-chain.</strong> TEXITcoin
            is built, signed against your authorized trading branch, and broadcast through our own
            TXC node. USDC is a real ERC-20 transfer signed from your authorized branch on Base,
            Ethereum, or BNB Chain. Both are watched to confirmation, and both are irreversible
            once broadcast. Trade small at first, and never authorize more than you are actively
            trading.
          </p>
        </div>
      </section>
    </>
  );
}
