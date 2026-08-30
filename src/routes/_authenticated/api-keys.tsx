import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { createApiKey, deleteApiKey, listApiKeys, setApiKeyEnabled } from "@/lib/api-keys.functions";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/api-keys")({
  head: () => ({
    meta: [
      { title: "API Keys — Seeds" },
      {
        name: "description",
        content: "Create and revoke HMAC API keys for trading bots on Seeds. Keys can read and trade, never withdraw.",
      },
      { property: "og:title", content: "API Keys — Seeds" },
      {
        property: "og:description",
        content: "Create and revoke HMAC API keys for trading bots. Read and trade scopes only — no withdrawals.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ApiKeysPage,
});

type NewKey = { keyId: string; secret: string } | null;

function ApiKeysPage() {
  const qc = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const mint = useServerFn(createApiKey);
  const toggle = useServerFn(setApiKeyEnabled);
  const remove = useServerFn(deleteApiKey);

  const [label, setLabel] = useState("Bot key");
  const [canTrade, setCanTrade] = useState(true);
  const [ips, setIps] = useState("");
  const [fresh, setFresh] = useState<NewKey>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => fetchKeys() });

  const create = useMutation({
    mutationFn: () =>
      mint({
        data: {
          label: label.trim() || "Bot key",
          scopes: canTrade ? (["read", "trade"] as const).slice() : ["read"],
          ipAllowlist: ips
            .split(/[\s,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (k) => {
      setFresh({ keyId: k.keyId, secret: k.secret });
      setError(null);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const flip = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const kill = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20">
      <header className="py-10">
        <p className="font-mono text-xs tracking-[0.3em] text-primary uppercase">Developers</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">API Keys</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Keys let a bot read markets and place or cancel orders on your behalf, within the trading
          authorizations you have already granted. Keys can never withdraw — that stays in this UI.{" "}
          <Link to="/api-docs" className="text-primary underline underline-offset-4">
            Read the API docs
          </Link>
          .
        </p>
      </header>

      {fresh ? (
        <section className="mb-8 rounded-sm border border-primary/60 bg-primary/5 p-4">
          <h2 className="font-display text-[11px] font-bold tracking-[0.18em] uppercase">
            Save your secret now
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This is the only time the secret is shown. If you lose it, delete the key and make a new one.
          </p>
          <div className="mt-3 space-y-2 font-mono text-xs">
            <SecretRow label="Key ID" value={fresh.keyId} />
            <SecretRow label="Secret" value={fresh.secret} />
          </div>
          <button
            onClick={() => setFresh(null)}
            className="mt-4 rounded-sm border border-border px-3 py-1.5 font-mono text-xs tracking-wider uppercase hover:border-primary hover:text-primary"
          >
            I've saved it
          </button>
        </section>
      ) : null}

      <section className="rounded-sm border border-border bg-surface">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="font-display text-[11px] font-bold tracking-[0.18em] uppercase">New key</h2>
        </header>
        <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto_1fr_auto]">
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={canTrade} onChange={(e) => setCanTrade(e.target.checked)} />
            <span className="font-mono text-[10px] tracking-widest uppercase">Allow trading</span>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              IP allowlist (optional)
            </span>
            <input
              value={ips}
              onChange={(e) => setIps(e.target.value)}
              placeholder="203.0.113.4, 198.51.100.9"
              className="mt-1 w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-xs"
            />
          </label>
          <button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="self-end rounded-sm bg-primary px-4 py-2 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase disabled:opacity-60"
          >
            <KeyRound className="mr-1 inline h-3.5 w-3.5" />
            {create.isPending ? "Creating…" : "Create"}
          </button>
        </div>
        {error ? <p className="px-4 pb-4 text-xs text-destructive">{error}</p> : null}
      </section>

      <section className="mt-8 rounded-sm border border-border bg-surface">
        <header className="border-b border-border px-4 py-2.5">
          <h2 className="font-display text-[11px] font-bold tracking-[0.18em] uppercase">Your keys</h2>
        </header>
        {keys.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (keys.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(keys.data ?? []).map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{k.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{k.key_id}</p>
                </div>
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
                  {(k.scopes ?? []).join(" + ")}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {k.last_used_at ? `used ${fmtAgo(k.last_used_at)}` : "never used"}
                </span>
                <button
                  onClick={() => flip.mutate({ id: k.id, enabled: !k.enabled })}
                  className={`rounded-sm border px-3 py-1 font-mono text-[10px] tracking-widest uppercase ${
                    k.enabled ? "border-primary text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {k.enabled ? "Enabled" : "Disabled"}
                </button>
                <button
                  onClick={() => kill.mutate(k.id)}
                  aria-label={`Delete ${k.label}`}
                  className="rounded-sm border border-border p-1.5 text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-background px-2 py-1">
        {value}
      </code>
      <button
        onClick={() => navigator.clipboard.writeText(value)}
        aria-label={`Copy ${label}`}
        className="rounded-sm border border-border p-1.5 hover:border-primary hover:text-primary"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
