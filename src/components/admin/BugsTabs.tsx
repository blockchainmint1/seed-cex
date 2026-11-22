import { Link } from "@tanstack/react-router";

/** Reports (from testers) | Errors (Seeds' own error log) inside Admin → Bugs. */
export function BugsTabs() {
  const cls = "border-b-2 px-3 py-2 text-sm font-semibold";
  return (
    <nav aria-label="Bugs sections" className="flex gap-1 border-b border-border">
      <Link to="/admin/bugs" activeOptions={{ exact: true }} className={cls} activeProps={{ className: "border-primary text-foreground" }} inactiveProps={{ className: "border-transparent text-muted-foreground hover:text-foreground" }}>Reports</Link>
      <Link to="/admin/bugs/errors" className={cls} activeProps={{ className: "border-primary text-foreground" }} inactiveProps={{ className: "border-transparent text-muted-foreground hover:text-foreground" }}>Errors</Link>
    </nav>
  );
}
