import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";

export const Route = createFileRoute("/auth")({
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

  useEffect(() => {
    if (!loading && user) navigate({ to: "/wallet" });
  }, [loading, user, navigate]);

  function honestMoney() {
    setError(null);
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
      window.removeEventListener("message", onMsg);
      navigate({ to: "/wallet" });
    };
    window.addEventListener("message", onMsg);
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
        Use your Honest.Money member login. New here? You can create one in the same window. Signing
        in moves nothing and authorizes nothing.
      </p>

      {error ? (
        <p className="mt-6 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <button
        onClick={honestMoney}
        className="mt-8 w-full rounded-sm bg-primary px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase"
      >
        Sign in with Honest.Money
      </button>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        One member login across the Honest.Money ecosystem.
      </p>
    </div>
  );
}
