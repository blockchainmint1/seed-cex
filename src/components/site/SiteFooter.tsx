import { Link } from "@tanstack/react-router";
import { SiteLogo } from "@/components/site/SiteLogo";

type FooterLink = { label: string; to?: string; href?: string };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Trade",
    links: [
      { label: "Markets", to: "/trade/tsd-txc" },
      { label: "P2P", to: "/p2p" },
      { label: "Swap", to: "/swap" },
      { label: "Seeds AI", to: "/ai" },
      { label: "TSD", to: "/tsd" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { label: "Ignite", to: "/register" },
      { label: "How it works", to: "/how-it-works" },
      { label: "Manifesto", to: "/manifesto" },
      { label: "API", to: "/api" },
      { label: "TXC Docs", href: "https://texitcoin.org/build" },
    ],
  },
  {
    heading: "Proof",
    links: [
      { label: "Our code", to: "/proof/code" },
      { label: "Custody Ledger", to: "/custody" },
      { label: "Stats", to: "/stats" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms", to: "/terms" },
      { label: "Privacy", to: "/privacy" },
      { label: "Risk", to: "/risk" },
      { label: "No KYC", to: "/about/kyc" },
    ],
  },
];

const linkClass = "text-sm text-muted-foreground transition-colors hover:text-primary";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <SiteLogo className="h-[34px]" />
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

        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {columns.map((col) => (
            <div key={col.heading}>
              <p className="font-mono text-[11px] tracking-[0.2em] text-foreground uppercase">
                {col.heading}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.to} className={linkClass}>
                        {l.label}
                      </Link>
                    ) : (
                      <a href={l.href} target="_blank" rel="noreferrer noopener" className={linkClass}>
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}
