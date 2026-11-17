import { Link, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/hooks/use-theme";
import { SiteLogo } from "@/components/site/SiteLogo";


const about = [
  { label: "How it works", to: "/how-it-works" as const },
  { label: "Texas Stable Dollar", to: "/tsd" as const },
  { label: "Manifesto", to: "/manifesto" as const },
  { label: "API", to: "/api-docs" as const },
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

  // Signing in from a public page (e.g. /register) should bring the visitor
  // back to that page instead of dropping them on their profile.
  function rememberReturnPath() {
    if (pathname === "/auth" || pathname === "/sso") return;
    try {
      sessionStorage.setItem("seeds-after-signin", pathname);
    } catch {
      /* private mode — best effort */
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    // Remember this was a deliberate sign-out so the next SSO run forces the
    // login box (prompt=login) instead of silently re-signing the member in.
    try {
      sessionStorage.setItem("seeds-signed-out", "1");
    } catch {
      /* private mode — best effort */
    }
    await supabase.auth.signOut();
    // HME rule: our sign-out only ends the Seeds session — also end the
    // honest.money one, or the member gets signed right back in.
    window.location.href = `https://honest.money/logout?return_to=${encodeURIComponent(window.location.origin + "/")}`;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-7 px-5">
        <Link to="/" className="flex shrink-0 items-center" aria-label="Seeds home">
          <SiteLogo />
        </Link>

        <nav className="hidden items-center gap-5 text-[13px] font-semibold tracking-[0.04em] uppercase md:flex">
          <Link
            to="/trade/tsd-txc"
            className="text-muted-foreground transition-colors hover:text-foreground"
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
          {user ? (
            <Link
              to="/trades"
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              Trades
            </Link>
          ) : null}
          <NavMenu label="ABOUT" items={about} />
          <NavMenu label="PROOF" items={proof} />
        </nav>

        <div className="ml-auto flex items-center gap-3 text-[13px] font-semibold">
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" strokeWidth={1.5} /> : <Moon className="h-4 w-4" strokeWidth={1.5} />}
          </button>
          {loading ? null : user ? (
            <>
              <Link
                to="/account"
                className="hidden tracking-[0.04em] text-muted-foreground uppercase transition-colors hover:text-foreground sm:inline"
              >
                Profile
              </Link>
              <button
                onClick={signOut}
                className="rounded-sm border border-foreground/60 px-3.5 py-2 tracking-[0.04em] uppercase transition-colors hover:border-foreground"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              onClick={rememberReturnPath}
              className="rounded-sm bg-action px-3.5 py-2 tracking-[0.04em] text-action-foreground uppercase transition-[filter] hover:brightness-105"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
