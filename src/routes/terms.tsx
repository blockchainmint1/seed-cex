import { createFileRoute } from "@tanstack/react-router";

function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Seeds</p>
      <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground uppercase">
        {title}
      </h1>
      <p className="mt-2 font-mono text-xs text-muted-foreground">Last updated {updated}</p>
      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-base font-bold tracking-tight text-foreground uppercase">
        {heading}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export { LegalShell, Section };

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Seeds" },
      {
        name: "description",
        content:
          "The terms governing use of Seeds, a non-custodial USDC/TXC exchange operated as part of the honest.money ecosystem.",
      },
      { property: "og:title", content: "Terms of Use — Seeds" },
      {
        property: "og:description",
        content: "Terms governing use of the Seeds non-custodial USDC/TXC exchange.",
      },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalShell title="Terms of Use" updated="July 2026">
      <Section heading="1. What Seeds is">
        <p>
          Seeds is non-custodial software. It helps you generate a wallet, encrypt it, and find a
          counterparty for USDC/TXC trades. Seeds is not a bank, broker, money transmitter, or
          investment adviser, and it does not hold your assets on your behalf.
        </p>
      </Section>
      <Section heading="2. You own your keys">
        <p>
          Your recovery phrase is generated in your browser and encrypted with a password that never
          leaves your device. We store only ciphertext. If you lose your password or your recovery
          phrase, <strong className="text-foreground">nobody — including us — can restore access to
          your funds.</strong> Back up your phrase offline before funding a wallet.
        </p>
      </Section>
      <Section heading="3. Settlement status">
        <p>
          The TEXITcoin leg of a trade is settled on-chain: it is built and signed from the
          authorized trading branch you granted, broadcast through a TEXITcoin node we operate, and
          tracked to confirmation. On-chain transactions are irreversible and we cannot recall one
          once broadcast.
        </p>
        <p>
          The USDC leg remains simulated: it is recorded as funded and released without any
          blockchain transaction. Do not treat a simulated leg as legally or economically settled.
        </p>
      </Section>
      <Section heading="4. Escrow and disputes">
        <p>
          When a trade matches, each side funds a dedicated escrow leg. Seeds may act as an
          arbitrator in a two-of-three arrangement, meaning it can help complete or refund a trade
          but cannot unilaterally move both legs to itself.
        </p>
      </Section>
      <Section heading="5. Acceptable use">
        <p>
          You may not use Seeds for unlawful activity, to evade sanctions, to manipulate markets, or
          to interfere with the service. We may restrict access to accounts that do.
        </p>
      </Section>
      <Section heading="6. No warranty; limitation of liability">
        <p>
          The service is provided "as is" without warranties of any kind. To the maximum extent
          permitted by law, Seeds is not liable for lost keys, lost profits, chain reorganizations,
          counterparty conduct, or indirect damages.
        </p>
      </Section>
      <Section heading="7. Changes">
        <p>
          We may update these terms. Continued use after an update means you accept the revised
          terms.
        </p>
      </Section>
    </LegalShell>
  );
}
