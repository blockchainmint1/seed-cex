import { createFileRoute, Link } from "@tanstack/react-router";
import { B, Callout, DocLayout, List, Section, linkCls, type TocItem } from "@/components/site/LegalDoc";

const description =
  "Where ads appear on Seeds, who can buy them, how they are labelled, and the places they never go: trading, swaps, deposits, withdrawals, your account and sign-in.";

export const Route = createFileRoute("/about/ads")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "How ads work on Seeds" },
      { name: "description", content: description },
      { property: "og:title", content: "How ads work on Seeds" },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdsPolicy,
});

const toc: TocItem[] = [
  { id: "short", label: "The short version" },
  { id: "who", label: "Who can advertise" },
  { id: "where", label: "Where ads appear" },
  { id: "never", label: "Where ads never go" },
  { id: "labels", label: "How ads are labelled" },
  { id: "counting", label: "What we count" },
  { id: "advertise", label: "Advertising on Seeds" },
];

function AdsPolicy() {
  return (
    <DocLayout
      kicker="Ads · Last updated 21 November 2026 · About 3 minutes"
      title="How ads work on Seeds"
      intro={
        <p>
          Seeds charges no trading fee, so a few quiet ad spots help pay for it. This page
          explains who can buy them, where they appear, how you can tell them apart from
          everything else, and the places they will never go.
        </p>
      }
      toc={toc}
    >
      <Section id="short" n={1} title="The short version">
        <Callout tone="primary">
          <p>
            <B>Every ad says so.</B> Paid placements carry a &ldquo;Sponsored&rdquo; label and the
            name of who paid. Seeds&rsquo; own notes say &ldquo;From Seeds&rdquo;. Ads never change a
            price, a ranking, a chart or a Seeds AI plan.
          </p>
        </Callout>
      </Section>

      <Section id="who" n={2} title="Who can advertise">
        <List
          items={[
            <>Projects in the Honest Money Ecosystem, such as TEXITcoin (TXC), Iskandercoin (ISK), ZeroChill (ZCU) and HME tools.</>,
            <>Teams whose coin is listed on Seeds.</>,
            <>Nobody else, for now. No outside ad networks, and no ads bought automatically.</>,
          ]}
        />
        <p>An ad isn&rsquo;t advice or a recommendation. The advertiser wrote it, and Seeds doesn&rsquo;t check its claims.</p>
      </Section>

      <Section id="where" n={3} title="Where ads appear">
        <List
          items={[
            <><B>Homepage spotlight:</B> up to three cards under the stats strip.</>,
            <><B>Markets page:</B> one labelled row above the price table.</>,
            <><B>Coin pages:</B> a slim line under the coin name, one box in the right-hand column, and one labelled story in the news list.</>,
          ]}
        />
        <p>When nobody has bought a spot, it shows Seeds&rsquo; own news or stays empty.</p>
      </Section>

      <Section id="never" n={4} title="Where ads never go">
        <p>
          Trade boxes and order books, the Swap page, deposits and withdrawals, your account and
          security settings, sign-in, the setup guide, Telegram approvals and the admin console.
          Ads don&rsquo;t pop up, move, play sound or cover a price or a button.
        </p>
      </Section>

      <Section id="labels" n={5} title="How ads are labelled">
        <p>
          Paid placements say &ldquo;Sponsored&rdquo; and name the advertiser. Links to outside sites
          open in a new tab and are marked as sponsored for search engines.
        </p>
      </Section>

      <Section id="counting" n={6} title="What we count">
        <p>
          Seeds counts how many times each ad is seen and clicked, as daily totals only. We
          don&rsquo;t record who saw it, and we load no advertiser code, tracking pixels or outside
          images. Advertisers get the totals and nothing else.
        </p>
      </Section>

      <Section id="advertise" n={7} title="Advertising on Seeds">
        <p>
          Spots are sold by hand, usually alongside a listing package. If your coin is listed or you
          are part of the Honest Money Ecosystem, start with{" "}
          <Link to="/list" className={linkCls}>List on Seeds</Link>.
        </p>
      </Section>
    </DocLayout>
  );
}
