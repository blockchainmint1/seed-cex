import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, Copy, Check, KeyRound, Trash2 } from "lucide-react";
import { createApiKey, deleteApiKey, listApiKeys, setApiKeyEnabled } from "@/lib/api-keys.functions";
import { fmtAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, Note, TabTitle, Toggle, fieldLabel, inputCls } from "@/components/account/ui";

export const Route = createFileRoute("/_authenticated/account/api-keys")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "API keys — Seeds" },
      { name: "description", content: "Create, disable and delete HMAC API keys for trading bots on Seeds. Read or read+trade scopes, optional IP allowlist, never withdrawals." },
      { property: "og:title", content: "API keys — Seeds" },
      { property: "og:description", content: "Manage HMAC API keys for bots. Keys can read and trade, never withdraw." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ApiKeysTab,
});

type Key = Awaited<ReturnType<typeof listApiKeys>>[number];

function ApiKeysTab() {
  const qc = useQueryClient();
  const fetchKeys = useServerFn(listApiKeys);
  const mint = useServerFn(createApiKey);
  const toggle = useServerFn(setApiKeyEnabled);
  const remove = useServerFn(deleteApiKey);
  const [label, setLabel] = useState("Bot key");
  const [canTrade, setCanTrade] = useState(false);
  const [ips, setIps] = useState("");
  const [fresh, setFresh] = useState<{ keyId: string; secret: string } | null>(null);
  const [doomed, setDoomed] = useState<Key | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => fetchKeys() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["api-keys"] });

  const create = useMutation({
    mutationFn: () => mint({ data: { label: label.trim() || "Bot key", scopes: canTrade ? ["read", "trade"] : ["read"], ipAllowlist: ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: (k) => { setFresh({ keyId: k.keyId, secret: k.secret }); setLabel("Bot key"); setIps(""); refresh(); },
  });
  const flip = useMutation({ mutationFn: (v: { id: string; enabled: boolean }) => toggle({ data: v }), onSuccess: refresh });
  const kill = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { setDoomed(null); refresh(); } });

  return (
    <div className="space-y-5">
      <TabTitle
        title="API keys"
        desc="Let a bot read markets and your account, and — if you allow it — place and cancel orders. Keys can never withdraw."
        right={<Button asChild variant="outline" size="sm"><Link to="/api" hash="quick-start"><BookOpen /> API quick start</Link></Button>}
      />

      {fresh ? (
        <Card title="Save your secret now" desc="This is the only time it's shown. Lose it and you'll need a new key." className="border-primary/60">
          <div className="space-y-2">
            <SecretRow label="Key ID" value={fresh.keyId} />
            <SecretRow label="Secret" value={fresh.secret} />
          </div>
          <Button className="mt-4" variant="outline" onClick={() => setFresh(null)}>I've saved it</Button>
        </Card>
      ) : null}

      <Card title="Create a key" desc="Up to 10 keys. Start read-only; add trading when your bot is ready.">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className={fieldLabel}>Label</span>
              <input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="block">
              <span className={fieldLabel}>IP allowlist (optional, up to 10)</span>
              <input value={ips} onChange={(e) => setIps(e.target.value)} placeholder="203.0.113.4, 198.51.100.9" className={`${inputCls} mt-1 font-mono text-xs`} />
            </label>
          </div>
          <Toggle checked={canTrade} onChange={setCanTrade} label="Allow trading" hint="Place and cancel orders within the trading access you've already given. Leave off for dashboards and price bots." />
          {canTrade && !ips.trim() ? <Note tone="warn">A trading key without an IP allowlist works from anywhere. Add your server's IP if you can.</Note> : null}
          <Button type="submit" disabled={create.isPending}><KeyRound /> {create.isPending ? "Creating…" : "Create key"}</Button>
          {create.error ? <Note tone="error">{(create.error as Error).message}</Note> : null}
        </form>
      </Card>

      <Card title="Your keys">
        {keys.isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !(keys.data ?? []).length ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-border font-mono text-[11px] text-muted-foreground uppercase">
                <tr><th className="px-5 py-3">Key</th><th className="px-3 py-3">Access</th><th className="px-3 py-3">IPs</th><th className="px-3 py-3">Last used</th><th className="px-5 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {(keys.data ?? []).map((k) => (
                  <tr key={k.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3"><span className="block font-medium">{k.label}</span><span className="block font-mono text-xs text-muted-foreground">{k.key_id}</span><span className="block text-[11px] text-muted-foreground">created {fmtAgo(k.created_at)}</span></td>
                    <td className="px-3 py-3 font-mono text-xs uppercase">{(k.scopes ?? []).join(" + ")}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{(k.ip_allowlist ?? []).length ? (k.ip_allowlist ?? []).join(", ") : "any"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{k.last_used_at ? fmtAgo(k.last_used_at) : "never"}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <Button size="sm" variant={k.enabled ? "outline" : "ghost"} disabled={flip.isPending} onClick={() => flip.mutate({ id: k.id, enabled: !k.enabled })}>
                        {k.enabled ? "Enabled" : "Disabled"}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Delete ${k.label}`} onClick={() => setDoomed(k)}><Trash2 /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="1 · Create"><p className="text-sm text-muted-foreground">Make a read-only key first and copy the secret into your bot's server settings — never into a web page.</p></Card>
        <Card title="2 · Sign"><p className="text-sm text-muted-foreground">Sign each private request with HMAC-SHA256. Copy-paste examples are in the <Link to="/api" hash="signing" className="text-primary underline">signing guide</Link>.</p></Card>
        <Card title="3 · Go live"><p className="text-sm text-muted-foreground">Add trading and an IP allowlist when it works. Disable a key to pause it; delete it if the secret leaks.</p></Card>
      </div>

      <AlertDialog open={Boolean(doomed)} onOpenChange={(o) => { if (!o) setDoomed(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{doomed?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>Any bot using this key stops working straight away. This can't be undone — to pause instead, disable the key.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => doomed && kill.mutate(doomed.id)}>Delete key</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-sm border border-border bg-background px-2 py-1.5">{value}</code>
      <Button size="icon" variant="ghost" aria-label={`Copy ${label}`} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } }}>
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
