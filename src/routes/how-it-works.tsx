import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Clock,
  Eye,
  Flame,
  KeyRound,
  Landmark,
  Leaf,
  Lock,
  ShieldCheck,
  Sprout,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Seeds Works — Shared-Wallet, Non-Custodial Exchange" },
      {
        name: "description",
        content:
          "Seeds is an exchange with no deposits. You keep the seed; we hold a capped, expiring authorization on a dedicated trading branch — and we destroy the key when time runs out.",
      },
      { property: "og:title", content: "How Seeds Works — No Deposits, Ever" },
      {
        property: "og:description",
        content:
          "Shared-wallet co-custody: your recovery phrase never leaves your browser unencrypted, and Seeds only ever holds a capped, expiring trading key that we can prove we've deleted.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HowItWorks,
});

const steps = [
  {
    icon: Sprout,
    title: "Plant your seed",
    body: "Sign up and Seeds generates a BIP-39 recovery phrase in your browser. It is encrypted there with your password (PBKDF2 → AES-256-GCM) and only the ciphertext is stored. We never see the phrase, the password, or a private key — not once.",
  },
  {
    icon: Wallet,
    title: "Two branches: savings and trading",
    body: "From your phrase, keys derive down standard BIP-44 paths. Your savings branch is yours alone — we have no derivation for it, ever. A separate shared trading branch (m/44'/696969'/9'/0/0 on TEXITcoin) exists purely for exchange settlement.",
  },
  {
    icon: KeyRound,
    title: "You grant a capped, expiring authorization",
    body: "To trade, you move only what you want onto the trading branch and grant Seeds a per-asset authorization: this asset, up to this amount, until this time. It is enforced in the database before any key is touched — over the cap or past the expiry, the request dies.",
  },
  {
    icon: ArrowLeftRight,
    title: "Trade on a real order book",
    body: "Orders match by price-time priority across TXC, TSD, USDC, USDT, LTC, ISK, and ZCU. When a match fills, each leg settles on-chain from the maker's trading branch to the taker's address — a real, signed, broadcast transaction with a real txid.",
  },
  {
    icon: Flame,
    title: "Expiry hits → the key is destroyed",
    body: "When your authorization expires — or when you revoke it — the delegated key material is hard-deleted from our systems. Not revoked-by-flag. Gone. We can't sign another satoshi even if we wanted to.",
  },
  {
    icon: Eye,
    title: "We prove what we hold, publicly",
    body: "The Custody Ledger publishes a live attestation: how many keys we hold, how many are expired-and-purged, and aggregate counts only. No addresses, no balances, no user data. Anyone can watch us hold almost nothing.",
  },
];

const contrasts = [
  {
    theirs: "You deposit funds into the exchange's omnibus wallet.",
    ours: "No deposits. Funds stay at addresses derived from your seed.",
  },
  {
    theirs: "They hold 100% of your balance, for as long as you use them.",
    ours: "We hold a capped key, only for assets you authorize, only until the time you set.",
  },
  {
    theirs: "Withdrawals are a permission slip you request from them.",
    ours: "Revoke the authorization and sweep your branch back to savings — no approval needed.",
  },
  {
    theirs: "A breach or insolvency can mean total loss (see: Mt. Gox, FTX, Celsius…).",
    ours: "A breach gets attackers ciphertext and expired keys. Your savings branch is unreachable.",
  },
  {
    theirs: "You must trust their solvency attestations.",
    ours: "You can verify our custody on-chain — the attestation counts are public and auditable.",
  },
];

