import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Bell, CalendarDays, Check, Clock, KeyRound, Link2, LineChart, Lock, UserRound, Video } from "lucide-react";
import { getIgniteSeats } from "@/lib/ignite.functions";
import { LAUNCH_DATE_LABEL, timeLeft } from "@/lib/launch";
import { RECORDING_NOTE, SCHEDULE_START_UTC } from "@/lib/ignite-registration";

export const Route = createFileRoute("/coming-soon")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Seeds launches November 30, 2026 — Coming soon" },
      { name: "description", content: "Seeds is in demo mode: set up your account and link your HME Wallet now. Trading goes live November 30, 2026, the first day of the To the Moon class." },
      { property: "og:title", content: "Seeds launches November 30, 2026" },
      { property: "og:description", content: "Demo mode today, trading on launch day. Reserve a seat in Ignite, the first To the Moon crypto trading class from Seeds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComingSoon,
});

const readyNow = [
  { icon: UserRound, title: "Sign in and set up your account", body: "Sign in with your Honest.Money membership and fill in your profile." },
  { icon: Link2, title: "Link your HME Wallet", body: "Connect your trading pocket so you're ready on day one. Linking doesn't move your coins." },
  { icon: Bell, title: "Choose your alerts", body: "Pick the email and Telegram alerts you want for when trading opens." },
  { icon: LineChart, title: "Look around", body: "Browse the markets and try the Seeds AI basket builder on past prices. Nothing you do here buys or sells." },
];

const notYet = [
  "Buying and selling on the markets",
  "P2P trades between members",
  "Coin swaps",
  "Seeds AI buying or selling for you",
];

function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const left = now == null ? null : timeLeft(now, SCHEDULE_START_UTC);
  const cells: [string, number | null][] = [
    ["Days", left?.days ?? null],
    ["Hours", left?.hours ?? null],
    ["Minutes", left?.minutes ?? null],
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">{left?.done ? "Class has started" : "First class starts in"}</p>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {cells.map(([label, v]) => (
          <div key={label} className="rounded-xl border border-border bg-background px-3 py-4 text-center">
            <p className="num text-4xl font-bold tracking-tight text-foreground sm:text-5xl">{v == null ? "–" : String(v).padStart(2, "0")}</p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">{label}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Monday, November 30 at 5:00 PM CST.</p>
    </div>
  );
}

function ComingSoon() {
  const seats = useQuery({ queryKey: ["ignite-seats"], queryFn: () => getIgniteSeats(), refetchInterval: 60_000 });
  const next = seats.data?.next ?? null;
  const seatLine = seats.data
    ? next ? `${seats.data.seatsLeft} of ${seats.data.capacity} seats left` : "No open class right now"
    : "Limited seats";

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20 pt-12 lg:pt-20">
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-destructive/60 px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.2em] text-destructive uppercase">
            <AlertTriangle aria-hidden className="size-3.5" /> Demo mode
          </p>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-6xl">
            Seeds launches
            <br />
            <span className="text-primary">{LAUNCH_DATE_LABEL}.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Right now Seeds is open for account setup and wallet linking only. Trading is not live yet. It opens on launch day, the same day our first To the Moon trading class begins.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/to-the-moon" className="inline-flex items-center gap-2 rounded-md bg-action px-6 py-3 text-sm font-semibold text-action-foreground transition-[filter] hover:brightness-110">
              See To the Moon classes <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link to="/account" className="inline-flex items-center rounded-md border border-foreground/70 px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5">
              Set up my account
            </Link>
          </div>
        </div>
        <Countdown />
      </section>

      {/* Now vs launch */}
      <section className="mt-20 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-primary/40 p-6 sm:p-8">
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Ready now</p>
          <h2 className="mt-3 font-display text-2xl text-foreground sm:text-3xl">Get set up before launch</h2>
          <ul className="mt-6 space-y-5">
            {readyNow.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary"><Icon aria-hidden className="size-4.5" /></span>
                <div>
                  <p className="font-semibold text-foreground">{title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border p-6 sm:p-8">
          <p className="font-mono text-[11px] tracking-[0.24em] text-muted-foreground uppercase">Opens {LAUNCH_DATE_LABEL}</p>
          <h2 className="mt-3 font-display text-2xl text-foreground sm:text-3xl">Not live yet</h2>
          <ul className="mt-6 space-y-3">
            {notYet.map((t) => (
              <li key={t} className="flex items-center gap-3 text-foreground">
                <Lock aria-hidden className="size-4 shrink-0 text-muted-foreground" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
            <p className="font-semibold text-foreground">Use at your own risk.</p>
            <p className="mt-1 text-muted-foreground">
              Seeds is still being tested. Prices, order books and numbers you see before launch are for demonstration and may be wrong or reset. Please don't make money decisions based on them. Read the{" "}
              <Link to="/risk" className="font-semibold text-foreground underline underline-offset-4">risk disclosure</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* Ignite */}
      <section className="mt-20 overflow-hidden rounded-3xl border border-primary/40 bg-card">
        <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Learn with To the Moon</p>
            <h2 className="mt-3 font-display text-3xl tracking-tight text-foreground sm:text-5xl">{next ? `Register for ${next.name}.` : "Join a To the Moon class."}</h2>
            <p className="mt-5 max-w-xl text-muted-foreground">
              To the Moon is our live crypto trading class, led by Bobby Gray, founder of the Honest Money Ecosystem. Live sessions walk you through setting up a wallet, getting into crypto and buying and selling on Seeds.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {[
                "Your trade deposit comes back to you during the class for trading.",
                "Free for HME miners, plus a free Cold Storage Coin.",
                "Pay with crypto, or have someone pay for you with Peer Pay.",
                "Every session is recorded, so you can catch up later.",
              ].map((t) => (
                <li key={t} className="flex gap-3 text-foreground"><Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />{t}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-background p-6">
            <dl className="space-y-4">
              <div className="flex gap-3"><CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Dates</dt><dd className="font-semibold text-foreground">{next ? `${next.name} · ${next.dates}` : "New classes coming soon"}</dd></div></div>
              <div className="flex gap-3"><Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Time</dt><dd className="text-foreground">{next?.time ?? "—"}</dd><dd className="text-sm text-muted-foreground">{next?.format ?? ""}</dd></div></div>
              <div className="flex gap-3"><Video aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Recording</dt><dd className="text-sm text-muted-foreground">{RECORDING_NOTE.replace(/^\*/, "")}</dd></div></div>
              <div className="flex gap-3"><KeyRound aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /><div><dt className="sr-only">Seats</dt><dd className="font-semibold text-primary">{seatLine}</dd></div></div>
            </dl>
            <Link to={next ? "/to-the-moon/$slug" : "/to-the-moon"} params={{ slug: next?.slug ?? "" }} hash={next ? "reserve" : undefined} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-action px-6 py-3 text-sm font-semibold text-action-foreground transition-[filter] hover:brightness-110">
              Reserve my seat <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
