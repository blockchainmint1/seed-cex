import { createFileRoute, Link } from "@tanstack/react-router";
import { B, Callout, DocLayout, List, Section, Sub, linkCls, type TocItem } from "@/components/site/LegalDoc";

export const Route = createFileRoute("/privacy")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Privacy Policy — Seeds" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "What Seeds collects, why, who sees it and how long we keep it: Honest.Money sign-in, trading pockets, P2P, Ignite registration, alerts, cookies and analytics.",
      },
      { property: "og:title", content: "Privacy Policy — Seeds" },
      {
        property: "og:description",
        content:
          "Seeds never asks for your recovery phrase. Here is everything we do collect, in plain English.",
      },
    ],
  }),
  component: Privacy,
});

const toc: TocItem[] = [
  { id: "short", label: "The short version" },
  { id: "who", label: "Who we are" },
  { id: "never", label: "What we never collect" },
  { id: "account", label: "Your account" },
  { id: "pocket", label: "Your trading pocket" },
  { id: "trading", label: "Trading records" },
  { id: "p2p", label: "P2P marketplace" },
  { id: "ignite", label: "Ignite registration and Peer Pay" },
  { id: "alerts", label: "Email and Telegram" },
  { id: "api", label: "Bots and API keys" },
  { id: "public", label: "What is public" },
  { id: "use", label: "How we use your information" },
  { id: "sharing", label: "Who we share it with" },
  { id: "browser", label: "Cookies and browser storage" },
  { id: "analytics", label: "Site analytics" },
  { id: "keep", label: "How long we keep it" },
  { id: "security", label: "How we protect it" },
  { id: "choices", label: "Your choices and rights" },
  { id: "kids", label: "Children" },
  { id: "world", label: "Where your data is handled" },
  { id: "changes", label: "Changes and contact" },
];