function HowItWorks() {
  return (
    <main className="mx-auto max-w-7xl px-5 py-16">
      {/* Hero */}
      <header className="max-w-3xl space-y-5">
        <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">How it works</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          An exchange with no deposits.
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Every centralized exchange asks you to hand over your coins first. Seeds never does. You
          keep the seed phrase; we hold a narrow, expiring authorization on one dedicated trading
          branch — and when the clock runs out, we destroy the key and publish proof.
        </p>
      </header>

      {/* The problem */}
      <section className="mt-16 rounded-md border border-border bg-surface p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-foreground">
          The deposit is the bug, not the feature
        </h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          On a traditional exchange, step one is a deposit. From that moment you hold an IOU in a
          database, not crypto. The exchange has the keys, the coins, and the discretion. Every
          catastrophic exchange failure in history — the hacks, the freezes, the bankruptcies —
          happened inside that deposit. Seeds removes it entirely.
        </p>
      </section>

      {/* Steps */}
      <section className="mt-16">
        <h2 className="font-display text-2xl font-bold text-foreground">
          The model, step by step
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {steps.map((s, i) => (
            <article
              key={s.title}
              className="rounded-md border border-border bg-surface p-6 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary/10 text-primary">
                  <s.icon className="h-4.5 w-4.5" />
                </span>
                <span className="font-mono text-[11px] tracking-widest text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-4 font-display text-lg font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Derivation diagram */}
      <section className="mt-16 rounded-md border border-border bg-surface p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-foreground">
          One seed, two branches
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your recovery phrase derives an entire tree of keys. Seeds only ever touches one isolated
          branch — the trading branch — and only within your authorization. The savings branch is
          cryptographically out of reach.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-sm border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
{`your seed phrase (never leaves your browser unencrypted)
├── m/44'/696969'/0'/0/…   SAVINGS BRANCH
│    └─ yours alone. Seeds has no keys here. ever.
└── m/44'/696969'/9'/0/0   SHARED TRADING BRANCH
     ├─ per-asset authorization: asset + cap + expiry
     ├─ enforced in the database before any signing
     └─ key hard-deleted at expiry / revocation`}
        </pre>
      </section>

      {/* Comparison table */}
      <section className="mt-16">
        <h2 className="font-display text-2xl font-bold text-foreground">
          Seeds vs. the old way
        </h2>
        <div className="mt-8 overflow-hidden rounded-md border border-border">
          <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
            <div className="bg-surface px-6 py-4 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              <Landmark className="mr-2 inline h-3.5 w-3.5" /> A normal CEX
            </div>
            <div className="bg-surface px-6 py-4 font-mono text-xs tracking-widest text-primary uppercase">
              <Leaf className="mr-2 inline h-3.5 w-3.5" /> Seeds
            </div>
            {contrasts.map((c) => (
              <div key={c.theirs} className="contents">
                <div className="bg-background px-6 py-4 text-sm text-muted-foreground">
                  {c.theirs}
                </div>
                <div className="bg-background px-6 py-4 text-sm text-foreground">{c.ours}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Honest caveats */}
      <section className="mt-16 rounded-md border border-amber-500/30 bg-surface p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-foreground">
          <ShieldCheck className="mr-2 inline h-5 w-5 text-primary" />
          What this does — and doesn't — mean
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <strong className="text-foreground">Your seed phrase is your root of trust.</strong>{" "}
            Lose it and lose your password, and no one — including us — can recover your funds.
            Write it down. Keep it offline.
          </li>
          <li>
            <strong className="text-foreground">Authorizations are real control.</strong> While an
            authorization is active, Seeds can settle trades within its cap — that's the point. The
            cap and the clock bound exactly what that can mean, and expiry is destructive, not
            decorative.
          </li>
          <li>
            <strong className="text-foreground">Settlement is on-chain.</strong> Every fill produces
            real transactions you can verify on the relevant explorer. Nothing is an internal ledger
            entry pretending to be crypto.
          </li>
        </ul>
      </section>

      {/* CTA */}
      <section className="mt-16 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Link
          to="/auth"
          className="rounded-sm bg-primary px-5 py-2.5 font-mono text-xs font-semibold tracking-widest text-primary-foreground uppercase transition-opacity hover:opacity-90"
        >
          <Lock className="mr-2 inline h-3.5 w-3.5" /> Open your vault
        </Link>
        <Link
          to="/custody"
          className="rounded-sm border border-border px-5 py-2.5 font-mono text-xs tracking-widest text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
        >
          <Clock className="mr-2 inline h-3.5 w-3.5" /> Watch the custody ledger
        </Link>
      </section>
    </main>
  );
}
