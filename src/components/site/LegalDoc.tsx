import type { ReactNode } from "react";

/** Shared building blocks for long legal documents (/risk, /privacy). */

export type TocItem = { id: string; label: string };

export function Section({ id, n, title, children }: { id: string; n: number; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Section {n}</p>
      <h2 className="mt-2 font-display text-2xl leading-tight font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Callout({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "primary" }) {
  const cls =
    tone === "warning" ? "border-warning/50 bg-warning/10" : "border-primary/40 bg-primary/10";
  return <div className={`rounded-xl border px-5 py-4 text-foreground ${cls}`}>{children}</div>;
}

export const B = ({ children }: { children: ReactNode }) => (
  <strong className="font-semibold text-foreground">{children}</strong>
);

export function DocLayout({
  kicker,
  title,
  intro,
  toc,
  children,
}: {
  kicker: string;
  title: string;
  intro: ReactNode;
  toc: TocItem[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">On this page</p>
            <ol className="mt-4 space-y-2 text-sm">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                    {i + 1}. {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
        <article className="max-w-3xl">
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">{kicker}</p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] font-bold tracking-tight text-foreground sm:text-5xl">
            {title}
          </h1>
          <div className="mt-6 text-lg leading-relaxed text-foreground/90">{intro}</div>
          <details className="mt-8 rounded-xl border border-border bg-card px-5 py-3 lg:hidden">
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
              On this page
            </summary>
            <ol className="mt-3 space-y-2 pb-2 text-sm">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">
                    {i + 1}. {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>
          <div className="mt-12 space-y-12">{children}</div>
        </article>
      </div>
    </div>
  );
}

export const linkCls = "text-primary underline-offset-4 hover:underline";
