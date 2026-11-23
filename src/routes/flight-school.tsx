import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIgniteClasses } from "@/lib/ignite.functions";
import { DEFAULT_AGENDA, DEFAULT_BENEFITS, upcomingClasses } from "@/lib/ignite-classes";
import { ClassCard, InterestForm, ParticipationGuide } from "@/components/ignite/ClassBits";

export const Route = createFileRoute("/flight-school")({
  staticData: { sitemap: true },
  loader: async () => ({ classes: await getIgniteClasses().catch(() => []) }),
  head: () => ({
    meta: [
      { title: "Seeds Flight School — Live crypto trading classes" },
      { name: "description", content: "Flight School is the live crypto trading class from Seeds, the non-custodial exchange of the Honest Money Ecosystem. See upcoming classes and seats left. Free for HME miners." },
      { property: "og:title", content: "Seeds Flight School — Live crypto trading classes" },
      { property: "og:description", content: "Live, hands-on crypto trading classes from Seeds. Free Cold Storage Coin, recordings any time, and free for HME miners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: IgniteHome,
});

const FAQ: [string, string][] = [
  ["Who is Flight School for?", "Anyone who wants to learn to trade crypto with real tools, from first wallet to first trade. No experience needed."],
  ["How does the miner discount work?", "HME miners attend free. When you sign in with Honest.Money we check your account for active mining hash power, and the class fee comes off automatically. The trade deposit still applies, and it comes back to you during class."],
  ["What happens to the trade deposit?", "It's your own trading money. It comes back to you during the class so you can trade with it, live, with the instructor."],
  ["What if I miss a session?", "Every class is recorded. You can watch it any time, and you're welcome to attend a later class with the same instructor again."],
  ["No class fits my dates?", "Leave your email below. We'll let you know when a new class is added."],
];

function IgniteHome() {
  const navigate = useNavigate();
  const initial = Route.useLoaderData();
  const q = useQuery({ queryKey: ["ignite-classes"], queryFn: () => getIgniteClasses(), initialData: initial.classes, refetchInterval: 60_000 });
  const upcoming = upcomingClasses(q.data ?? []);
  // Checkouts opened before the confirmation page existed still return to /register?paid=1 (now forwarded here as /flight-school?paid=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paid")) navigate({ to: "/flight-school/confirmed", replace: true });
  }, [navigate]);

  return (
    <div className="ignite-theme seed-lines min-h-screen overflow-x-clip">
      <div className="mx-auto max-w-7xl px-5 pt-6 pb-16 lg:pt-16">
        <section className="max-w-3xl">
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">SEEDS FLIGHT SCHOOL</p>
          <h1 className="mt-5 font-display text-5xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-[4.25rem]">
            Learn crypto trading live, then do it for real.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Flight School is the live crypto trading class from Seeds, the non-custodial exchange powered by the Honest Money Ecosystem. Small groups, a real instructor, and your own trade deposit to practice with.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {["Free Cold Storage Coin", "Recordings any time", "Free for HME miners"].map((b) => (
              <li key={b} className="rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold">{b}</li>
            ))}
          </ul>
          <a href="#classes" className="seed-btn mt-8 w-auto">See upcoming classes</a>
        </section>

        <section id="classes" className="mt-16 scroll-mt-20">
          <h2 className="font-display text-4xl tracking-tight">Upcoming classes</h2>
          {upcoming.length ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">{upcoming.map((c) => <ClassCard key={c.id} c={c} />)}</div>
          ) : (
            <div className="mt-6 rounded-3xl border border-border bg-card p-6 sm:p-8">
              <p className="font-display text-2xl">No classes on the calendar right now.</p>
              <p className="mt-2 text-muted-foreground">Leave your email and we'll tell you as soon as the next one opens.</p>
              <div className="mt-5"><InterestForm /></div>
            </div>
          )}
        </section>

        <section className="mt-20 border-t border-border pt-16">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">EVERY SEAT INCLUDES</p>
              <ul className="mt-5 space-y-4">
                {DEFAULT_BENEFITS.map((d) => (
                  <li key={d} className="flex gap-4"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><p>{d}</p></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">WHAT YOU'LL LEARN</p>
              <ul className="mt-5 space-y-4">
                {DEFAULT_AGENDA.map((a) => (
                  <li key={a.title} className="flex gap-4">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <p><span className="font-semibold">{a.title}:</span> <span className="text-muted-foreground">{a.detail}</span></p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-20 border-t border-border pt-16">
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">YOUR PARTICIPATION GUIDE</p>
          <h2 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">Learn. Prepare. Participate.</h2>
          <div className="mt-10"><ParticipationGuide depositUsd={upcoming[0]?.depositUsd ?? 400} /></div>
          <p className="mt-6 max-w-2xl text-xs text-muted-foreground">Class enrollment and exchange accounts are separate: reserving a seat doesn't open or fund a Seeds account. Educational content doesn't guarantee profits or trading results.</p>
        </section>

        <section className="mt-20 border-t border-border pt-16">
          <h2 className="font-display text-4xl tracking-tight">Questions</h2>
          <dl className="mt-8 grid gap-6 lg:grid-cols-2">
            {FAQ.map(([qq, a]) => (
              <div key={qq} className="rounded-2xl border border-border p-6"><dt className="font-semibold">{qq}</dt><dd className="mt-2 text-muted-foreground">{a}</dd></div>
            ))}
          </dl>
        </section>

        <section id="interest" className="mt-20 scroll-mt-20 rounded-3xl border border-primary/40 bg-card/60 p-6 sm:p-10">
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">FUTURE CLASSES</p>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl">Hear about new classes first.</h2>
          <p className="mt-3 max-w-xl text-muted-foreground">We add classes regularly. Leave your email and we'll tell you when the next one opens. No spam, and you can unsubscribe any time.</p>
          <div className="mt-6 max-w-3xl"><InterestForm /></div>
          <p className="mt-4 text-sm text-muted-foreground">Already registered? <Link to="/flight-school/confirmed" className="font-semibold text-primary underline-offset-4 hover:underline">Check your seat</Link>.</p>
        </section>
      </div>
    </div>
  );
}
