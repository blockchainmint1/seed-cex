import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/manifesto")({
  head: () => ({
    meta: [
      { title: "The Seeds Manifesto — Custody Is the Bug" },
      {
        name: "description",
        content:
          "Why Seeds refuses custody: a plain-language manifesto on self-custody, escrowed peer settlement, and honest money.",
      },
      { property: "og:title", content: "The Seeds Manifesto — Custody Is the Bug" },
      {
        property: "og:description",
        content: "Custody is the bug. Escrow is the fix. A manifesto for honest exchange.",
      },
    ],
  }),
  component: Manifesto,
});

const theses = [
  {
    n: "I",
    title: "Custody is the bug, not the feature",
    body: "Every exchange collapse in the last decade shares one root cause: somebody else held the keys. An exchange that cannot lose your coins is not a feature request — it is the minimum viable design.",
  },
  {
    n: "II",
    title: "A phrase you can hand over is a phrase you have already lost",
    body: "If a website can read your recovery phrase, so can its database admin, its attacker, and its subpoena. Seeds encrypts in your browser so the honest answer to 'can you recover my wallet?' is a flat no.",
  },
  {
    n: "III",
    title: "Convenience without disclosure is fraud",
    body: "Instant access sells. We would rather tell you exactly where the sharp edges are: lose your password and your phrase, and your coins are gone. That is not a flaw in the product; that is what ownership means.",
  },
  {
    n: "IV",
    title: "Settlement should be between people",
    body: "Markets do not need an omnibus account. They need a fair queue, an honest price, and an escrow both sides can verify. Seeds arbitrates; it does not accumulate.",
  },
  {
    n: "V",
    title: "Build in the open, on open chains",
    body: "TEXITcoin is a public, auditable, proof-of-work chain. Anyone can verify a block, a balance, or a broadcast without asking us. Learn how it works at texitcoin.org/build.",
  },
];

function Manifesto() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Manifesto</p>
      <h1 className="mt-3 font-display text-4xl leading-[1.05] font-black tracking-tight text-foreground uppercase">
        Custody is the bug.
        <br />
        <span className="text-primary">Escrow is the fix.</span>
      </h1>
      <p className="mt-6 text-base leading-relaxed text-muted-foreground">
        Seeds started from an uncomfortable question: what if an exchange simply refused the one
        power that makes exchanges dangerous? Here is what we believe, written plainly enough to be
        held against us.
      </p>

      <ol className="mt-12 space-y-10">
        {theses.map((t) => (
          <li key={t.n} className="border-l-2 border-primary/40 pl-6">
            <p className="font-mono text-xs tracking-[0.2em] text-primary">{t.n}</p>
            <h2 className="mt-2 font-display text-lg font-bold tracking-tight text-foreground">
              {t.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-14 flex flex-wrap gap-3">
        <Link
          to="/trade/tsd-txc"
          className="rounded-sm bg-primary px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-primary-foreground uppercase"
        >
          See the book
        </Link>
        <a
          href="https://texitcoin.org/build"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-sm border border-border px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Learn TXC + Omni L2
        </a>
      </div>
    </div>
  );
}
