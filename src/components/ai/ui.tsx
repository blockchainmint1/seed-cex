import type { ReactNode } from "react";

export function Panel({ title, children, right }: { title?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      {title ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 className="font-display text-[11px] font-bold tracking-[0.18em] text-foreground uppercase">{title}</h2>
          {right}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-semibold">{label}</span>
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputCls = "num h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";

export function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      className={`rounded-sm border px-2.5 py-1 text-xs font-semibold uppercase transition-colors disabled:opacity-40 ${
        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export const tone = (n: number) => (n >= 0 ? "text-bid" : "text-ask");
