import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { redeemHonestMoneyToken } from "@/lib/hm-sso.functions";

export const Route = createFileRoute("/sso")({
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
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return setError("Missing sign-in ticket.");
    (async () => {
      try {
        const { tokenHash } = await redeem({ data: { token } });
        const { error: err } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
        if (err) throw err;
        if (popup === "1" && window.opener) {
          window.opener.postMessage({ type: "seeds-sso-done" }, window.location.origin);
          window.close();
          return;
        }
        navigate({ to: "/wallet" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
  }, [token, popup, redeem, navigate]);

  return (
    <div className="mx-auto max-w-md px-5 py-24 text-center">
      {error ? (
        <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">{error}</p>
      ) : (
        <p className="font-mono text-sm text-muted-foreground">Signing you in with Honest.Money…</p>
      )}
    </div>
  );
}
