import { Link } from "@tanstack/react-router";

/** Registrants | Classes | Interest list inside Admin → To the Moon (one side-menu entry, three tabs). */
export const MOON_ADMIN_PATHS = ["/admin/ignite", "/admin/ignite-classes", "/admin/ignite-interest"] as const;

const TABS = [
  { to: "/admin/ignite", label: "Registrants" },
  { to: "/admin/ignite-classes", label: "Classes" },
  { to: "/admin/ignite-interest", label: "Interest list" },
] as const;

export function MoonTabs() {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">To the Moon</p>
      <nav aria-label="To the Moon sections" className="mt-2 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: true, includeSearch: false }}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground data-[status=active]:border-primary data-[status=active]:font-semibold data-[status=active]:text-foreground"
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
