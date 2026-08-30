import { createFileRoute, Link } from "@tanstack/react-router";
import { Github, ExternalLink, ShieldCheck, Code2, Lock } from "lucide-react";

export const Route = createFileRoute("/proof/code")({
  head: () => ({
    meta: [
      { title: "Our Code — What Seeds Runs and How to Check It" },
      {
        name: "description",
        content:
          "The derivation paths, signing rules and settlement logic Seeds runs, plus the public endpoints and on-chain records anyone can verify independently.",
      },
      { property: "og:title", content: "Our Code — What Seeds Runs" },
      {
        property: "og:description",
        content: "Derivation paths, signing rules, settlement logic and how to verify all of it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CodePage,
});

const facts: { k: string; v: string }[] = [
  { k: "Seed standard", v: "BIP-39, 12 or 24 words, generated or imported in your browser" },
  { k: "Vault encryption", v: "PBKDF2-SHA256 → AES-256-GCM. Ciphertext only ever leaves the browser" },
  { k: "TXC / TSD savings branch", v: "m/44'/696969'/0'/0/0 — Seeds never sees this key" },
  { k: "Shared trading branch", v: "m/44'/696969'/9'/0/0 — the only branch you can delegate" },
  { k: "TEXITcoin coin type", v: "SLIP-0044 696969, address version byte 66" },
  { k: "TSD", v: "Omni Layer property #39 on TEXITcoin, Omni Core 0.9.1" },
  { k: "EVM branch", v: "One address shared across Ethereum, Base, BNB Chain and ZeroChill" },
  { k: "Authorization", v: "Per-asset cap + expiry. The key material is deleted at expiry, not flagged" },
  { k: "Settlement", v: "Seller signs to the buyer's address directly. Seeds never holds a pooled balance" },
  { k: "API keys", v: "Read and trade scopes only. There is no withdrawal endpoint to abuse" },
];

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-4 md:grid-cols-[220px_1fr] md:gap-6">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{k}</p>
      <p className="text-sm text-foreground">{v}</p>
    </div>
  );
}

function CodePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-5 py-14">
      <header className="space-y-3">
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Proof</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Our code</h1>
        <p className="max-w-2xl text-muted-foreground">
          A non-custodial exchange only means something if you can check it. Here is exactly what
          Seeds runs, and the independent places you can go to confirm we are telling the truth.
        </p>
      </header>

      <section className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 md:p-10">
        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verify before you trust
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Our code is public. Our claims are checkable.
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Seeds runs the same open logic whether you read it here, in the repo, or on-chain. Clone it, audit the derivation and settlement paths, and run it against your own node.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://github.com/blockchainmint1/seed-cex"
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
              >
                <Github className="h-4 w-4" />
                View on GitHub
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
              <Link
                to="/custody"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface/80"
              >
                <Lock className="h-4 w-4" />
                Custody ledger
              </Link>
            </div>
          </div>

          <div className="hidden md:block">
            <div className="rounded-lg border border-border bg-surface/80 p-5 shadow-sm backdrop-blur">
              <Code2 className="h-10 w-10 text-primary" />
              <p className="mt-3 font-mono text-xs text-muted-foreground">github.com/blockchainmint1</p>
              <p className="font-mono text-sm font-semibold text-foreground">/seed-cex</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold">What the software does</h2>
        <div className="mt-4">
          {facts.map((f) => (
            <Row key={f.k} {...f} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold">How to verify it yourself</h2>
        <ol className="space-y-3 text-sm text-muted-foreground">
          <li>
            <span className="text-foreground">1. Derive the addresses offline.</span> Put your seed
            into any standard BIP-39 tool, use the paths above, and confirm they match the addresses
            Seeds shows you. If they match, we are only ever touching the branch you delegated.
          </li>
          <li>
            <span className="text-foreground">2. Watch the chain, not our database.</span> Every
            settlement is a real transaction. Open the txid on{" "}
            <a
              className="text-primary hover:underline"
              href="https://mempool.texitcoin.org"
              target="_blank"
              rel="noreferrer noopener"
            >
              mempool.texitcoin.org
            </a>{" "}
            or the relevant EVM explorer and check the sender and receiver are the two traders.
          </li>
          <li>
            <span className="text-foreground">3. Count our keys.</span> The{" "}
            <Link to="/custody" className="text-primary hover:underline">
              custody ledger
            </Link>{" "}
            publishes how many delegated keys exist right now and how many were wiped on expiry.
          </li>
          <li>
            <span className="text-foreground">4. Read the market data raw.</span> Our{" "}
            <Link to="/api-docs" className="text-primary hover:underline">
              public API
            </Link>{" "}
            exposes depth, trades and klines with no key, so the book you see is the book bots see.
          </li>
          <li>
            <span className="text-foreground">5. Sweep at any time.</span> Revoke an authorization
            and move funds back to your savings branch. Nothing on our side can stop it — we do not
            hold your savings key.
          </li>
        </ol>
      </section>

      <section className="rounded-sm border border-border bg-surface p-6">
        <h2 className="font-display text-lg font-bold">Learn the underlying chain</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything about the TEXITcoin blockchain and the Omni layer 2 that carries TSD is
          documented at{" "}
          <a
            className="text-primary hover:underline"
            href="https://texitcoin.org/build"
            target="_blank"
            rel="noreferrer noopener"
          >
            texitcoin.org/build
          </a>
          .
        </p>
      </section>
    </div>
  );
}
