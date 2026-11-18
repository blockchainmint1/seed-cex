import { createFileRoute, Link } from "@tanstack/react-router";
import { B, Callout, DocLayout, List, Section, Sub, linkCls, type TocItem } from "@/components/site/LegalDoc";

export const Route = createFileRoute("/about/kyc")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "No KYC — Seeds" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Seeds asks for no ID, no selfie, no proof of address and no bank details — and charges no trading fee. Here is what we don't collect, why we don't need it, and what we do keep.",
      },
      { property: "og:title", content: "No KYC — Seeds" },
      {
        property: "og:description",
        content:
          "No passport. No selfie. No proof of address. Seeds never holds your coins, so there is nothing for an identity check to protect.",
      },
    ],
  }),
  component: NoKyc,
});

const toc: TocItem[] = [
  { id: "short", label: "The short version" },
  { id: "dont-collect", label: "What we don't collect" },
  { id: "why-not", label: "Why we don't need it" },
  { id: "do-collect", label: "What we do collect" },
  { id: "no-fees", label: "We don't make money from you" },
  { id: "not-customer", label: "You're not our customer" },
  { id: "your-side", label: "The part that is yours" },
  { id: "scam", label: "If someone asks for ID in our name" },
  { id: "change", label: "What could change" },
  { id: "more", label: "Where this is written down" },
];

