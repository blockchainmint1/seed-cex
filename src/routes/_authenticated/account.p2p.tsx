import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AwayToggle, liveTrades, TradeList, useMyP2p } from "@/components/p2p/desk";
import { Card, Note, TabTitle } from "@/components/account/ui";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/account/p2p")({
  staticData: { sitemap: false },
  component: P2pLayout,
});

const TABS = [
  { to: "/account/p2p", label: "Trader profile", exact: true },
  { to: "/account/p2p/listings", label: "My listings" },
  { to: "/account/p2p/trades", label: "Trades" },
] as const;

function P2pLayout() {
  const q = useMyP2p();
  const d = q.data;
  const live = d ? liveTrades(d) : [];
  return (
    <div className="space-y-5">
      <TabTitle
        title="P2P trading"
        desc="Sell from your own HME trading pocket. Buyers pay you directly; coins leave only when you tap Approve in Telegram."
        right={
          <div className="flex flex-wrap gap-2">
            {d?.profile ? <AwayToggle away={d.profile.away} /> : null}
            <Button asChild variant="outline"><Link to="/p2p">Marketplace</Link></Button>
          </div>
        }
      />
      {live.length ? (
        <Card title={`Action needed (${live.length})`} desc="Trades waiting on you or your trading partner.">
          <TradeList trades={live} />
        </Card>
      ) : null}
      <nav aria-label="P2P trading" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: "exact" in t && t.exact, includeSearch: false }}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground"
          >
            {t.label}
            {t.to === "/account/p2p/listings" && d?.offers.length ? <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{d.offers.length}</span> : null}
            {t.to === "/account/p2p/trades" && live.length ? <span className="ml-1.5 rounded-sm bg-primary/15 px-1.5 font-mono text-[11px] text-primary">{live.length}</span> : null}
          </Link>
        ))}
      </nav>
      {q.error ? <Note tone="error">Could not load your P2P desk: {(q.error as Error).message}</Note> : null}
      {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : <Outlet />}
    </div>
  );
}
