import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { TabTitle } from "@/components/account/ui";
import { Loading, Stat, useAdminIgnite, useAdminOverview } from "@/components/admin/ui";
import { fmtAgo, fmtAmount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Admin overview — Seeds" },
      { name: "description", content: "Seeds at a glance: accounts, live orders and trades, settlement health and To the Moon seats." },
      { property: "og:title", content: "Admin overview — Seeds" },
      { property: "og:description", content: "Seeds at a glance for the operator team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminOverview,
});

function Jump({ to, title, body }: { to: "/admin/ignite" | "/admin/accounts" | "/admin/markets" | "/admin/users"; title: string; body: string }) {
  return (
    <Link to={to} className="group flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-4 transition-colors hover:border-primary/50">
      <div>
        <p className="font-display text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{body}</p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </Link>
  );
}

function AdminOverview() {
  const q = useAdminOverview();
  const ig = useAdminIgnite();
  const d = q.data;
  return (
    <div className="space-y-6">
      <TabTitle title="Overview" desc={d ? `Snapshot ${fmtAgo(d.generatedAt)} · refreshes every 30 seconds.` : "Seeds at a glance."} />
      {q.isPending ? <Loading /> : q.error ? <p role="alert" className="text-sm text-destructive">Couldn't load the overview. Refresh to retry.</p> : d ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Stat label="Accounts" value={String(d.totals.accounts)} />
          <Stat label="Open orders" value={String(d.totals.openOrders)} />
          <Stat label="Open trades" value={String(d.totals.openTrades)} />
          <Stat label="Trades 24h" value={String(d.totals.trades24h)} />
          <Stat label="Trades all time" value={String(d.totals.tradesAll)} />
          <Stat label="Volume 24h (quote)" value={fmtAmount(d.totals.tradedQuoteValue24h)} />
          <Stat label="Failed legs" value={String(d.totals.failedLegs)} tone={d.totals.failedLegs ? "warn" : undefined} />
          <Stat label="API keys" value={String(d.totals.apiKeys)} />
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Jump to="/admin/ignite" title="To the Moon classes" body={ig.data ? `${ig.data.confirmed} paid · ${ig.data.classes.filter((c) => c.status === "open").map((c) => `${c.name}: ${Math.max(0, c.capacity - c.held)} of ${c.capacity} left`).join(" · ") || "no open class"} · ${ig.data.pending} waiting to pay` : "Registrants, payment reminders and messages."} />
        <Jump to="/admin/accounts" title="Accounts" body="Every member, their activity and trading value." />
        <Jump to="/admin/markets" title="Orders & trades" body="Open orders, trades waiting to settle, recent fills." />
        <Jump to="/admin/users" title="Admin access" body="Choose which Honest.Money members can open this console." />
      </div>
    </div>
  );
}
