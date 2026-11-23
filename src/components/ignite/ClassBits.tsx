import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { canRegister, dateRangeLabel, priceLine, sessionsLabel, sharedTimeLabel, usd0 } from "@/lib/ignite-classes";
import { joinIgniteInterest } from "@/lib/ignite-classes.functions";
import type { PublicClass } from "@/lib/ignite.functions";

/** One upcoming class on /ignite. */
export function ClassCard({ c }: { c: PublicClass }) {
  const open = canRegister(c, c.seatsLeft);
  const soldOut = c.status === "open" && c.seatsLeft <= 0;
  const time = sharedTimeLabel(c.sessions, c.timezone);
  const pct = c.capacity ? Math.min(100, Math.round(((c.capacity - c.seatsLeft) / c.capacity) * 100)) : 0;
  return (
    <article className="@container relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-glow sm:p-8">
      {/* Sold-out stamp: decoration only, the seat badge above already tells screen readers. */}
      {soldOut && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-3">
          <span className="flex w-[88%] -rotate-[8deg] select-none items-center justify-center rounded-2xl border-[7px] border-primary/80 px-3 py-2 text-center font-display text-[clamp(3rem,15cqw,8.5rem)] font-extrabold uppercase leading-[1.0] tracking-[0.04em] text-primary/85 outline-[3px] outline-offset-[7px] outline-primary/40">
            Sold out
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">TO THE MOON CLASS</p>
          <h3 className="mt-2 font-display text-3xl">{c.name}</h3>
          {c.tagline && <p className="mt-1 text-muted-foreground">{c.tagline}</p>}
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${open ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}>
          {open ? `${c.seatsLeft} of ${c.capacity} seats left` : c.status === "open" && c.seatsLeft <= 0 ? "Fully reserved" : "Registration closed"}
        </span>
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Dates</dt><dd className="font-semibold">{dateRangeLabel(c.sessions, c.timezone)}</dd><dd className="text-muted-foreground">{sessionsLabel(c.sessions)}</dd></div></div>
        <div className="flex gap-2"><Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Time</dt><dd>{time ?? "Times vary by day"}</dd></div></div>
        <div className="flex gap-2"><MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Where</dt><dd>{c.location}</dd></div></div>
        <div className="flex gap-2"><Users aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Instructor</dt><dd>With {c.instructorName}</dd></div></div>
      </dl>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-2xl">{usd0(c.feeUsd + c.depositUsd)}</p>
          <p className="text-sm text-muted-foreground">{priceLine(c)}{c.minersFree && c.feeUsd > 0 ? " · free for HME miners" : ""}</p>
        </div>
        <Link to="/to-the-moon/$slug" params={{ slug: c.slug }} className="seed-btn inline-flex w-auto justify-center px-6">{open ? "See class & reserve" : "See class"}</Link>
      </div>
    </article>
  );
}

/** "Tell me about new classes": email only, not tied to a class. */
export function InterestForm({ compact = false }: { compact?: boolean }) {
  const join = useServerFn(joinIgniteInterest);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") return <p className="rounded-2xl border border-primary/40 bg-primary/5 p-4 text-sm" role="status"><span className="font-semibold">You're on the list.</span> We'll email {email} when a new class opens. Every email has an unsubscribe link.</p>;
  return (
    <form className={`grid gap-3 ${compact ? "" : "sm:grid-cols-[1fr_1fr_auto]"}`} onSubmit={async (e) => {
      e.preventDefault(); setState("busy"); setError(null);
      try { await join({ data: { email, name } }); setState("done"); } catch (err) { setError(err instanceof Error ? err.message : "Couldn't add you. Try again."); setState("idle"); }
    }}>
      <label className="sr-only" htmlFor="ii-name">Your name</label>
      <input id="ii-name" className="seed-field" placeholder="Your name (optional)" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      <label className="sr-only" htmlFor="ii-email">Email</label>
      <input id="ii-email" className="seed-field" type="email" inputMode="email" required placeholder="you@example.com" autoComplete="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" className="seed-btn sm:w-auto sm:px-6" disabled={state === "busy" || !email.trim()}>{state === "busy" ? "Adding…" : "Notify me"}</button>
      {error && <p className="text-sm text-destructive sm:col-span-3" role="alert">{error}</p>}
    </form>
  );
}

/** What to bring and how the trade deposit works (shared by /to-the-moon and each class page). */
export function ParticipationGuide({ depositUsd }: { depositUsd: number }) {
  const dep = depositUsd > 0 ? usd0(depositUsd) : null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {dep && (
        <div className="rounded-2xl border border-primary/40 bg-card/60 p-6">
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">YOUR {dep} TRADE DEPOSIT</p>
          <p className="mt-3 text-muted-foreground">
            The {dep} trade deposit is your own trading money, not tuition. It comes back to you during the class so you trade with it, live, with the instructor. Trading involves risk, and the value of what you buy can fall.
          </p>
        </div>
      )}
      <div className="rounded-2xl border border-border p-6">
        <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">HOW TO PREPARE</p>
        <p className="mt-3 text-muted-foreground">
          New to crypto? Class covers the basics, including wallet setup and getting into crypto. Already hold crypto? You may start with USDC or TSD. Follow the official funding steps we send before moving any money.
        </p>
      </div>
      <div className="rounded-2xl border border-border p-6">
        <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">WHAT CLASS LOOKS LIKE</p>
        <ul className="mt-3 space-y-2 text-muted-foreground">
          <li><span className="font-semibold text-foreground">Get set up:</span> the wallet and funding tools you'll use.</li>
          <li><span className="font-semibold text-foreground">Explore Seeds:</span> the exchange and how trades work.</li>
          <li><span className="font-semibold text-foreground">Buy and sell:</span> TXC, ISK, ZCU and TSD with guidance.</li>
          <li><span className="font-semibold text-foreground">Keep learning:</span> watch the recording and come back any time.</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-border p-6">
        <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">YOUR WALLET. YOUR RESPONSIBILITY.</p>
        <p className="mt-3 text-muted-foreground">
          Seeds is non-custodial: you keep control of your own wallet. Protect your recovery phrase and private keys. Nobody from Seeds or Honest Money will ever ask for them.
        </p>
      </div>
    </div>
  );
}
