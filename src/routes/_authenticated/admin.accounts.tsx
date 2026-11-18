import { createFileRoute } from "@tanstack/react-router";
import { TabTitle } from "@/components/account/ui";
import { Loading, Panel, short, useAdminOverview } from "@/components/admin/ui";
import { fmtAgo, fmtAmount } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/accounts")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Accounts — Seeds admin" },
      { name: "description", content: "Every Seeds account with its orders, trades, trading value and last activity." },
      { property: "og:title", content: "Accounts — Seeds admin" },
      { property: "og:description", content: "Every Seeds account at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const q = useAdminOverview();
  const d = q.data;
  return (
    <div className="space-y-5">
      <TabTitle title="Accounts" desc="Sorted by trading value. Shows up to 200 accounts." />
      {q.isPending ? <Loading /> : !d ? <p role="alert" className="text-sm text-destructive">Couldn't load accounts. Refresh to retry.</p> : (
        <Panel title={`${d.totals.accounts} accounts`}>
          <table className="w-full whitespace-nowrap font-mono text-[11px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Vault</th>
                <th className="px-4 py-2 text-left">TXC</th>
                <th className="px-4 py-2 text-left">EVM</th>
                <th className="px-4 py-2 text-right">Auths</th>
                <th className="px-4 py-2 text-right">Cap</th>
                <th className="px-4 py-2 text-right">Open</th>
                <th className="px-4 py-2 text-right">Trades</th>
                <th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2 text-right">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {d.accounts.map((a) => (
                <tr key={a.userId} className="border-b border-border/50">
                  <td className="px-4 py-2 text-foreground">{a.displayName}</td>
                  <td className="px-4 py-2">{a.hasVault ? "yes" : "—"}</td>
                  <td className="px-4 py-2">{short(a.txcAddress)}</td>
                  <td className="px-4 py-2">{short(a.evmAddress)}</td>
                  <td className="px-4 py-2 text-right">{a.activeAuthorizations}</td>
                  <td className="px-4 py-2 text-right">{fmtAmount(a.authorizedCap)}</td>
                  <td className="px-4 py-2 text-right">{a.openOrders}</td>
                  <td className="px-4 py-2 text-right">{a.trades}</td>
                  <td className="px-4 py-2 text-right">{fmtAmount(a.tradedQuoteValue)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{a.lastActivity ? fmtAgo(a.lastActivity) : "—"}</td>
                </tr>
              ))}
              {d.accounts.length === 0 ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={10}>No accounts yet.</td></tr> : null}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