function NoKyc() {
  return (
    <DocLayout
      kicker="No KYC · Last updated 18 November 2026 · About 6 minutes"
      title="No KYC"
      intro={
        <p>
          Seeds does not ask who you are. No passport, no driver&rsquo;s licence, no selfie holding
          it up to the camera, no utility bill, no bank statement, no &ldquo;source of funds&rdquo;
          letter. You sign in with your Honest.Money account, link a trading pocket from HME Wallet,
          and you can trade. This page explains why we can say that honestly, what we do keep, and
          what you are still responsible for.
        </p>
      }
      toc={toc}
    >
      <Section id="short" n={1} title="The short version">
        <Callout tone="primary">
          <p>
            <B>We never hold your coins.</B> Trades settle wallet to wallet, from your own pocket to
            your counterparty&rsquo;s. There is no Seeds balance in your name, no deposit sitting in
            our vault, and no withdrawal we approve. An identity check exists to protect money a
            company is holding. We aren&rsquo;t holding yours, so there is nothing for it to
            protect.
          </p>
        </Callout>
        <List
          items={[
            <>No documents, no selfie, no proof of address, no ID number. We have never asked, and we don&rsquo;t plan to.</>,
            <>No card or bank numbers. Seeds doesn&rsquo;t take card payments.</>,
            <>No recovery phrase, ever. Not on the site, not by email, not on Telegram.</>,
            <>No trading fee, no deposit fee, no withdrawal fee, no listing fee, no cut of your P2P deal.</>,
            <>You are not our customer. You are the owner of the coins, using software we built.</>,
          ]}
        />
      </Section>

      <Section id="dont-collect" n={2} title="What we don't collect">
        <p>
          Here is the list of things a &ldquo;verify your account&rdquo; flow at a centralised
          exchange asks for. None of them appear anywhere on Seeds.
        </p>
        <List
          items={[
            <><B>Government ID.</B> No passport, licence or national ID number, and no upload of either.</>,
            <><B>Face checks.</B> No selfie, no liveness test, no &ldquo;turn your head slowly&rdquo; video.</>,
            <><B>Proof of address.</B> No utility bill, no bank statement, no postcode to match against a document.</>,
            <><B>Bank and card numbers.</B> Seeds takes no card payments. Ignite class payments go through NectarPay.</>,
            <><B>Source-of-funds paperwork.</B> No pay slips, no letters, no questionnaires about where your money came from.</>,
            <><B>Tax identifiers.</B> No SSN, no NI number, no &ldquo;tax ID&rdquo; field.</>,
            <><B>Your recovery phrase or your Honest.Money password.</B> Those never come to us. Anyone who asks for them is a scammer.</>,
            <><B>Keys to your savings.</B> HME Wallet keeps your savings separate from your trading pocket, and Seeds never receives savings keys.</>,
          ]}
        />
        <Sub title="Why the list is this short">
          <p>
            Every item above exists to answer one question: <em>is this person who they say they
            are, and is the money theirs?</em> Centralised exchanges have to ask because they take
            your money into their custody, hold it, and hand it back later. That arrangement is
            exactly the one that produces frozen accounts, surprise limits and &ldquo;please upload
            a second document&rdquo; loops. Seeds doesn&rsquo;t run that arrangement, so the whole
            questionnaire has nothing to do.
          </p>
        </Sub>
      </Section>

      <Section id="why-not" n={3} title="Why we don't need it">
        <p>
          Three facts about how Seeds actually works are what make no-KYC possible, not a policy
          decision we made after the fact.
        </p>
        <List
          items={[
            <><B>We don&rsquo;t hold your funds.</B> A trade is two coin transfers between traders&rsquo; own wallets. Seeds builds and signs what you authorised, but the coins move between your pocket and your counterparty&rsquo;s. We can&rsquo;t freeze your balance, because your balance isn&rsquo;t ours to freeze.</>,
            <><B>We can&rsquo;t lend your coins out.</B> Nothing you deposit is lent, staked, rehypothecated or quietly used as collateral for anything. That means there is no solvency question for a regulator to ask us, and no reason to know your legal name.</>,
            <><B>Your reputation comes from behaviour, not documents.</B> On the P2P marketplace, the thing that tells you whether to trade with someone is their trade count, score, feedback and verified balance &mdash; earned on the site, not handed over at a window.</>,
          ]}
        />
        <p>
          There is a fourth reason, and it&rsquo;s the one that matters most to us. A database of
          passports, faces and addresses is the single most attractive target on any crypto site.
          The best way to protect that database from being stolen is not to build it.
        </p>
      </Section>

      <Section id="do-collect" n={4} title="What we do collect">
        <p>
          No KYC is not the same as no information, and we&rsquo;d rather be straight about it than
          let &ldquo;no KYC&rdquo; become a slogan that hides something. Here is what we do keep.
        </p>
        <List
          items={[
            "Your Honest.Money member ID (how we recognise you), your display name, your membership status and your email address.",
            "The public keys and addresses of the trading pocket you linked, so we can show balances and deposit addresses.",
            "Trading records: orders, trades, settlements, prices, sizes and times.",
            "P2P records: your seller profile (handle, bio, country, languages, hours, score, feedback), your ads, trade chats and any files either side uploads in a dispute.",
            "For the Ignite class only: your full name, email, country and phone number, so we can run the class. That is contact information for an event, not an identity check.",
            "Site analytics: pages and rough device type, kept 90 days in detail.",
          ]}
        />
        <p>
          The full list, with what is public and how long each thing is kept, is in the{" "}
          <Link to="/privacy" className={linkCls}>Privacy Policy</Link>. The gap between the two
          pages is the point: <B>we keep what the software needs to run, and nothing that would
          identify you to a stranger.</B>
        </p>
      </Section>

      <Section id="no-fees" n={5} title="We don't make money from you">
        <p>
          There is no fee from us. Not on trades, not on deposits, not on withdrawals, not on
          listings, not on the AI tools, not on the API. Our public market data reports a 0% maker
          fee and a 0% taker fee because that is what we charge. We don&rsquo;t take a spread
          between your buy and sell price, we don&rsquo;t take a cut of a P2P deal, and we don&rsquo;t
          sell your order flow.
        </p>
        <p>
          This is not generosity, it&rsquo;s a design consequence. A fee is how a custodian pays for
          the custody: the compliance team, the ID checks, the frozen-account support queue. Take
          the custody away and the reason for the fee goes with it.
        </p>
        <Sub title="What you will still pay for">
          <p>
            Being honest means naming the costs that aren&rsquo;t ours:
          </p>
          <List
            items={[
              <><B>Blockchain network fees.</B> Every on-chain transfer pays its own network. Those fees go to the network, not to us, and we don&rsquo;t subsidise or refund them.</>,
              <><B>Partner bridge and swap fees.</B> Cross-chain routes use partners such as TSD Bridge and THORChain. Their fees are shown to you in the quote before you confirm, and Seeds refuses a quote whose fee comes in higher than what you were shown.</>,
              <><B>The Ignite class.</B> The class has a price and you pay it to us. That is tuition for teaching, not a charge for trading.</>,
            ]}
          />
          <p>
            And one in our direction: on TSD routes, Seeds pays the Ethereum network fee out of its
            own gas wallet so you don&rsquo;t have to hold ETH just to move coins.
          </p>
        </Sub>
      </Section>

      <Section id="not-customer" n={6} title="You're not our customer">
        <p>
          A customer is someone who hands money to a company and trusts it back. You don&rsquo;t do
          that here, so the word doesn&rsquo;t fit.
        </p>
        <p>
          You are the owner of the coins and a participant in a network. Seeds is software you use,
          the way a person using a wrench isn&rsquo;t the wrench&rsquo;s customer. We don&rsquo;t
          have your money, which means we can&rsquo;t lend it, pledge it, move it without your
          authorisation, or use it to make a profit while you sleep. We don&rsquo;t have your
          identity either, so there is no profile of you to sell, no ad targeting, no data broker
          on the payroll.
        </p>
        <p>
          It also means the relationship is thinner than you&rsquo;re used to, in both directions.
          We can&rsquo;t rescue a lost recovery phrase for you. Nobody can. And we won&rsquo;t
          pretend otherwise to sound friendly.
        </p>
      </Section>

      <Section id="your-side" n={7} title="The part that is yours">
        <p>
          No KYC puts the parts that a centralised exchange normally handles onto you, and you
          should know that before your first trade.
        </p>
        <List
          items={[
            <><B>Your own records.</B> Keep your own trade history and work out your own taxes. We show you the history, but we don&rsquo;t file anything for you.</>,
            <><B>Your own counterparty.</B> On P2P, you choose who you deal with, and you can block or report anyone. Reputation helps; it doesn&rsquo;t replace your judgement.</>,
            <><B>Your own keys.</B> If you lose access to your wallet, nobody can restore it. Back up your recovery phrase offline.</>,
            <><B>Your own side of the law.</B> Our <Link to="/terms" className={linkCls}>Terms of Use</Link> forbid unlawful use and sanctions evasion, and we can restrict access to accounts that break them. Not asking who you are is not a promise to look the other way.</>,
          ]}
        />
      </Section>

      <Section id="scam" n={8} title="If someone asks for ID in our name">
        <Callout>
          <p>
            Because we never ask for documents, anyone who does is not us. If you get an email,
            Telegram message or DM saying your Seeds account needs verification, your ID is
            &ldquo;expired&rdquo;, or you must pay a small amount to unlock a withdrawal:{" "}
            <B>it is a scam.</B> Do not send documents, do not send coins, do not type your recovery
            phrase anywhere. The only thing we ever need from you is the authorisation you give
            inside HME Wallet.
          </p>
        </Callout>
      </Section>

      <Section id="change" n={9} title="What could change">
        <p>
          Rules move. If a jurisdiction ever requires identity checks of software like this, the
          honest answer is not to quietly start collecting passports from everyone and hope nobody
          notices. It is to say so out loud, in advance, and restrict the places where the rule
          applies while leaving everyone else alone.
        </p>
        <p>
          If that day comes, we will tell signed-in members before it takes effect and update this
          page and the <Link to="/privacy" className={linkCls}>Privacy Policy</Link> on the same
          day. Until then, this page describes what actually happens: no ID, no selfie, no proof of
          address, and no fee from us.
        </p>
      </Section>

      <Section id="more" n={10} title="Where this is written down">
        <List
          items={[
            <><Link to="/privacy" className={linkCls}>Privacy Policy</Link> &mdash; everything we collect, who sees it, how long we keep it.</>,
            <><Link to="/terms" className={linkCls}>Terms of Use</Link> &mdash; what you may and may not do with Seeds.</>,
            <><Link to="/risk" className={linkCls}>Risk Disclosure</Link> &mdash; everything that can go wrong, written plainly.</>,
            <><Link to="/custody" className={linkCls}>Custody Ledger</Link> and <Link to="/stats" className={linkCls}>Stats</Link> &mdash; public numbers you can check without trusting us.</>,
            <><Link to="/how-it-works" className={linkCls}>How it works</Link> and <Link to="/manifesto" className={linkCls}>Manifesto</Link> &mdash; why wallet-to-wallet settlement is the reason all of this is possible.</>,
          ]}
        />
      </Section>
    </DocLayout>
  );
}
