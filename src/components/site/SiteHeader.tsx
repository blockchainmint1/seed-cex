import { Link, useNavigate } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/hooks/use-theme";

const nav = [
  { label: "Markets", to: "/trade/tsd-txc" },
  { label: "Wallet", to: "/wallet" },
  { label: "How it works", to: "/how-it-works" },
  { label: "API", to: "/api-docs" },
  { label: "Manifesto", to: "/manifesto" },
] as const;

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
          {user ? (
            <Link
              to="/trades"
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              Trades
            </Link>
          ) : null}
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-primary" }}
            >
              {n.label}
            </Link>
          ))}
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
              <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
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
