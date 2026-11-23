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
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "How Seeds Works — Non-Custodial Exchange with HME Wallet" },
      {
        name: "description",
        content:
          "Seeds is an exchange with no deposits. You sign in with Honest.Money and link a separate trading pocket from HME Wallet. Your recovery phrase and savings never leave your phone.",
      },
      { property: "og:title", content: "How Seeds Works — No Deposits, Ever" },
      {
        property: "og:description",
        content:
          "Sign in with Honest.Money, link your HME Wallet trading pocket, and trade wallet to wallet. Seeds never sees your recovery phrase or your savings.",
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
    title: "Sign in with Honest.Money",
    body: "Seeds uses your Honest.Money membership login. There is no separate Seeds password, and Seeds never creates, imports or stores a recovery phrase. Your wallet lives in HME Wallet on your phone.",
  },
  {
    icon: Wallet,
    title: "Savings and a separate trading pocket",
    body: "HME Wallet keeps your savings apart from a trading pocket made just for Seeds (always pocket 1106 on TEXITcoin, also after a revoke and re-link). Seeds never receives savings keys.",
  },
  {
    icon: KeyRound,
    title: "Link the pocket with a QR code",
    body: "Turn on two-factor, then scan a 10-minute QR code in HME Wallet. Choose instant access until you revoke it, or approve every trade in HME Wallet so Seeds holds no key at all. Linking moves no coins.",
  },
  {
    icon: ArrowLeftRight,
    title: "Trade on a real order book",
    body: "Place limit or market orders and tap Approve in Telegram once. From then on every match settles by itself: each pocket sends its side on the blockchain — a real, signed transaction with a real txid — until the order fills or you cancel it.",
  },
  {
    icon: Flame,
    title: "Revoke any time → the key is deleted",
    body: "Revoke on Seeds (or with the Telegram button) and Seeds' trading key for your pocket is deleted and waiting requests are cancelled. Your coins stay in your pocket. Revoke in HME Wallet too to retire that pocket.",
  },
  {
    icon: Eye,
    title: "We prove what we hold, publicly",
    body: "The Custody Ledger publishes how many trading keys Seeds holds and how many have been deleted — counts only. No addresses, no balances, no member data.",
  },
];

const contrasts = [
  {
    theirs: "You deposit funds into the exchange's omnibus wallet.",
    ours: "No deposits. Coins stay in your own HME Wallet trading pocket.",
  },
  {
    theirs: "They hold 100% of your balance, for as long as you use them.",
    ours: "Seeds can only reach the trading pocket you link, and only until you revoke.",
  },
  {
    theirs: "Withdrawals are a permission slip you request from them.",
    ours: "Most coins leave straight from HME Wallet. Every send from your pocket needs your Telegram tap.",
  },
  {
    theirs: "A breach or insolvency can mean total loss (see: Mt. Gox, FTX, Celsius…).",
    ours: "Seeds never holds your recovery phrase or savings keys, so a breach can't reach them.",
  },
  {
    theirs: "You must trust their solvency attestations.",
    ours: "You can check every settlement on-chain, and our key counts are public.",
  },
];

function HowItWorks() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      {/* Hero */}
      <header className="max-w-3xl space-y-5">
        <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">How it works</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          An exchange with no deposits.
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Every centralized exchange asks you to hand over your coins first. Seeds never does. Your
          wallet and recovery phrase stay in HME Wallet on your phone; you link one separate trading
          pocket to Seeds, and you can cut that link at any time.
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

      {/* Wallet diagram */}
      <section className="mt-16 rounded-md border border-border bg-surface p-6 sm:p-8">
        <h2 className="font-display text-xl font-bold text-foreground">
          One wallet, two separate parts
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Your HME Wallet recovery phrase creates both your savings and your trading pocket. Seeds
          only ever sees the trading pocket you link. Your savings are out of its reach.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-sm border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
{`HME Wallet recovery phrase (stays on your phone, never sent to Seeds)
├── SAVINGS
│    └─ yours alone. Seeds never receives these keys.
└── TRADING POCKET (TEXITcoin m/44'/696969'/1106'/…, always)
     ├─ linked to Seeds by QR code: instant access or approve every trade
     ├─ every coin that leaves needs your Telegram tap
     └─ revoke on Seeds → Seeds' trading key is deleted`}
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
            <strong className="text-foreground">Your HME Wallet recovery phrase is your root of trust.</strong>{" "}
            Lose it and no one — including us — can recover your funds. Write it down. Keep it
            offline. Seeds will never ask for it.
          </li>
          <li>
            <strong className="text-foreground">Instant access is real control.</strong> While an
            instant-access link is active, Seeds keeps an encrypted key for your trading pocket so
            trades can settle. Choose approve-every-trade if you'd rather Seeds hold no key at all.
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
          className="rounded-md bg-action px-5 py-2.5 text-sm font-semibold text-action-foreground transition-opacity hover:opacity-90"
        >
          <Lock className="mr-2 inline h-3.5 w-3.5" /> Sign in with Honest.Money
        </Link>
        <Link
          to="/custody"
          className="rounded-sm border border-border px-5 py-2.5 font-mono text-xs tracking-widest text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
        >
          <Clock className="mr-2 inline h-3.5 w-3.5" /> Watch the custody ledger
        </Link>
      </section>
    </div>
  );
}
