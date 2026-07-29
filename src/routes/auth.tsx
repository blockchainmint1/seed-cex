import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { requestWalletChallenge, verifyWalletSignature } from "@/lib/wallet-auth.functions";
import { z } from "zod";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — Seeds Non-Custodial Exchange" },
      {
        name: "description",
        content:
          "Sign in to Seeds with your Ethereum wallet or a magic link. No password, no deposits, no custody.",
      },
      { property: "og:title", content: "Sign In — Seeds Non-Custodial Exchange" },
      {
        property: "og:description",
        content: "Wallet signature or magic link. Seeds never takes custody of your funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});

const emailSchema = z.string().trim().email({ message: "Enter a valid email address" }).max(255);

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function injectedProvider(): Eip1193 | null {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth ?? null;
}

function Auth() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"email" | "wallet" | "google" | null>(null);
  const [hasInjected, setHasInjected] = useState(false);
  const { user, loading } = useSession();
  const navigate = useNavigate();

  const challenge = useServerFn(requestWalletChallenge);
  const verify = useServerFn(verifyWalletSignature);

  useEffect(() => setHasInjected(injectedProvider() !== null), []);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/wallet" });
  }, [loading, user, navigate]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    setBusy("email");
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: { emailRedirectTo: `${window.location.origin}/wallet` },
      });
      if (err) throw err;
      setNotice("Check your inbox — the link signs you straight in. No password to remember.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link");
    } finally {
      setBusy(null);
    }
  }

  async function signInWithWallet() {
    setError(null);
    setNotice(null);
    const provider = injectedProvider();
    if (!provider) {
      setError("No browser wallet detected. Use a magic link instead.");
      return;
    }

    setBusy("wallet");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("No account was shared");

      const { statement, nonce } = await challenge({ data: { address } });
      const signature = (await provider.request({
        method: "personal_sign",
        params: [statement, address],
      })) as string;

      const { tokenHash } = await verify({ data: { address, nonce, signature } });
      const { error: err } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash: tokenHash,
      });
      if (err) throw err;
      navigate({ to: "/wallet" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wallet sign-in failed";
      setError(/user rejected/i.test(message) ? "You cancelled the signature." : message);
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setError(null);
    setBusy("google");
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        setError("Google sign-in failed. Try a wallet or magic link instead.");
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/wallet" });
    } catch {
      setError("Google sign-in is unavailable right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
        No deposits · no custody
      </p>
      <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground uppercase">
        Sign in to Seeds
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Prove who you are with a wallet signature, or get a one-time link by email. Signing in moves
        nothing and authorizes nothing — that is a separate, capped, expiring decision you make on
        the wallet page.
      </p>

      {error ? (
        <p className="mt-6 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-6 rounded-sm border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
          {notice}
        </p>
      ) : null}

      <button
        onClick={signInWithWallet}
        disabled={busy !== null}
        className="mt-8 w-full rounded-sm bg-primary px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
      >
        {busy === "wallet" ? "Waiting for signature…" : "Sign in with wallet"}
      </button>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {hasInjected
          ? "Ethereum, Base, or BNB Chain wallet — signature only, no gas."
          : "No browser wallet detected on this device."}
      </p>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={sendMagicLink} className="space-y-3">
        <label
          htmlFor="email"
          className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase"
        >
          Magic link
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={255}
          placeholder="you@example.com"
          className="w-full rounded-sm border border-input bg-surface px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="w-full rounded-sm border border-border px-4 py-3 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {busy === "email" ? "Sending…" : "Email me a link"}
        </button>
      </form>

      <button
        onClick={google}
        disabled={busy !== null}
        className="mt-3 w-full rounded-sm border border-border px-4 py-3 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
      >
        Continue with Google
      </button>
    </div>
  );
}
