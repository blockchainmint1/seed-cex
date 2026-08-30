import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/hooks/use-theme";

const about = [
  { label: "How it works", to: "/how-it-works" as const },
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
        <ChevronDown className="h-3 w-3" />
      </button>
      <div className="invisible absolute left-0 top-full z-50 pt-3 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100">
        <div className="min-w-44 rounded-sm border border-border bg-background p-1 shadow-lg">
          {items.map((i) => (
            <Link
              key={i.to}
              to={i.to as "/custody"}
              className="block rounded-sm px-3 py-2 text-muted-foreground transition-colors hover:bg-surface hover:text-primary"
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
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
        <Link to="/" className="flex items-center gap-2">
          <span
            className="block h-2.5 w-2.5 rounded-full bg-primary"
            style={{ boxShadow: "0 0 12px var(--primary)" }}
            aria-hidden
          />
          <span className="font-display text-base font-extrabold tracking-[0.28em] uppercase">
            Seeds
          </span>
        </Link>

        <nav className="hidden items-center gap-5 font-mono text-xs tracking-wider uppercase md:flex">
          <Link
            to="/trade/tsd-txc"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            Markets
          </Link>
          <Link
            to="/wallet"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            Wallet
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
          <NavMenu label="About" items={about} />
          <NavMenu label="Proof" items={proof} />
        </nav>

        <div className="ml-auto flex items-center gap-3 font-mono text-xs">
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          {loading ? null : user ? (
            <>
              <Link
                to="/account"
                className="hidden text-muted-foreground transition-colors hover:text-primary sm:inline"
              >
                {user.email}
              </Link>
              <button
                onClick={signOut}
                className="rounded-sm border border-border px-3 py-1.5 tracking-wider uppercase transition-colors hover:border-primary hover:text-primary"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="rounded-sm bg-primary px-3 py-1.5 font-semibold tracking-wider text-primary-foreground uppercase transition-opacity hover:opacity-90"
            >
              Open vault
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
