import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * OAuth approval screen for AI assistants (MCP clients) connecting to Seeds.
 * Sign-in goes through /auth, which remembers this exact URL (with its
 * authorization_id) and brings the member back here after Honest.Money.
 */
export const Route = createFileRoute("/.lovable/oauth/consent")({
  staticData: { sitemap: false },
  // The session lives in the browser; SSR would bounce signed-in members.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Connect an app to Seeds" },
      { name: "description", content: "Approve or cancel an app's read-only connection to your Seeds account." },
      { property: "og:title", content: "Connect an app to Seeds" },
      { property: "og:description", content: "Approve or cancel an app's read-only connection to your Seeds account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its request id. Start the connection again from your app.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { redirect: location.pathname + location.searchStr } });
    }
  },
  loaderDeps: ({ search }) => ({ id: search.authorization_id }),
  loader: async ({ deps }) => {
    const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(deps.id);
    if (error) {
      console.error("[oauth consent] lookup failed", error.message);
      throw new Error("This connection request has expired or isn't valid. Start the connection again from your app.");
    }
    if (!data) throw new Error("Seeds couldn't load this connection request. Try again from your app.");
    if (!("client" in data)) {
      // Already approved before: the sign-in service hands back the app's return address.
      throw redirect({ href: data.redirect_url });
    }
    return data;
  },
  component: Consent,
  pendingComponent: () => <Shell><p className="text-sm text-muted-foreground">Loading the connection request…</p></Shell>,
  errorComponent: ({ error }) => (
    <Shell>
      <p className="font-mono text-[11px] tracking-[0.24em] text-destructive uppercase">Couldn't connect</p>
      <p className="mt-3 text-sm text-foreground">{error instanceof Error ? error.message : String(error)}</p>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <div className="max-w-lg rounded-md border border-border bg-card p-6">{children}</div>
    </div>
  );
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "Share your email address",
  profile: "Share your basic profile",
};

const CAN_SEE = [
  "Live market prices and charts",
  "Your account summary (name, reputation, 2FA and alert settings)",
  "Your own orders, trades and swaps",
  "Your own P2P listings",
];

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = details.client?.name?.trim() || "This app";
  const scopes = (details.scope ?? "").split(/\s+/).filter(Boolean);
  let site = details.redirect_uri;
  try { site = new URL(details.redirect_uri).host || details.redirect_uri; } catch { /* show as given */ }

  async function decide(approve: boolean) {
    setBusy(approve ? "approve" : "deny");
    setError(null);
    const { data, error: err } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorization_id)
      : await supabase.auth.oauth.denyAuthorization(authorization_id);
    if (err || !data?.redirect_url) {
      setBusy(null);
      setError(approve ? "Approving didn't go through. Try again, or start over from your app." : "Cancelling didn't go through. Try again.");
      return;
    }
    window.location.href = data.redirect_url;
  }

  return (
    <Shell>
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">App connection</p>
      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground">
        Connect {client} to Seeds
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        This lets {client} use Seeds as you, read-only. It can look things up, but it can't place orders, change
        settings or move coins.
      </p>

      <dl className="mt-5 space-y-2 rounded-sm border border-border bg-surface p-4 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Signed in as</dt><dd className="break-all text-right text-foreground">{details.user?.email || "your Seeds account"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Sends you back to</dt><dd className="break-all text-right font-mono text-xs text-foreground">{site}</dd></div>
      </dl>

      <p className="mt-5 text-sm font-semibold text-foreground">{client} will be able to see</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {CAN_SEE.map((x) => <li key={x}>{x}</li>)}
        {scopes.map((s) => <li key={s}>{SCOPE_LABELS[s] ?? `Additional permission requested: ${s}`}</li>)}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Seeds' own permissions still apply: it only ever sees your records, never anyone else's. You can stop it any
        time from the app you're connecting.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          disabled={busy !== null}
          onClick={() => decide(true)}
          className="rounded-md bg-action px-4 py-2.5 text-sm font-semibold text-action-foreground disabled:opacity-60"
        >
          {busy === "approve" ? "Connecting…" : `Approve ${client}`}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => decide(false)}
          className="rounded-md border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-60"
        >
          {busy === "deny" ? "Cancelling…" : "Cancel connection"}
        </button>
      </div>
    </Shell>
  );
}