function Privacy() {
  return (
    <DocLayout
      kicker="Privacy policy · Last updated 17 November 2026 · About 12 minutes"
      title="Privacy Policy"
      intro={
        <p>
          Seeds is built so we need as little of your information as possible. We never ask for
          your recovery phrase, and we don&rsquo;t sell your data. This page explains everything we
          do collect, why we collect it, who else sees it, and what you can do about it.
        </p>
      }
      toc={toc}
    >
      <Section id="short" n={1} title="The short version">
        <List
          items={[
            <><B>Never collected:</B> your recovery phrase or the keys to your savings.</>,
            <><B>You sign in with Honest.Money.</B> We get your member ID, display name, membership status and email from them.</>,
            <><B>We keep records of what you do on Seeds</B> &mdash; orders, trades, P2P chats, registrations &mdash; because trades, disputes and payments depend on them.</>,
            <><B>Some things are public on purpose:</B> the order book, your P2P seller profile and anything on a blockchain.</>,
            <><B>We share only what each service needs</B> to do its job: Honest.Money, HME Wallet, TSD Swap, NectarPay, Amazon Web Services, Telegram and our hosting providers.</>,
            <><B>We do not sell your data</B> or use it for advertising.</>,
            <><B>You can ask</B> to see, fix or delete your information. Some records must be kept for security, disputes or the law.</>,
          ]}
        />
      </Section>

      <Section id="who" n={2} title="Who we are">
        <p>
          Seeds is a crypto trading service at seeds.honest.money and part of the{" "}
          <a href="https://honest.money" target="_blank" rel="noreferrer noopener" className={linkCls}>
            Honest Money Ecosystem
          </a>
          . In this policy, &ldquo;Seeds&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean the
          team that runs Seeds. &ldquo;You&rdquo; means anyone who visits the site, signs in, trades,
          registers for a class or pays for someone else.
        </p>
        <p>
          This policy works together with our <Link to="/terms" className={linkCls}>Terms of Use</Link>{" "}
          and <Link to="/risk" className={linkCls}>Risk Disclosure</Link>.
        </p>
      </Section>

      <Section id="never" n={3} title="What we never collect">
        <List
          items={[
            <><B>Your recovery phrase.</B> Seeds will never ask for it &mdash; not on the site, not by email, not on Telegram. Anyone who asks is a scammer.</>,
            <><B>The keys to your savings.</B> HME Wallet keeps your savings separate from your trading pocket, and Seeds never receives keys to savings.</>,
            <><B>Your Honest.Money password or sign-in codes.</B> You enter those on Honest.Money, not on Seeds.</>,
            <><B>Card or bank numbers.</B> Seeds doesn&rsquo;t take card payments. Ignite payments go through NectarPay.</>,
          ]}
        />
      </Section>

      <Section id="account" n={4} title="Your account">
        <p>
          You sign in through Honest.Money. When you do, Honest.Money sends us a signed, single-use
          sign-in ticket, and we create or update your Seeds account with:
        </p>
        <List
          items={[
            "your Honest.Money member ID (this is how we recognise you);",
            "your display name and membership status;",
            "your email address;",
            "the dates your account was created and last updated.",
          ]}
        />
        <p>
          We also save the settings you choose on your Profile: time zone, default market,
          confirmation preferences, trading-limit defaults and which alerts you want.
        </p>
        <Sub title="Older accounts">
          <p>
            Accounts created before Seeds switched to Honest.Money sign-in may still have an older
            email login and, in some cases, an encrypted wallet that was created in the browser.
            We only ever stored the encrypted version, never the password to open it. Before
            removing any older account, we keep a private backup copy so funds and history are not
            lost. An older account joins an Honest.Money membership only through a one-time link
            emailed to that account&rsquo;s inbox.
          </p>
        </Sub>
      </Section>

      <Section id="pocket" n={5} title="Your trading pocket">
        <p>When you link a trading pocket from HME Wallet, we store:</p>
        <List
          items={[
            "which access mode you chose (approve every trade, or instant access) and the pocket number;",
            "the public keys and addresses for that pocket, so we can show balances and deposit addresses;",
            "the date you linked it, and when and how it was revoked;",
            "trade approval requests we sent to your wallet, and your answers.",
          ]}
        />
        <Callout>
          <B>Instant access only:</B> if you choose instant access, HME Wallet sends Seeds an
          encrypted key for that trading pocket so trades can settle without asking you. We store it
          encrypted and unlock it only while a trade is settling. In approve-every-trade mode,
          Seeds holds no key at all. See section 10 of the <Link to="/risk" className={linkCls}>Risk Disclosure</Link>.
        </Callout>
        <p>
          We also read public blockchain data about your pocket&rsquo;s addresses &mdash; balances,
          deposits and confirmations &mdash; and keep a short record of deposits we spot so we can
          alert you.
        </p>
      </Section>

      <Section id="trading" n={6} title="Trading records">
        <List
          items={[
            "Orders: market, buy or sell, price, amount, how much has filled, and status.",
            "Trades: both sides' accounts, price, amount and status.",
            "Settlement: the addresses, amounts, transaction IDs and confirmations for each side.",
            "A step-by-step event log for each trade, used for support, disputes and security reviews.",
            "Locked balances: the shared lock address, the public keys and script behind it, and every payment Seeds co-signed.",
            "Background conversions of BTC, LTC and ETH: deposit and payout addresses, amounts and status.",
          ]}
        />
        <p>
          These records are written only by our servers, not by your browser, so they can&rsquo;t
          be edited after the fact.
        </p>
      </Section>

      <Section id="p2p" n={7} title="P2P marketplace">
        <Sub title="Your seller profile (public)">
          <p>
            Your handle, bio, country, languages, trading hours and time zone, &ldquo;away&rdquo;
            status, when you were last active, trade count, score and feedback are shown to other
            members.
          </p>
        </Sub>
        <Sub title="Shown only to the person you trade with">
          <List
            items={[
              "Payment details and payment instructions you save for an ad (for example, your Zelle name or bank details). These appear to the buyer once a trade opens.",
              "The buyer's receiving address.",
              "Messages in the trade chat, and any receipts or files either side uploads.",
            ]}
          />
        </Sub>
        <Sub title="Kept for safety">
          <List
            items={[
              "Ads and trades: prices, amounts, payment method, status, timestamps and any flags.",
              "Reports, blocks and dispute votes.",
              "If a trade is disputed, the community reviewers and Seeds staff deciding it can see the chat, uploads and trade details.",
            ]}
          />
        </Sub>
        <p>
          Only put in a chat what you&rsquo;re comfortable with the other trader and dispute
          reviewers reading. Never share your recovery phrase.
        </p>
      </Section>

      <Section id="ignite" n={8} title="Ignite registration and Peer Pay">
        <p>When you register for the Ignite class, we collect:</p>
        <List
          items={[
            "your full name, email, country and phone number;",
            "whether you agreed to receive marketing messages;",
            "the referral code you arrived with, if any;",
            "payment details from NectarPay: invoice number, amount, status, which coin and network you paid with, and when it was confirmed.",
          ]}
        />
        <Sub title="Peer Pay">
          <p>
            If you ask a friend to pay for your seat, we store the private payment link (only a
            scrambled version of the link&rsquo;s code), its status and expiry, and the email
            addresses you send it to. When a friend pays, we store their name, email and
            Honest.Money member ID, because payers must be signed in.
          </p>
        </Sub>
      </Section>

      <Section id="alerts" n={9} title="Email and Telegram">
        <Sub title="Email">
          <p>
            We send emails through Amazon Web Services from no-reply@seeds.honest.money: welcome
            messages, trade and P2P confirmations, change notices, registration confirmations and,
            if you want them, weekly updates. That mailbox isn&rsquo;t watched &mdash; replies go to
            support@honest.money. We keep a log of which notices we sent and when, so
            you don&rsquo;t get duplicates. You can turn off trade receipts and weekly updates on
            your Profile or with the unsubscribe link. Security notices &mdash; such as a change to
            your account &mdash; are always sent.
          </p>
        </Sub>
        <Sub title="Telegram">
          <p>
            If you connect Telegram alerts, we store your Telegram chat ID and which alerts you
            want. The one-tap connect code is stored only in scrambled form and expires after 15
            minutes. Telegram receives the text of each alert we send you. You can disconnect
            anytime from your Profile.
          </p>
        </Sub>
      </Section>

      <Section id="api" n={10} title="Bots and API keys">
        <p>
          If you create API keys, we store each key&rsquo;s name, permissions, the IP addresses
          allowed to use it, when it was last used and short-term usage counts for rate limits. We
          also keep the secret needed to check your bot&rsquo;s signatures; we show it to you once
          and never display it again.
        </p>
      </Section>

      <Section id="public" n={11} title="What is public">
        <List
          items={[
            <><B>Market data:</B> the order book, recent trades, prices, volumes and charts. These show price, size, side and time, never your name or email.</>,
            <><B>Your P2P seller profile</B>, as described in section 7.</>,
            <><B>Blockchains:</B> every payment on TEXITcoin, Bitcoin, Litecoin, Ethereum and other networks is public and permanent. Anyone can see addresses, amounts and times. If an address is ever linked to you, your activity can be followed. Seeds can&rsquo;t change or delete blockchain records.</>,
            <><B>Public statistics</B> on our Stats and Custody Ledger pages, which show totals rather than individual members.</>,
          ]}
        />
      </Section>

      <Section id="use" n={12} title="How we use your information">
        <List
          items={[
            "To sign you in and keep your account secure.",
            "To match orders, settle trades and show your balances and history.",
            "To run the P2P marketplace, including chats, reputation, safety limits and disputes.",
            "To take Ignite registrations and confirm payments.",
            "To send the emails and alerts you asked for, plus security notices.",
            "To prevent fraud, abuse, double-spends and attacks, and to investigate problems.",
            "To understand how the site is used and fix what's broken.",
            "To meet legal, tax and accounting duties, and respond to lawful requests.",
          ]}
        />
        <p>
          We don&rsquo;t sell your information, rent it out, or use it to show you ads. We
          don&rsquo;t make automated decisions about you that have legal effects; safety limits for
          new P2P buyers follow simple rules set by sellers.
        </p>
      </Section>

      <Section id="sharing" n={13} title="Who we share it with">
        <p>We share only what each service needs to do its part:</p>
        <List
          items={[
            <><B>Honest.Money</B> &mdash; runs sign-in and profiles. We tell Honest.Money about some events, such as a confirmed Ignite seat, so your membership and referrals stay up to date. See also section 14 about the Honest.Money script.</>,
            <><B>HME Wallet</B> (mobile.honest.money) &mdash; receives trade approval requests and pocket links.</>,
            <><B>TSD Swap</B> &mdash; issues TSD and handles background conversion of BTC, LTC and ETH. Receives the addresses and amounts for those conversions.</>,
            <><B>NectarPay</B> &mdash; processes Ignite payments. Receives the amount, our order number and the payer&rsquo;s email.</>,
            <><B>Amazon Web Services</B> &mdash; delivers our emails (your address and the message) and holds Seeds&rsquo; half of locked-balance keys (it sees only the data being signed, not who you are).</>,
            <><B>Telegram</B> &mdash; delivers alerts you turned on.</>,
            <><B>The Honest.Money help widget</B> (help.honest.money) &mdash; receives whatever you type into the help chat.</>,
            <><B>Our hosting and database providers</B>, including Lovable, which run the website and store its data.</>,
            <><B>Google Fonts</B> &mdash; our fonts load from Google, which sees your IP address and browser when they load.</>,
            <><B>Blockchain networks</B> &mdash; payments we broadcast become public. Price and swap quotes from THORChain and Maya don&rsquo;t include your personal information.</>,
            <><B>The other trader</B> in a P2P trade, and dispute reviewers, as described in section 7.</>,
            <><B>Authorities</B>, when the law requires it, or when needed to protect members or stop fraud.</>,
            <><B>A buyer of Seeds</B>, if Seeds is ever sold or merged; this policy would continue to protect your information.</>,
          ]}
        />
        <p>Each of these services has its own privacy policy, which governs what it does with your data.</p>
      </Section>

      <Section id="browser" n={14} title="Cookies and browser storage">
        <Sub title="Saved by Seeds">
          <List
            items={[
              <><B>Your sign-in session</B>, so you stay signed in. Removed when you sign out.</>,
              <><B>Your light or dark mode choice.</B></>,
              <><B>The page you were on before signing in</B>, for up to 24 hours, so we can bring you back to it.</>,
            ]}
          />
        </Sub>
        <Sub title="Saved by the Honest.Money script">
          <p>Every page of Seeds loads a small script from Honest.Money that tracks referrals across the ecosystem. It:</p>
          <List
            items={[
              <>saves a <B>referral cookie</B> (&ldquo;hm_ref&rdquo;) for 30 days when you arrive through someone&rsquo;s referral link, shared across honest.money sites;</>,
              <>saves a <B>random visitor ID</B> in your browser;</>,
              "tells Honest.Money once per visit which Seeds page you opened, along with the visitor ID and any referral code;",
              <>when you submit a form on Seeds that includes an email address &mdash; such as the Ignite registration form &mdash; <B>sends that email address</B> and the referral code to Honest.Money so the referral can be credited.</>,
            ]}
          />
        </Sub>
        <p>
          You can clear cookies and site data in your browser settings at any time. Doing so signs
          you out and may stop a referral from being credited.
        </p>
      </Section>

      <Section id="analytics" n={15} title="Site analytics">
        <p>
          We use Lovable&rsquo;s visitor analytics to see how Seeds is used. It uses no cookies,
          stores nothing on your device, doesn&rsquo;t keep IP addresses and doesn&rsquo;t identify
          visitors. Lovable collects this data for us.{" "}
          <a href="https://lovable.dev/privacy" target="_blank" rel="noreferrer noopener" className={linkCls}>
            Lovable&rsquo;s privacy policy
          </a>{" "}
          explains how it handles it.
        </p>
        <p>On Seeds, it records:</p>
        <List
          items={[
            "the pages visited and where visitors came from;",
            "the visitor's country, browser, operating system and device type;",
            "how long visitors stay and how fast pages load;",
            "errors;",
            "which buttons and links are clicked.",
          ]}
        />
        <p>
          All of this is recorded for every visitor, without cookies and without identifying
          anyone. Detailed data is kept for 90 days and daily summaries for a year.
        </p>
      </Section>

      <Section id="keep" n={16} title="How long we keep it">
        <List
          items={[
            "Account, trade, settlement, P2P and registration records: while your account is open, and afterwards for as long as needed for disputes, security, accounting and legal duties.",
            "Locked-balance signing records: kept permanently, because they are what stops a coin being signed twice.",
            "Single-use codes and links expire quickly: Telegram connect codes after 15 minutes, account-claim links after 30 minutes, Peer Pay links after 7 days, sign-in tickets within minutes.",
            "Your saved return page: up to 24 hours in your browser.",
            "Site analytics: 90 days in detail, one year in daily summaries.",
            "Backups of older accounts: until the account is claimed or no longer needed.",
          ]}
        />
      </Section>

      <Section id="security" n={17} title="How we protect it">
        <List
          items={[
            "Trades, orders and payments are written only by our servers, with database rules that block browsers from changing them.",
            "Keys for instant-access pockets are stored encrypted. Seeds' half of locked-balance keys never leaves Amazon's key service.",
            "One-time codes and payment links are stored only in scrambled form.",
            "Sign-in tickets are signed, bound to Seeds, single-use and short-lived.",
            "We publish our code and work with an outside security auditor.",
          ]}
        />
        <p>
          No system is perfectly secure. If a breach affects your personal information, we will
          tell you and any authorities we are required to, as quickly as we reasonably can.
        </p>
      </Section>

      <Section id="choices" n={18} title="Your choices and rights">
        <List
          items={[
            <><B>See your information:</B> most of it is on your Profile, Trades and P2P pages. Ask us for a copy of the rest.</>,
            <><B>Fix it:</B> your name and email come from Honest.Money, so change them there. Edit seller details and settings on Seeds.</>,
            <><B>Delete it:</B> ask us to close your account and delete your information. We will delete what we can and tell you what we must keep (for example, trade records needed for disputes or the law). Blockchain records can&rsquo;t be deleted by anyone.</>,
            <><B>Revoke wallet access</B> anytime from HME Wallet.</>,
            <><B>Stop emails and alerts</B> from your Profile, the unsubscribe link, or by disconnecting Telegram. Security notices still arrive.</>,
            <><B>Clear browser storage</B> to remove what Seeds and Honest.Money saved in your browser.</>,
          ]}
        />
        <p>
          Depending on where you live, you may have extra rights, such as objecting to some uses or
          complaining to a privacy regulator. We will respond to requests within the time the law
          where you live requires. We may need to confirm it&rsquo;s really you first.
        </p>
      </Section>

      <Section id="kids" n={19} title="Children">
        <p>
          Seeds is not for anyone under 18. We don&rsquo;t knowingly collect information from
          children. If you think a child has signed up, tell us and we will remove the account.
        </p>
      </Section>

      <Section id="world" n={20} title="Where your data is handled">
        <p>
          Seeds and the services we use operate in the United States and other countries. Your
          information may be stored and processed outside the country where you live, where privacy
          laws can be different. We only work with services we expect to protect it.
        </p>
      </Section>

      <Section id="changes" n={21} title="Changes and contact">
        <p>
          We will update this page when Seeds changes how it handles information, and change the
          date at the top. If a change is significant, we will tell signed-in members by email or
          on the site before it takes effect.
        </p>
        <p>
          Questions or requests? Use the help button at the bottom of any page. To learn why Seeds
          works the way it does, read the <Link to="/manifesto" className={linkCls}>Manifesto</Link>.
        </p>
      </Section>
    </DocLayout>
  );
}
