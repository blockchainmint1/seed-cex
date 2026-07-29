import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Open Your Vault — Seeds" },
      {
        name: "description",
        content:
          "Sign in or create a Seeds account to open a browser-encrypted USDC/TXC wallet vault.",
      },
      { property: "og:title", content: "Open Your Vault — Seeds" },
      {
        property: "og:description",
        content: "Sign in or create a Seeds account to open a browser-encrypted wallet vault.",
      },
    ],
  }),
  component: Auth,
});

const schema = z.object({
  email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(200, { message: "Password is too long" }),
});

function Auth() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/wallet" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: `${window.location.origin}/wallet` },
        });
        if (err) throw err;
        setNotice("Account created. If confirmation is required, check your email.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (err) throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError(null);
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError("Google sign-in failed. Try email instead.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/wallet" });
    } catch {
      setError("Google sign-in is unavailable right now.");
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
        {mode === "signin" ? "Welcome back" : "New vault"}
      </p>
      <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground uppercase">
        {mode === "signin" ? "Open your vault" : "Create an account"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        This account unlocks the exchange. Your wallet gets its own separate password — one we never
        see and cannot reset.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={200}
            className="mt-1 w-full rounded-sm border border-input bg-surface px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {error ? (
          <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-sm border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
            {notice}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-sm bg-primary px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
        >
          {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        onClick={google}
        className="w-full rounded-sm border border-border px-4 py-3 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
      >
        Continue with Google
      </button>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
        className="mt-6 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
      >
        {mode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
