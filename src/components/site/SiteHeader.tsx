import { Link, useLocation } from "@tanstack/react-router";
import { signOutOfSeeds } from "@/lib/sign-out";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronDown, Menu, Moon, Sun, UserRound, X } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/hooks/use-theme";
import { SiteLogo } from "@/components/site/SiteLogo";


const about = [
  { label: "How it works", to: "/how-it-works" as const },
  { label: "Texas Stable Dollar", to: "/tsd" as const },
  { label: "Manifesto", to: "/manifesto" as const },
  { label: "No KYC", to: "/about/kyc" as const },
];

const proof = [
  { label: "Our code", to: "/proof/code" as const },
  { label: "Custody ledger", to: "/custody" as const },
  { label: "Stats", to: "/stats" as const },
];

function NavMenu({ label, items }: { label: string; items: { label: string; to: string }[] }) {
  return (
    <div className="group relative">
      <button className="flex items-center gap-1 text-muted-foreground transition-colors group-hover:text-foreground">
        {label}
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      <div className="invisible absolute left-0 top-full z-50 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
        <div className="min-w-48 rounded-lg border border-border bg-popover p-1 shadow-lg normal-case tracking-normal">
          {items.map((i) => (
            <Link
              key={i.to}
              to={i.to as "/custody"}
              className="block rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {i.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { user, loading } = useSession();
  const { theme, toggle } = useTheme();
  const qc = useQueryClient();
  const pathname = useLocation({ select: (l) => l.pathname });
  // Signing in from any page (e.g. /register?ref=…) brings the visitor back
  // to that exact page; /auth remembers it before leaving for Honest.Money.
  const here = useLocation({ select: (l) => l.href });
  const signInSearch = pathname === "/auth" || pathname === "/sso" ? undefined : { redirect: here };

  const signOut = () => signOutOfSeeds(qc);

  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  const phoneLinks = [
    { label: "Markets", to: "/markets" },
    { label: "P2P", to: "/p2p" },
    { label: "Swap", to: "/swap" },
    { label: "AI", to: "/ai" },
    // Activity always shows (signed-out visitors are sent to sign in and come
    // back), so the menu never shifts once the browser finds the session.
    { label: "Activity", to: "/activity" },
    ...(user ? [{ label: "Profile", to: "/account" }] : []),
    { label: "Help", to: "/help" },
    ...about,
    ...proof,
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-7 px-5">
        <Link to="/" className="flex shrink-0 items-center" aria-label="Seeds home">
          <SiteLogo />
        </Link>

        <nav className="hidden items-center gap-5 text-[13px] font-semibold tracking-[0.04em] uppercase lg:flex">
          {/* Like an exchange's top bar: Markets stays lit on every market and trade page. */}
          <Link
            to="/markets"
            className={`transition-colors hover:text-foreground ${pathname.startsWith("/trade/") ? "text-primary" : "text-muted-foreground"}`}
            activeProps={{ className: "text-primary" }}
          >
            Markets
          </Link>
          <Link
            to="/p2p"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            P2P
          </Link>
          <Link
            to="/swap"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            Swap
          </Link>
          <Link
            to="/ai"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            AI
          </Link>
          <Link
            to="/activity"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            Activity
          </Link>
          <NavMenu label="ABOUT" items={about} />
          <NavMenu label="PROOF" items={proof} />
          <Link
            to="/help"
            className={`transition-colors hover:text-foreground ${pathname.startsWith("/help") ? "text-primary" : "text-muted-foreground"}`}
          >
            Help
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[13px] font-semibold">
          {loading ? null : user ? (
            <>
              <Link
                to="/account"
                className="hidden items-center gap-1.5 rounded-sm border border-primary/50 px-3 py-2 tracking-[0.04em] text-primary uppercase transition-colors hover:bg-primary/10 sm:inline-flex sm:px-3.5"
              >
                <UserRound className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                Profile
              </Link>
              <button
                onClick={signOut}
                className="whitespace-nowrap tracking-[0.04em] text-muted-foreground uppercase transition-colors hover:text-foreground"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              search={signInSearch}
              className="whitespace-nowrap rounded-sm bg-action px-3 py-2 tracking-[0.04em] sm:px-3.5 text-action-foreground uppercase transition-[filter] hover:brightness-105"
            >
              Sign in
            </Link>
          )}
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={1.5} /> : <Moon className="h-4 w-4" strokeWidth={1.5} />}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border text-foreground lg:hidden"
          >
            {menuOpen ? <X className="h-4 w-4" strokeWidth={1.5} /> : <Menu className="h-4 w-4" strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      {menuOpen ? (
        <nav className="border-t border-border bg-background lg:hidden" aria-label="Site">
          <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-1 px-5 py-4 text-sm font-semibold">
            {phoneLinks.map((l) => (
              <li key={l.to}>
                <Link
                  to={l.to}
                  className="block rounded-sm px-3 py-2.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  activeProps={{ className: "text-primary" }}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
