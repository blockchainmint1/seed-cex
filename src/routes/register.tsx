import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import logo from "@/assets/seeds-logo.png.asset.json";
import { SCHEDULE_DATES, SCHEDULE_SESSIONS, SCHEDULE_TIME, RECORDING_NOTE } from "@/lib/ignite-registration";
import { RegistrationFlow, StatusPreviews } from "@/components/ignite/RegistrationFlow";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Seeds — Reserve your Ignite seat" },
      { name: "description", content: "Meet Seeds, a non-custodial crypto exchange powered by the Honest Money Ecosystem. Reserve one of 100 seats in Ignite." },
      { property: "og:title", content: "Seeds — Reserve your Ignite seat" },
      { property: "og:description", content: "Join Ignite, the new crypto trading class from Seeds. Limited to 100 seats." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Manrope:wght@400;500;600;700&display=swap" }],
  }),
  component: Index,
});

function Index() {
  const formRef = useRef<HTMLDivElement>(null);
  const [formVisible, setFormVisible] = useState(false);
  useEffect(() => {
    const el = formRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setFormVisible(!!e?.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="ignite-theme seed-lines min-h-screen pb-28 lg:pb-0">
      <header className="mx-auto flex max-w-7xl items-center px-6 py-6">
        <img src={logo.url} alt="Seeds" className="h-9 w-auto mix-blend-lighten sm:h-10" />
      </header>

      <main className="mx-auto grid max-w-7xl gap-12 px-6 pt-6 pb-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16">
        <section>
          <p className="text-xs font-bold tracking-[0.3em] text-primary">INTRODUCING SEEDS</p>
          <h1 className="mt-5 font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Your next chapter in crypto starts here.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Meet Seeds, our new non-custodial crypto exchange powered by the Honest Money Ecosystem. Join Ignite, our new crypto trading class, and reserve one of just 100 seats.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {["100-seat inaugural class", "$400 USD reservation deposit", "Crypto or Peer Pay"].map((b) => (
              <li key={b} className="rounded-full border border-primary/40 px-4 py-2 text-sm font-semibold">{b}</li>
            ))}
          </ul>
          <div className="mt-6 inline-flex flex-col gap-1 rounded-2xl border border-border bg-card/60 px-5 py-4">
            <p className="text-xs font-bold tracking-[0.25em] text-primary">EVENT SCHEDULE</p>
            <p className="font-display text-xl sm:text-2xl">{SCHEDULE_DATES}</p>
            <p className="text-sm text-muted-foreground">{SCHEDULE_SESSIONS}</p>
            <p className="text-sm text-muted-foreground">{SCHEDULE_TIME}</p>
            <p className="mt-1 text-xs text-muted-foreground">{RECORDING_NOTE}</p>
            
          </div>
          <br />
          <a href="#reserve" className="seed-btn mt-8 w-auto">Reserve my Ignite seat</a>

          <div className="mt-12 border-l-2 border-primary pl-5">
            <p className="font-display text-2xl">Led by Bobby Gray</p>
            <p className="mt-1 max-w-md text-muted-foreground">Founder of the Honest Money Ecosystem. The fearless leader behind HME’s next chapter.</p>
          </div>

          <div className="mt-16">
            <h2 className="font-display text-4xl">Meet Seeds. Start with Ignite.</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-5">
                <p className="text-xs font-bold tracking-[0.25em] text-primary">SEEDS</p>
                <p className="mt-2">The exchange — a new non-custodial crypto exchange powered by HME.</p>
              </div>
              <div className="rounded-2xl border border-border p-5">
                <p className="text-xs font-bold tracking-[0.25em] text-primary">IGNITE</p>
                <p className="mt-2">The crypto trading class. Five daily 90-minute sessions, {SCHEDULE_DATES}.</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Class enrollment and exchange-account onboarding are separate. Reserving a seat doesn't open or fund an exchange account.</p>
          </div>
        </section>

        <aside id="reserve" ref={formRef} className="scroll-mt-6 lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-center text-sm text-muted-foreground">Limited to 100 seats · {SCHEDULE_DATES}</p>
          <RegistrationFlow />
        </aside>
      </main>

      <section className="mx-auto max-w-7xl px-6 pb-12"><StatusPreviews /></section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <img src={logo.url} alt="Seeds" className="h-6 w-auto self-start mix-blend-lighten" />
          <div className="space-y-1 sm:text-right"><p>{RECORDING_NOTE}</p><p>Crypto involves risk. Education does not guarantee trading results.</p></div>
        </div>
      </footer>

      {!formVisible && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur lg:hidden">
          <a href="#reserve" className="seed-btn">Reserve my Ignite seat</a>
        </div>
      )}
    </div>
  );
}
