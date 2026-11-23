import { createFileRoute } from "@tanstack/react-router";
import { IDENTITY_LABEL } from "@/lib/key-signin/rules";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { listAdminUsers, setAdminAccess, setBetaAccess, type AdminUserRow } from "@/lib/admin-users.functions";
import { adminChangeProblem, adminResultMessage, matchesUserSearch } from "@/lib/admin-users-rules";
import { Card, Note, TabTitle, inputCls } from "@/components/account/ui";
import { Loading, SortHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { fmtAgo } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/users")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Admin access — Seeds admin" },
      { name: "description", content: "Choose which Honest.Money members can open the Seeds admin console, and see every change." },
      { property: "og:title", content: "Admin access — Seeds admin" },
      { property: "og:description", content: "Give or remove Seeds admin access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminUsersPage,
});

type Key = "name" | "email" | "access" | "createdAt" | "lastSignInAt";
const FILTERS = [
  { v: "all", label: "Everyone" },
  { v: "admins", label: "Admins" },
  { v: "members", label: "Not admins" },
] as const;

function AdminUsersPage() {
  const qc = useQueryClient();
  const load = useServerFn(listAdminUsers);
  const change = useServerFn(setAdminAccess);
  const changeBeta = useServerFn(setBetaAccess);
  const q = useQuery({ queryKey: ["admin-users"], queryFn: () => load(), retry: false });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>("all");
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "access", dir: "asc" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const d = q.data;

  const rows = useMemo(() => {
    if (!d) return [];
    const list = d.users.filter((u) => matchesUserSearch(u, search) && (filter === "all" || (filter === "admins" ? u.isAdmin : !u.isAdmin)));
    const sign = sort.dir === "asc" ? 1 : -1;
    const val = (u: AdminUserRow): string | number =>
      sort.key === "access" ? (u.isAdmin ? 0 : 1) : sort.key === "name" ? u.name.toLowerCase() : sort.key === "email" ? (u.email ?? "~").toLowerCase()
        : new Date((sort.key === "createdAt" ? u.createdAt : u.lastSignInAt) ?? 0).getTime();
    return [...list].sort((a, b) => (val(a) < val(b) ? -sign : val(a) > val(b) ? sign : a.name.localeCompare(b.name)));
  }, [d, search, filter, sort]);

  const onSort = (k: Key) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "createdAt" || k === "lastSignInAt" ? "desc" : "asc" }));

  async function toggle(u: AdminUserRow) {
    const grant = !u.isAdmin;
    const ok = window.confirm(grant
      ? `Give ${u.name} admin access?\n\nThey'll be able to see every member's details, To the Moon payments and trades, and give admin access to others. They and the other admins get an email.`
      : `Remove ${u.name}'s admin access?\n\nThey'll lose the admin console right away. They get an email.`);
    if (!ok) return;
    setBusy(u.id);
    setNotice(null);
    try {
      const r = await change({ data: { userId: u.id, grant } });
      setNotice({ tone: r.ok ? "ok" : "error", text: r.message });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message || "Couldn't change admin access." });
    } finally {
      setBusy(null);
    }
  }

  async function toggleBeta(u: AdminUserRow) {
    const grant = !u.isBeta;
    const ok = window.confirm(grant
      ? `Make ${u.name} a beta tester?\n\nThey can try swaps, TSD swaps, Seeds AI real buying and PulseChain withdrawals with real coins and no Seeds limits. They get an email.`
      : `Remove ${u.name} from beta testing?\n\nTest features close for them right away. Anything already running finishes. They get an email.`);
    if (!ok) return;
    setBusy(`beta:${u.id}`);
    setNotice(null);
    try {
      const r = await changeBeta({ data: { userId: u.id, grant } });
      setNotice({ tone: r.ok ? "ok" : "error", text: r.message });
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message || "Couldn't change beta access." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <TabTitle
        title="Admin & beta access"
        desc="Everyone signs in with Honest.Money. Choose which members can open this admin console, and who is a beta tester."
      />
      {q.isPending ? <Loading /> : q.error || !d ? <p role="alert" className="text-sm text-destructive">Couldn't load accounts. Refresh to retry.</p> : (
        <>
          {notice ? <Note tone={notice.tone}>{notice.text}</Note> : null}

          <Card title={`Admins · ${d.adminCount}`} desc="Admins can see member details and payments, and can add or remove other admins.">
            <ul className="divide-y divide-border">
              {d.users.filter((u) => u.isAdmin).map((u) => {
                const why = adminChangeProblem({ actorId: d.me, targetId: u.id, grant: false, targetIsAdmin: true, targetHasHme: !!u.hmMemberId, adminCount: d.adminCount });
                return (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{u.name}{u.id === d.me ? <span className="ml-2 font-mono text-[10px] text-muted-foreground uppercase">you</span> : null}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email ?? "no email"} · admin since {u.adminSince ? new Date(u.adminSince).toLocaleDateString() : "—"}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={!!why || busy === u.id} title={why ? adminResultMessage(why) : undefined} onClick={() => toggle(u)}>
                      <ShieldOff /> {busy === u.id ? "Removing…" : "Remove"}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">You can't remove yourself, and Seeds always keeps at least one admin.</p>
          </Card>

          <section className="min-w-0 rounded-md border border-border bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h3 className="font-display text-base font-bold">All members · {rows.length}{rows.length !== d.users.length ? ` of ${d.users.length}` : ""}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <span className="sr-only">Search members</span>
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input className={`${inputCls} w-56 py-1.5 pl-8`} placeholder="Name, email or member id" value={search} onChange={(e) => setSearch(e.target.value)} />
                </label>
                <div role="group" aria-label="Show" className="flex rounded-sm border border-border p-0.5">
                  {FILTERS.map((f) => (
                    <button key={f.v} type="button" aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}
                      className={`rounded-sm px-2.5 py-1 text-xs ${filter === f.v ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="label-caps text-muted-foreground">
                  <tr className="border-b border-border">
                    <SortHeader label="Name" k="name" sort={sort} onSort={onSort} />
                    <SortHeader label="Email" k="email" sort={sort} onSort={onSort} />
                    <th scope="col" className="px-3 py-2 text-left font-normal">Honest.Money</th>
                    <SortHeader label="Joined" k="createdAt" sort={sort} onSort={onSort} />
                    <SortHeader label="Last sign-in" k="lastSignInAt" sort={sort} onSort={onSort} />
                    <th scope="col" className="px-3 py-2 text-left font-normal">Beta tester</th>
                    <SortHeader label="Access" k="access" sort={sort} onSort={onSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const why = adminChangeProblem({ actorId: d.me, targetId: u.id, grant: !u.isAdmin, targetIsAdmin: u.isAdmin, targetHasHme: !!u.hmMemberId, adminCount: d.adminCount });
                    return (
                      <tr key={u.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2 font-semibold">{u.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{u.email ?? "—"}</td>
                        <td className="px-3 py-2">
                          {u.hmMemberId
                            ? <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase ${u.hmStatus === "active" || u.hmStatus === "oceanfront" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{u.hmStatus}</span>
                            : <span className="font-mono text-[10px] text-muted-foreground uppercase">not linked</span>}
                          {u.signup !== "hme" ? <span className="ml-1.5 rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase" title="How they signed up">{IDENTITY_LABEL[u.signup] ?? u.signup}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-muted-foreground">{u.lastSignInAt ? fmtAgo(u.lastSignInAt) : "never"}</td>
                        <td className="px-3 py-2">
                          {u.isAdmin ? (
                            <span className="font-mono text-[10px] text-primary uppercase">Yes · admin</span>
                          ) : (
                            <Button size="sm" variant={u.isBeta ? "outline" : "ghost"} disabled={busy === `beta:${u.id}` || (!u.isBeta && !u.hmMemberId)}
                              title={!u.isBeta && !u.hmMemberId ? "Needs an Honest.Money membership first" : undefined} onClick={() => toggleBeta(u)}>
                              <FlaskConical /> {busy === `beta:${u.id}` ? "Saving…" : u.isBeta ? "Beta · remove" : "Make beta tester"}
                            </Button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {u.isAdmin ? (
                            <Button size="sm" variant="outline" disabled={!!why || busy === u.id} title={why ? adminResultMessage(why) : undefined} onClick={() => toggle(u)}>
                              <ShieldOff /> {busy === u.id ? "Removing…" : "Remove admin"}
                            </Button>
                          ) : (
                            <Button size="sm" disabled={!!why || busy === u.id} title={why ? adminResultMessage(why) : undefined} onClick={() => toggle(u)}>
                              <ShieldCheck /> {busy === u.id ? "Saving…" : "Make admin"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-muted-foreground">No one matches.</td></tr> : null}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
              Someone who hasn't signed in to Seeds yet won't be listed. Ask them to sign in once with Honest.Money, then refresh.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            Beta testers ({d.betaCount} members plus every admin) can use swaps, TSD swaps, Seeds AI real buying and PulseChain withdrawals with real coins and no Seeds limits.
          </p>

          <Card title="History" desc="Every time admin or beta access was given or removed.">
            {d.history.length === 0 ? <p className="text-sm text-muted-foreground">No changes yet. Changes made here will show up in this list.</p> : (
              <ul className="space-y-2 text-sm">
                {d.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span><span className="font-semibold">{h.actorName}</span> {h.role === "beta" ? (h.action === "grant" ? "made a beta tester:" : "removed from beta testing:") : h.action === "grant" ? "gave admin access to" : "removed admin access from"} <span className="font-semibold">{h.targetName}</span></span>
                    <span className="font-mono text-xs text-muted-foreground">{fmtAgo(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
