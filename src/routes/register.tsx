import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SCHEDULE_DATES, SCHEDULE_SESSIONS, SCHEDULE_TIME, RECORDING_NOTE } from "@/lib/ignite-registration";
import { RegistrationFlow, StatusPreviews } from "@/components/ignite/RegistrationFlow";

export const Route = createFileRoute("/register")({
  staticData: { sitemap: true },
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
            <h2 className="font-display text-4xl">Meet seeds. Start with Ignite.</h2>
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

        <aside id="reserve" ref={formRef} className="scroll-mt-20 lg:sticky lg:top-20 lg:self-start">
          <p className="mb-3 text-center text-sm text-muted-foreground">Limited to 100 seats · {SCHEDULE_DATES}</p>
          <RegistrationFlow />
        </aside>
      </main>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="border-t border-border pt-16">
          <p className="text-xs font-bold tracking-[0.3em] text-primary">LIVE CRYPTO TRADING CLASS</p>
          <h2 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">Learn directly. Put understanding into practice.</h2>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Join an inaugural group of up to 100 HME community members for five live sessions with Bobby Gray. Build a clearer understanding of how to set up a wallet, move into crypto and navigate buying and selling on Seeds.
          </p>

          <div className="mt-12 grid gap-10 lg:grid-cols-2">
            <div>
              <h3 className="font-display text-2xl">What you will learn</h3>
              <ul className="mt-5 space-y-4">
                {[
                  ["Wallet foundations", "Downloading, setting up and using a crypto wallet."],
                  ["Getting started", "On-ramping into crypto and bridging into TSD."],
                  ["Exchange essentials", "Navigating Seeds and understanding buy and sell activity."],
                  ["Ecosystem connections", "How Seeds, Crypto U and HME tools fit together."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-4">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <p><span className="font-semibold">{t}:</span> <span className="text-muted-foreground">{d}</span></p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-display text-2xl">Why join Ignite?</h3>
              <ul className="mt-5 space-y-4">
                {[
                  "Live guidance through tools that can feel unfamiliar on your own.",
                  "Practical learning that connects explanations with real workflows.",
                  "A shared experience with a community learning alongside you.",
                  "Recorded sessions so you can revisit the training or catch up later.",
                ].map((d) => (
                  <li key={d} className="flex gap-4">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <p className="text-muted-foreground">{d}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-20 border-t border-border pt-16">
          <p className="text-xs font-bold tracking-[0.3em] text-primary">YOUR PARTICIPATION GUIDE</p>
          <h2 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">Learn. Prepare. Participate.</h2>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">A practical starting point for the Seeds experience.</p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-primary/40 bg-card/60 p-6">
              <p className="text-xs font-bold tracking-[0.25em] text-primary">YOUR $400 TRADING COMMITMENT</p>
              <p className="mt-3 text-muted-foreground">
                Come prepared to commit $400 of your own funds to trading activity during the program. This is your trading capital, not tuition or a course registration fee. Trading involves risk, and the value of assets you buy can fall.
              </p>
            </div>
            <div className="rounded-2xl border border-border p-6">
              <p className="text-xs font-bold tracking-[0.25em] text-primary">HOW TO PREPARE</p>
              <p className="mt-3 text-muted-foreground">
                New to crypto? The training covers foundational steps, including wallet setup and on-ramping. Already hold crypto? Preparation may start with USDC or TSD, depending on your setup. Experienced participants can prepare TSD in their wallet. Follow the official funding instructions before transferring funds — specific funding routes and setup guidance will be confirmed before the program.
              </p>
            </div>
            <div className="rounded-2xl border border-border p-6">
              <p className="text-xs font-bold tracking-[0.25em] text-primary">WHAT THE EXPERIENCE LOOKS LIKE</p>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                <li><span className="font-semibold text-foreground">Get set up:</span> understand the wallet and funding tools you will use.</li>
                <li><span className="font-semibold text-foreground">Explore Seeds:</span> become familiar with the exchange and its trading process.</li>
                <li><span className="font-semibold text-foreground">Learn buying and selling:</span> explore transactions involving TXC, ISK, ZCU and TSD through guided instruction.</li>
                <li><span className="font-semibold text-foreground">Keep learning:</span> revisit recorded sessions and build on your understanding.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-border p-6">
              <p className="text-xs font-bold tracking-[0.25em] text-primary">YOUR WALLET. YOUR RESPONSIBILITY.</p>
              <p className="mt-3 text-muted-foreground">
                Seeds is designed around a non-custodial experience, with participants retaining control of their own wallets. Protect your recovery phrase and private keys. Non-custodial trading still carries market, technical, bridge and security risks.
              </p>
            </div>
          </div>

          <div className="mt-16 rounded-2xl border border-border bg-card/60 p-8 text-center">
            <h3 className="font-display text-3xl">Five days. One connected learning experience.</h3>
            <p className="mt-4 text-muted-foreground">{SCHEDULE_DATES} · Monday–Friday, {SCHEDULE_TIME}</p>
            <p className="mt-1 text-muted-foreground">Inaugural cohort: limited to 100 participants · Sessions will be recorded.</p>
            <p className="mx-auto mt-4 max-w-xl text-xs text-muted-foreground">
              Educational content does not guarantee profits or trading results. Recording access details and final participation instructions will be provided separately.
            </p>
            <a href="#reserve" className="seed-btn mt-6 w-auto">Reserve my Ignite seat</a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-12"><StatusPreviews /></section>

      {!formVisible && (
        <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur lg:hidden">
          <a href="#reserve" className="seed-btn">Reserve my Ignite seat</a>
        </div>
      )}
    </div>
  );
}
