import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { rememberReturnPath, takeReturnPath } from "@/lib/return-path";

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign In — Seeds Non-Custodial Exchange" },
      {
        name: "description",
        content:
          "Sign in to Seeds with your Honest.Money member login. No deposits, no custody.",
      },
      { property: "og:title", content: "Sign In — Seeds Non-Custodial Exchange" },
      {
        property: "og:description",
        content: "One Honest.Money login. Seeds never takes custody of your funds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Auth,
});

function Auth() {
  const [error, setError] = useState<string | null>(null);
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  // The page the visitor came from (e.g. /register) rides along as
  // ?redirect= and is remembered before they leave for Honest.Money.
  useEffect(() => {
    if (redirect) rememberReturnPath(redirect);
  }, [redirect]);

  // Two signals say "signed in": this tab seeing the new session, and the
  // popup's "done" message. Leave exactly once, or the second one would
  // overwrite the first (that is how /register visitors ended up on Profile).
  const left = useRef(false);
  const msgListener = useRef<((ev: MessageEvent) => void) | null>(null);
  const goBack = useCallback(() => {
    if (left.current) return;
    left.current = true;
    if (msgListener.current) window.removeEventListener("message", msgListener.current);
    navigate({ href: takeReturnPath(), replace: true });
  }, [navigate]);
  useEffect(() => () => {
    if (msgListener.current) window.removeEventListener("message", msgListener.current);
  }, []);

  useEffect(() => {
    if (!loading && user) goBack();
  }, [loading, user, goBack]);

  function honestMoney() {
    setError(null);
    if (redirect) rememberReturnPath(redirect);
    const returnTo = `${window.location.origin}/sso`;
    // After a deliberate sign-out, force the sign-in box even if an
    // honest.money session somehow survives (HME sign-out rule #2).
    let prompt = "";
    try {
      if (sessionStorage.getItem("seeds-signed-out")) {
        prompt = "&prompt=login";
        sessionStorage.removeItem("seeds-signed-out");
      }
    } catch {
      /* private mode — best effort */
    }
    const url = `https://honest.money/sso-login?popup=1${prompt}&return_to=${encodeURIComponent(returnTo)}`;
    const w = window.open(url, "hm-sso", "width=440,height=720");
    if (!w) {
      window.location.href = url.replace("popup=1&", "");
      return;
    }
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== "seeds-sso-done") return;
      goBack();
    };
    if (msgListener.current) window.removeEventListener("message", msgListener.current);
    msgListener.current = onMsg;
    window.addEventListener("message", onMsg);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-16">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
        No deposits · no custody
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground">
        Sign in to Seeds
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Use your existing Honest.Money member login. New here? Join at Honest.Money first. Signing
        in moves nothing and authorizes nothing.
      </p>

      {error ? (
        <p className="mt-6 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <button
        onClick={honestMoney}
        className="mt-8 w-full rounded-md bg-action px-4 py-3 text-sm font-semibold text-action-foreground"
      >
        Sign in with Honest.Money
      </button>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        One member login across the Honest.Money ecosystem.
      </p>

      <div className="mt-8 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">Got a Cold Storage Coin, HME Vault, or your own wallet?</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Link to="/key-signin" search={{ kind: "coin" }} className="rounded-md border border-border px-4 py-3 text-center text-sm font-semibold hover:border-primary">
            Start with a coin
          </Link>
          <Link to="/key-signin" search={{ kind: "vault" }} className="rounded-md border border-border px-4 py-3 text-center text-sm font-semibold hover:border-primary">
            Use HME Vault
          </Link>
          <Link to="/key-signin" search={{ kind: "wallet" }} className="rounded-md border border-border px-4 py-3 text-center text-sm font-semibold hover:border-primary">
            Use another wallet
          </Link>
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          HME Vault, MetaMask, Ledger, Trezor, Phantom and phone wallets. Seeds never sees your recovery phrase.
        </p>
      </div>
    </div>
  );
}

