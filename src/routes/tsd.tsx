import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  Layers,
  ShieldCheck,
  Sprout,
  Timer,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/tsd")({
  head: () => ({
    meta: [
      { title: "Texas Stable Dollar (TSD) — Seeds" },
      {
        name: "description",
        content:
          "TSD is the native stablecoin of Seeds Exchange, issued on the TEXITcoin Omni layer. Learn why Seeds settles in TSD and where to get it.",
      },
      { property: "og:title", content: "Texas Stable Dollar (TSD) — Seeds" },
      {
        property: "og:description",
        content:
          "TSD is the native stablecoin of Seeds Exchange, issued on the TEXITcoin Omni layer. Learn why Seeds settles in TSD and where to get it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TsdPage,
});

const reasons = [
  {
    icon: Layers,
    title: "Native to our settlement chain",
    body: "TSD lives on the TEXITcoin blockchain as Omni property #39. Trades settle directly on the same rails your wallet already uses — no bridges, no wrappers, no third-party custodians.",
  },
  {
    icon: ShieldCheck,
    title: "Honest money alignment",
    body: "TSD is issued by the honest.money ecosystem — the same family Seeds belongs to. A stable dollar unit with an issuer we know, on infrastructure we run.",
  },
  {
    icon: Timer,
    title: "Fast, cheap settlement",
    body: "Omni simple-send transfers ride a single TEXITcoin transaction with a tiny carrier fee (~0.001 TXC). Settlement is measured in blocks, not bank days.",
  },
  {
    icon: Coins,
    title: "Divisible and trade-ready",
    body: "TSD is a divisible, managed Omni asset — precise to 8 decimals. Ideal as the quote currency for TXC, LTC, ISK, ZCU and future wrapped majors.",
  },
];

export default function TsdPage() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-16">
      <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">
        The native stablecoin of Seeds Exchange
      </p>
      <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        Texas Stable Dollar <span className="text-primary">(TSD)</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Every great exchange needs a dependable dollar. Ours is TSD — a stablecoin issued on the
        TEXITcoin blockchain's Omni layer, purpose-built for fast, non-custodial settlement on
        Seeds.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href="https://tsd.honest.money"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-5 py-3 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase transition-opacity hover:opacity-90"
        >
          Get TSD from the issuer
          <ArrowUpRight className="h-4 w-4" />
        </a>
        <Link
          to="/trade/tsd-txc"
          className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-3 font-mono text-xs tracking-wider uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Trade TSD markets
          <ArrowLeftRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="mt-16">
        <h2 className="font-display text-2xl font-bold">Why Seeds chose TSD</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {reasons.map((r) => (
            <div key={r.title} className="rounded-md border border-border bg-surface p-5">
              <r.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{r.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            Asset
          </p>
          <p className="mt-2 font-display text-xl font-bold">TSD · Omni #39</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Divisible, managed property on the TEXITcoin Omni layer (Omni Core 0.9.1).
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            Issuer
          </p>
          <p className="mt-2 font-display text-xl font-bold">honest.money</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Issued directly by the TSD issuer — buy and redeem at{" "}
            <a
              href="https://tsd.honest.money"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              tsd.honest.money
            </a>
            .
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface p-5">
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            Settlement
          </p>
          <p className="mt-2 font-display text-xl font-bold">On-chain, direct</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Seeds settles TSD wallet-to-wallet from your authorized trading branch. No exchange
            deposits.
          </p>
        </div>
      </section>

      <section className="mt-16 rounded-md border border-primary/40 bg-primary/5 p-6">
        <div className="flex items-start gap-4">
          <Sprout className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-xl font-bold">How to start trading with TSD</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Open your Seeds vault and unlock your wallet on the{" "}
                <Link to="/wallet" className="text-primary underline-offset-4 hover:underline">
                  wallet page
                </Link>
                .
              </li>
              <li>
                Buy TSD directly from the issuer at{" "}
                <a
                  href="https://tsd.honest.money"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  tsd.honest.money
                </a>{" "}
                and send it to your Seeds trading address.
              </li>
              <li>
                Create a TSD trading authorization with a cap and expiry you choose.
              </li>
              <li>
                Pick a market like{" "}
                <Link
                  to="/trade/tsd-txc"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  TXC/TSD
                </Link>{" "}
                and place your first order. Settlement happens on-chain, automatically.
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="mt-16">
        <div className="flex items-start gap-4">
          <Wallet className="mt-1 h-6 w-6 shrink-0 text-primary" />
          <div>
            <h2 className="font-display text-xl font-bold">Non-custodial, end to end</h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              TSD on Seeds is never "deposited" into an exchange account. Your balance stays in a
              wallet derived from your own seed phrase. Seeds can only sign trades inside the cap
              and expiry you authorized — and when the authorization expires, the key is wiped and
              the wipe is published on the{" "}
              <Link to="/custody" className="text-primary underline-offset-4 hover:underline">
                custody ledger
              </Link>
              . Learn the full model on{" "}
              <Link to="/how-it-works" className="text-primary underline-offset-4 hover:underline">
                how it works
              </Link>
              , and the TEXITcoin + Omni tech at{" "}
              <a
                href="https://texitcoin.org/build"
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline-offset-4 hover:underline"
              >
                texitcoin.org/build
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
