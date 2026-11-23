import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getIgniteClass } from "@/lib/ignite.functions";
import { canRegister, classAgenda, classBenefits, dateRangeLabel, photoSrc, priceLine, sessionLines, sessionsLabel, sharedTimeLabel } from "@/lib/ignite-classes";
import { RECORDING_NOTE } from "@/lib/ignite-registration";
import { RegistrationFlow } from "@/components/ignite/RegistrationFlow";
import { InterestForm, ParticipationGuide } from "@/components/ignite/ClassBits";
import { BobbyLetter } from "@/components/ignite/BobbyLetter";

export const Route = createFileRoute("/to-the-moon_/$slug")({
  // Each published class is listed in /sitemap.xml by the sitemap route itself.
  staticData: { sitemap: false },
  loader: async ({ params }) => {
    const cls = await getIgniteClass({ data: { slug: params.slug } });
    if (!cls) throw notFound();
    return { cls };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.cls;
    if (!c) return { meta: [{ title: "Class not found — Seeds To the Moon" }, { name: "robots", content: "noindex" }] };
    const dates = dateRangeLabel(c.sessions, c.timezone);
    const title = `${c.name} — Seeds To the Moon crypto trading class`;
    const desc = `${c.name}: a live Seeds To the Moon crypto trading class with ${c.instructorName}, ${dates}. ${priceLine(c)}${c.minersFree && c.feeUsd > 0 ? ", class free for HME miners" : ""}.`;
    return {
      meta: [
        { title }, { name: "description", content: desc },
        { property: "og:title", content: title }, { property: "og:description", content: desc },
        { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="ignite-theme min-h-screen"><div className="mx-auto max-w-7xl px-5 py-20">
      <h1 className="font-display text-4xl">That class isn't on the calendar</h1>
      <p className="mt-3 text-muted-foreground">It may have finished, or the link is mistyped.</p>
      <Link to="/to-the-moon" className="seed-btn mt-6 inline-flex w-auto justify-center px-6">See upcoming classes</Link>
    </div></div>
  ),
  component: ClassPage,
});

function ClassPage() {
  const initial = Route.useLoaderData();
  const { slug } = Route.useParams();
  const q = useQuery({ queryKey: ["ignite-class", slug], queryFn: () => getIgniteClass({ data: { slug } }), initialData: initial.cls, refetchInterval: 60_000 });
  const c = q.data ?? initial.cls;
  const formRef = useRef<HTMLDivElement>(null);
  const [formVisible, setFormVisible] = useState(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const dates = dateRangeLabel(c.sessions, c.timezone);
  const time = sharedTimeLabel(c.sessions, c.timezone);
  const open = canRegister(c, c.seatsLeft);
  const photo = photoSrc(c.instructorPhotoUrl);

  return (
    <div className="ignite-theme seed-lines min-h-screen overflow-x-clip pb-28 lg:pb-0">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 pt-6 pb-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16">
        <section>
          <Link to="/to-the-moon" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">← All To the Moon classes</Link>
          <p className="mt-6 font-mono text-xs font-medium tracking-[0.14em] text-primary">TO THE MOON · {c.name.toUpperCase()}</p>
          <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-[-0.03em] sm:text-6xl">{c.tagline || `${c.name}: live crypto trading class`}</h1>
          <ul className="mt-8 flex flex-wrap gap-2">
            {[priceLine(c), ...(c.minersFree && c.feeUsd > 0 ? ["Free for HME miners"] : []), `${c.capacity} seats`].map((b) => (
              <li key={b} className="rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold">{b}</li>
            ))}
          </ul>

          <div className="mt-6 inline-flex flex-col gap-1 rounded-2xl border border-border bg-card/60 px-5 py-4">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">SCHEDULE</p>
            <p className="font-display text-xl sm:text-2xl">{dates}</p>
            <p className="text-sm text-muted-foreground">{sessionsLabel(c.sessions)}{time ? ` · ${time}` : ""}</p>
            {!time && sessionLines(c.sessions, c.timezone).map((l) => <p key={l} className="text-sm text-muted-foreground">{l}</p>)}
            {time && c.sessions.length > 1 && <ul className="mt-1 text-sm text-muted-foreground">{sessionLines(c.sessions, c.timezone).map((l) => <li key={l}>{l}</li>)}</ul>}
            <p className="mt-1 text-sm text-muted-foreground">{c.location}</p>
            <p className="mt-1 text-xs text-muted-foreground">{RECORDING_NOTE}</p>
          </div>

          <div className="mt-12 flex items-start gap-5 border-l-2 border-primary pl-5">
            {photo && <img src={photo} alt={c.instructorName} width={96} height={96} loading="lazy" className="size-24 shrink-0 rounded-2xl object-cover" />}
            <div>
              <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">YOUR INSTRUCTOR</p>
              <p className="mt-1 font-display text-2xl">{c.instructorName}</p>
              {c.instructorBio && <p className="mt-1 max-w-md whitespace-pre-line text-muted-foreground">{c.instructorBio}</p>}
            </div>
          </div>

          <div className="mt-16 grid gap-10 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl">What you'll learn</h2>
              <ol className="mt-5 space-y-4">
                {classAgenda(c.agenda).map((a, i) => (
                  <li key={`${a.title}-${i}`} className="flex gap-4">
                    <span className="font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <p><span className="font-semibold">{a.title}</span>{a.detail ? <span className="block text-muted-foreground">{a.detail}</span> : null}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <h2 className="font-display text-2xl">Your seat includes</h2>
              <ul className="mt-5 space-y-4">
                {classBenefits(c.benefits, c.minersFree && c.feeUsd > 0).map((b) => (
                  <li key={b} className="flex gap-4"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><p>{b}</p></li>
                ))}
              </ul>
            </div>
          </div>

          {c.requirements && (
            <div className="mt-12 rounded-2xl border border-border p-6">
              <h2 className="font-display text-2xl">What you need</h2>
              <p className="mt-3 whitespace-pre-line text-muted-foreground">{c.requirements}</p>
            </div>
          )}
        </section>

        <aside id="reserve" ref={formRef} className="relative scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
          <p className="relative mb-3 text-center text-sm text-muted-foreground">
            {open ? <span className="font-semibold text-primary">{c.seatsLeft} of {c.capacity} seats left</span> : <span className="font-semibold">{c.status === "open" && c.seatsLeft <= 0 ? "Fully reserved" : "Registration closed"}</span>} · {dates}
          </p>
          <svg aria-hidden className="pointer-events-none absolute -top-24 -right-20 hidden h-80 w-80 lg:block" viewBox="0 0 320 320" fill="none">
            <path d="M 68 68 A 130 130 0 0 1 290 200" stroke="var(--action)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div className="relative"><RegistrationFlow cls={c} /></div>
        </aside>
      </div>

      <section className="mx-auto max-w-7xl px-5 pb-16">
        <div className="border-t border-border pt-16">
          <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">YOUR PARTICIPATION GUIDE</p>
          <h2 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">Learn. Prepare. Participate.</h2>
          <div className="mt-10"><ParticipationGuide depositUsd={c.depositUsd} /></div>
          <p className="mt-6 max-w-2xl text-xs text-muted-foreground">Class enrollment and exchange accounts are separate: reserving a seat doesn't open or fund a Seeds account. Educational content doesn't guarantee profits or trading results.</p>
        </div>
        {c.slug === "spark" && <BobbyLetter />}
        <div className="mt-16 rounded-3xl border border-border bg-card/60 p-6 sm:p-8">
          <h2 className="font-display text-2xl">Can't make these dates?</h2>
          <p className="mt-2 text-muted-foreground">Leave your email and we'll tell you when the next class opens.</p>
          <div className="mt-5 max-w-3xl"><InterestForm /></div>
        </div>
      </section>

      {!formVisible && open && (
        <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur lg:hidden">
          <a href="#reserve" className="seed-btn">Reserve my seat in {c.name}</a>
        </div>
      )}
    </div>
  );
}
