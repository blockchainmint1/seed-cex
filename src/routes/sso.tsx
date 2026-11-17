import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { redeemHonestMoneyToken } from "@/lib/hm-sso.functions";
import { takeReturnPath } from "@/lib/return-path";

export const Route = createFileRoute("/sso")({
  staticData: { sitemap: false },
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { token?: string; popup?: string } => ({
    token: typeof s.token === "string" ? s.token : undefined,
    popup: s.popup != null ? String(s.popup) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Signing in — Seeds Exchange" },
      { name: "description", content: "Finishing your Honest.Money sign-in to Seeds." },
      { property: "og:title", content: "Signing in — Seeds Exchange" },
      { property: "og:description", content: "Finishing your Honest.Money sign-in to Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Sso,
});

function Sso() {
  const { token, popup } = Route.useSearch();
  const redeem = useServerFn(redeemHonestMoneyToken);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [legacy, setLegacy] = useState<{ state: "sent" | "limited" | "failed"; to: string } | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return setError("Missing sign-in ticket.");
    (async () => {
      try {
        const ref = (window as unknown as { honestMoney?: { ref: () => string } }).honestMoney?.ref?.() || undefined;
        const r = await redeem({ data: { token, ref } });
        if (!r.tokenHash) return setLegacy({ state: r.legacy ?? "failed", to: r.to ?? "your email" });
        const { error: err } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
        if (err) throw err;
        if (popup === "1" && window.opener) {
          window.opener.postMessage({ type: "seeds-sso-done" }, window.location.origin);
          window.close();
          return;
        }
        navigate({ href: takeReturnPath(), replace: true });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
  }, [token, popup, redeem, navigate]);

  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      {legacy ? (
        <LegacyNotice {...legacy} />
      ) : error ? (
        <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">{error}</p>
      ) : (
        <p className="font-mono text-sm text-muted-foreground">Signing you in with Honest.Money…</p>
      )}
    </div>
  );
}

function LegacyNotice({ state, to }: { state: "sent" | "limited" | "failed"; to: string }) {
  const title = state === "failed" ? "We couldn't send your link." : "Check your email.";
  const body =
    state === "sent"
      ? `We found an older Seeds account under ${to}. We just emailed that address a link to join it to your Honest.Money membership. It works once, for 30 minutes.`
      : state === "limited"
        ? `We've already emailed ${to} a link to join your older Seeds account. Use the newest one. If it expired, wait an hour and sign in again.`
        : "We found an older Seeds account under your email but couldn't send the link just now. Try signing in again in a few minutes, or contact support@honest.money.";
  return (
    <div className="rounded-sm border border-primary/40 bg-card px-5 py-6 text-left">
      <p className="font-mono text-xs uppercase tracking-widest text-primary">Older account found</p>
      <h1 className="mt-2 text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{body}</p>
      <p className="mt-3 text-sm text-muted-foreground">After you click it, sign in with Honest.Money again and your history and saved wallet will be there.</p>
    </div>
  );
}

