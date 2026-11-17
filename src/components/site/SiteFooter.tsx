import { Link } from "@tanstack/react-router";
import { SiteLogo } from "@/components/site/SiteLogo";

const links = [
  { label: "Swap", to: "/swap" },
  { label: "How it works", to: "/how-it-works" },
  { label: "TSD", to: "/tsd" },
  { label: "Manifesto", to: "/manifesto" },
  { label: "LocalBitcoins report", to: "/lbtc" },
  { label: "API", to: "/api-docs" },
  { label: "Our code", to: "/proof/code" },
  { label: "Custody Ledger", to: "/custody" },
  { label: "Stats", to: "/stats" },
  { label: "Terms", to: "/terms" },
  { label: "Privacy", to: "/privacy" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <SiteLogo className="h-[34px]" />
          <p className="text-[13px] font-medium text-muted-foreground">Powered by the Honest Money Ecosystem</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Non-custodial crypto trading. Trades settle directly between traders' own wallets.
          </p>
          <p className="text-sm text-muted-foreground">
            Part of the{" "}
            <a
              href="https://honest.money"
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              honest.money
            </a>{" "}
            ecosystem.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs tracking-wider uppercase">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://texitcoin.org/build"
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            TXC Docs
          </a>
        </nav>
      </div>
      <div className="border-t border-border/60 py-4">
        <p className="mx-auto max-w-7xl px-5 font-mono text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Seeds. Trading digital assets carries risk. Seeds never
          stores an unencrypted recovery phrase.
        </p>
      </div>
    </footer>
  );
}
