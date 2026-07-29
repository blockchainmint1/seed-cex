import { createFileRoute } from "@tanstack/react-router";
import { LegalShell, Section } from "./terms";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Seeds" },
      {
        name: "description",
        content:
          "How Seeds handles account data, encrypted wallet vaults, order history, and what it deliberately never collects.",
      },
      { property: "og:title", content: "Privacy Policy — Seeds" },
      {
        property: "og:description",
        content: "What Seeds stores, what it cannot read, and what it never collects.",
      },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="July 2026">
      <Section heading="What we never collect">
        <p>
          We never receive your recovery phrase, your private keys, or your vault password. The
          encryption and decryption happen entirely in your browser. What reaches our servers is an
          opaque ciphertext blob, a random salt, an iteration count, and your public addresses.
        </p>
      </Section>
      <Section heading="What we do store">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address and authentication records.</li>
          <li>Your encrypted wallet vault and public receive addresses.</li>
          <li>Orders, trades, escrow state, and a trade event audit log.</li>
          <li>Standard server logs used to keep the service running and secure.</li>
        </ul>
      </Section>
      <Section heading="Public by design">
        <p>
          The order book and trade tape are public market data: price, size, side, and timestamp.
          They are not linked to your email or identity in any public view.
        </p>
      </Section>
      <Section heading="On-chain data">
        <p>
          Blockchain activity is inherently public. Any TEXITcoin address you use is visible to
          anyone inspecting the chain, independent of Seeds.
        </p>
      </Section>
      <Section heading="Third parties">
        <p>
          We read public TEXITcoin chain data from community infrastructure and use a hosted
          database and authentication provider to operate the service. We do not sell personal data.
        </p>
      </Section>
      <Section heading="Deletion">
        <p>
          You can request deletion of your account and encrypted vault. Because your funds live on
          chain and not with us, deleting your Seeds account does not affect your coins — provided
          you have your recovery phrase.
        </p>
      </Section>
    </LegalShell>
  );
}
