import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { boldParts } from "@/lib/help/search";
import type { HelpBlock, HelpLink } from "@/lib/help/types";

export function Rich({ text }: { text: string }) {
  return (
    <>
      {boldParts(text).map((p, i) =>
        p.bold ? <strong key={i} className="font-semibold text-foreground">{p.text}</strong> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

/** Same-site paths use the router; https links open in a new tab. */
export function SmartLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  if (/^(https:\/\/|mailto:)/.test(to)) {
    return (
      <a href={to} target="_blank" rel="noreferrer noopener" className={className}>
        {children}
      </a>
    );
  }
  // Help content links are checked against real pages by help-content.test.ts.
  const [path, hash] = to.split("#");
  return (
    <Link to={path as "/help"} hash={hash} className={className}>
      {children}
    </Link>
  );
}

export function LinkButtons({ links }: { links: HelpLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => {
        const out = /^(https:\/\/|mailto:)/.test(l.to);
        return (
          <SmartLink
            key={l.to + l.label}
            to={l.to}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {l.label}
            {out ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
          </SmartLink>
        );
      })}
    </div>
  );
}

export function Blocks({ blocks }: { blocks: HelpBlock[] }) {
  return (
    <div className="space-y-5 text-base leading-relaxed text-muted-foreground">
      {blocks.map((b, i) => {
        if ("h" in b)
          return (
            <h2 key={i} className="pt-4 font-display text-xl font-semibold tracking-tight text-foreground">
              {b.h}
            </h2>
          );
        if ("p" in b) return <p key={i}><Rich text={b.p} /></p>;
        if ("steps" in b)
          return (
            <ol key={i} className="space-y-3">
              {b.steps.map((s, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/50 font-mono text-xs text-primary">
                    {j + 1}
                  </span>
                  <span><Rich text={s} /></span>
                </li>
              ))}
            </ol>
          );
        if ("list" in b)
          return (
            <ul key={i} className="space-y-2.5">
              {b.list.map((s, j) => (
                <li key={j} className="flex gap-3">
                  <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span><Rich text={s} /></span>
                </li>
              ))}
            </ul>
          );
        const warn = b.tone === "warn";
        return (
          <div
            key={i}
            className={`flex gap-3 rounded-md border px-4 py-3 text-sm text-foreground ${warn ? "border-warning/50 bg-warning/10" : "border-primary/40 bg-primary/10"}`}
          >
            {warn ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <span><Rich text={b.note} /></span>
          </div>
        );
      })}
    </div>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
      {items.map((c, i) => (
        <span key={c.label}>
          {i ? <span className="px-2">/</span> : null}
          {c.to ? (
            <SmartLink to={c.to} className="text-primary hover:underline">
              {c.label}
            </SmartLink>
          ) : (
            <span>{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
