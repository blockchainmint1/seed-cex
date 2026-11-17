import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { confirmLegacyLink } from "@/lib/legacy-claim.functions";
import { CLAIM_TOKEN_RE } from "@/lib/legacy-claim";

export const Route = createFileRoute("/link-account")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({ token: typeof s.token === "string" ? s.token : undefined }),
  head: () => ({
    meta: [
      { title: "Link your older account — Seeds" },
      { name: "description", content: "Join your older Seeds account to your Honest.Money membership." },
      { property: "og:title", content: "Link your older account — Seeds" },
      { property: "og:description", content: "Join your older Seeds account to your Honest.Money membership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: LinkAccount,
});

function LinkAccount() {
  const { token } = Route.useSearch();
  const confirm = useServerFn(confirmLegacyLink);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const valid = !!token && CLAIM_TOKEN_RE.test(token);

  async function go() {
    if (!token) return;
    setState("busy");
    setError(null);
    try {
      const r = await confirm({ data: { token } });
      if (r.ok) setState("done");
      else { setError(r.message); setState("idle"); }
    } catch {
      setError("Could not link your account. Try again, or contact support@honest.money.");
      setState("idle");
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-20">
      <div className="rounded-sm border border-primary/40 bg-card px-6 py-7">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Link your older account</p>
        {state === "done" ? (
          <>
            <h1 className="mt-2 text-2xl font-semibold">You're linked.</h1>
            <p className="mt-3 text-sm text-muted-foreground">Your older Seeds account is now joined to your Honest.Money membership. Your order history, trades and saved wallet carry over. Sign in with Honest.Money to continue.</p>
            <Link to="/auth" className="mt-6 inline-flex w-full items-center justify-center rounded-sm bg-primary px-4 py-3 font-mono text-sm font-semibold uppercase tracking-widest text-primary-foreground">Sign in with Honest.Money</Link>
          </>
        ) : !valid ? (
          <>
            <h1 className="mt-2 text-2xl font-semibold">This link isn't complete.</h1>
            <p className="mt-3 text-sm text-muted-foreground">Open the button in your email again, or sign in with Honest.Money and we'll send a fresh link.</p>
            <Link to="/auth" className="mt-6 inline-flex w-full items-center justify-center rounded-sm border border-border px-4 py-3 font-mono text-sm uppercase tracking-widest">Sign in with Honest.Money</Link>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-semibold">Is this your account?</h1>
            <p className="mt-3 text-sm text-muted-foreground">You signed in with Honest.Money, and your email already had a Seeds account from before. Linking joins them for good: your history and saved wallet carry over, and you'll sign in with Honest.Money from now on.</p>
            <p className="mt-3 text-sm text-muted-foreground">If you didn't just sign in to Seeds, close this page. Nothing changes.</p>
            {error && <p className="mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <button onClick={go} disabled={state === "busy"} className="mt-6 w-full rounded-sm bg-primary px-4 py-3 font-mono text-sm font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-60">
              {state === "busy" ? "Linking…" : "Yes, link my account"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
