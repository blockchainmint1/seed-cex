import type { ReactNode } from "react";
import { Check } from "lucide-react";

/** Page title for one Profile tab. */
export function TabTitle({ title, desc, right }: { title: string; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
      <div className="min-w-0">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{title}</h2>
        {desc ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{desc}</p> : null}
      </div>
      {right}
    </div>
  );
}

/** Bordered card used by every Profile tab. */
export function Card({ title, desc, right, children, className = "" }: { title?: ReactNode; desc?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-border bg-surface ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold">{title}</h3>
            {desc ? <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p> : null}
          </div>
          {right}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "ok" | "error"; children: ReactNode }) {
  const cls = {
    info: "border-border bg-muted/40 text-foreground",
    warn: "border-warn/60 bg-warn/10 text-foreground",
    ok: "border-primary/40 bg-primary/10 text-primary",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
  }[tone];
  return <div role={tone === "error" ? "alert" : undefined} className={`rounded-sm border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Saved() {
  return <span className="inline-flex items-center gap-1 font-mono text-xs text-primary"><Check className="h-3.5 w-3.5" /> Saved</span>;
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

export const fieldLabel = "font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase";
export const inputCls =
  "w-full rounded-sm border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
