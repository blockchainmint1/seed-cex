import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/account/balances")({
  staticData: { sitemap: false },
  component: BalancesLayout,
});

const TABS = [
  { to: "/account/balances", label: "Spot balances", exact: true },
  { to: "/account/balances/deposit", label: "Deposit" },
  { to: "/account/balances/withdraw", label: "Withdraw" },
] as const;

function BalancesLayout() {
  return (
    <div>
      <nav aria-label="Balances" className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: "exact" in t && t.exact, includeSearch: false }}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
