import { Link } from "@tanstack/react-router";

const links = [
  { label: "How it works", to: "/how-it-works" },
  { label: "Terms", to: "/terms" },
  { label: "Privacy", to: "/privacy" },
  { label: "Manifesto", to: "/manifesto" },
  { label: "Custody Ledger", to: "/custody" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="font-display text-sm font-semibold tracking-[0.22em] text-foreground uppercase">
            Seeds
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Non-custodial USDC/TXC settlement. Your keys never leave your browser unencrypted.
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
      <div className="border-t border-border/60 px-5 py-4">
        <p className="mx-auto max-w-7xl font-mono text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} Seeds. Trading digital assets carries risk. Seeds never
          stores an unencrypted recovery phrase.
        </p>
      </div>
    </footer>
  );
}
