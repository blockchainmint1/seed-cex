import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/lbtc")({
  head: () => ({
    meta: [
      { title: "Why LocalBitcoins Died — A Full Post-Mortem & 2026 P2P Landscape" },
      {
        name: "description",
        content:
          "A deep dive into LocalBitcoins: how it won emerging markets, how Finnish and EU AML rules killed cash P2P, the hacks and prosecutions, who replaced it, and what a non-custodial P2P exchange faces in 2026.",
      },
      { property: "og:title", content: "Why LocalBitcoins Died — A Full Post-Mortem" },
      {
        property: "og:description",
        content:
          "Founded 2012 in Helsinki, dead by 2023. The full timeline: FIN-FSA registration, the end of cash trades, mandatory ID tiers, trader prosecutions, and the P2P market that grew in its place.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LbtcReport;
});

type Src = { n: number; label: string; url: string };

const SOURCES: Src[] = [
  { n: 1, label: "LocalBitcoins — service closure notice", url: "https://localbitcoins.com/service_closure/" },
  {
    n: 2,
    label: "CoinDesk — LocalBitcoins to close, citing market conditions (9 Feb 2023)",
    url: "https://www.coindesk.com/business/2023/02/09/bitcoin-exchange-localbitcoins-to-close-citing-market-conditions",
  },
  {
    n: 3,
    label: "Decrypt — LocalBitcoins shuts down after 10 years",
    url: "https://decrypt.co/120933/localbitcoins-shut-down-10-years-operation",
  },
  {
    n: 4,
    label: "GlobeNewswire — Immediate attention required for LocalBitcoins.com users (29 Apr 2025)",
    url: "https://www.globenewswire.com/news-release/2025/04/29/3070679/0/en/Immediate-attention-required-for-LocalBitcoins-com-users.html",
  },
  {
    n: 5,
    label: "FIN-FSA — Virtual currency providers to be supervised by the FIN-FSA (2019)",
    url: "https://www.finanssivalvonta.fi/en/publications-and-press-releases/supervision-releases/2019/virtual-currency-providers-to-be-supervised-by-the-fin-fsa--briefing-for-virtual-currency-providers-on-15-may/",
  },
  {
    n: 6,
    label: "FIN-FSA grants five virtual currency provider registrations (Nov 2019)",
    url: "https://www.sttinfo.fi/tiedote/69868536/the-financial-supervisory-authority-granted-five-registrations-as-virtual-currency-provider-scope-of-supervision-is-the-prevention-of-money-laundering?publisherId=69817444",
  },
  {
    n: 7,
    label: "Bitcoin.com News — LocalBitcoins removes in-person cash trades (Jun 2019)",
    url: "https://news.bitcoin.com/localbitcoins-removes-in-person-cash-trades-forcing-traders-to-look-elsewhere/",
  },
  {
    n: 8,
    label: "Finance Magnates — LocalBitcoins quietly removes BTC-for-cash trading",
    url: "https://www.financemagnates.com/cryptocurrency/news/localbitcoins-quietly-removes-btc-for-cash-trading-option/",
  },
  {
    n: 9,
    label: "ZDNet — LocalBitcoins blames security breach on third-party forum software (Jan 2019)",
    url: "https://www.zdnet.com/article/localbitcoins-blames-security-breach-on-forum-third-party-software/",
  },
  {
    n: 10,
    label: "CoinDesk — LocalBitcoins reveals security breach, some wallets affected",
    url: "https://www.coindesk.com/markets/2019/01/28/localbitcoins-reveals-security-breach-with-some-crypto-wallets-affected",
  },
  {
    n: 11,
    label: "CoinDesk — LocalBitcoins user pleads guilty after undercover sting (May 2017)",
    url: "https://www.coindesk.com/markets/2017/05/03/localbitcoins-user-pleads-guilty-after-undercover-sting",
  },
  {
    n: 12,
    label: "CoinDesk — LocalBitcoins trader pleads guilty to money transmitter charge",
    url: "https://www.coindesk.com/markets/2017/05/25/localbitcoins-trader-pleads-guilty-to-money-transmitter-charge",
  },
  {
    n: 13,
    label: "CoinDesk — Homeland Security charges LocalBitcoins seller with money laundering (2020)",
    url: "https://www.coindesk.com/markets/2020/03/11/us-homeland-security-charges-localbitcoins-seller-with-money-laundering",
  },
  {
    n: 14,
    label: "BeInCrypto — LocalBitcoins succumbs to crypto winter",
    url: "https://beincrypto.com/localbitcoins-exchanges-succumbed-to-crypto-winter/",
  },
  {
    n: 15,
    label: "Coin Dance — LocalBitcoins historical volume",
    url: "https://coin.dance/volume/localbitcoins",
  },
  {
    n: 16,
    label: "CoinDesk — Behind Paxful's unravelling",
    url: "https://www.coindesk.com/tech/2023/04/08/drugs-erratic-dismissals-and-feuding-founders-behind-bitcoin-marketplace-paxfuls-unraveling",
  },
  {
    n: 17,
    label: "DOJ — Paxful co-founder pleads guilty to AML conspiracy (Jul 2024)",
    url: "https://www.justice.gov/archives/opa/pr/paxful-inc-co-founder-pleads-guilty-conspiracy-fail-maintain-effective-anti-money-laundering",
  },
  {
    n: 18,
    label: "AgoraDesk / LocalMonero — Winding down (May 2024)",
    url: "https://agoradesk.com/blog/announcements/winding-down",
  },
  {
    n: 19,
    label: "Monero Observer — LocalMonero/AgoraDesk shutdown 7 Nov 2024",
    url: "https://monero.observer/localmonero-agoradesk-to-shut-down-november-7-2024/",
  },
  {
    n: 20,
    label: "FinCEN — Application of regulations to certain CVC business models (FIN-2019-G001)",
    url: "https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-certain-business-models",
  },
  {
    n: 21,
    label: "WIRED — Tornado Cash developer Roman Storm guilty on one count (Aug 2025)",
    url: "https://www.wired.com/story/tornado-cash-developer-roman-storm-guilty-on-one-count-in-federal-crypto-case/",
  },
  {
    n: 22,
    label: "CoinDesk — Samourai Wallet devs plead guilty to unlicensed money transmission (2025)",
    url: "https://www.coindesk.com/policy/2025/07/30/samourai-wallet-devs-plead-guilty-to-conspiring-to-run-unlicensed-money-transmitter",
  },
  {
    n: 23,
    label: "Bitcoin.com News — EBA and ESMA on \"we are DeFi\" claims under MiCA",
    url: "https://news.bitcoin.com/we-are-defi-so-mica-does-not-apply-to-us-sorry-but-eba-and-esma-have-a-different-point-of-view/",
  },
  {
    n: 24,
    label: "DOJ — Bitcoin Fog operator found guilty",
    url: "https://www.justice.gov/usao-dc/pr/jury-finds-russian-swedish-operator-bitcoin-fog-guilty-running-darknet-cryptocurrency",
  },
];

function Cite({ ns }: { ns: number[] }) {
  return (
    <sup className="ml-1 font-mono text-[10px] text-primary">
      {ns.map((n, i) => (
        <span key={n}>
          {i > 0 ? "," : ""}
          <a href={`#src-${n}`} className="hover:underline">
            {n}
          </a>
        </span>
      ))}
    </sup>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-14">
      <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">{eyebrow}</p>
      <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
        {title}
      </h2>
      <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

const TIMELINE = [
  {
    date: "Jun 2012",
    title: "Founded in Helsinki",
    body: "Jeremias and Nikolaus Kangas launch LocalBitcoins Oy — an escrowed marketplace where any two people can trade bitcoin for local currency, by any payment method, with public reputation scores.",
    cites: [15],
  },
  {
    date: "Dec 2013",
    title: "Up to €3M/day",
    body: "Barely 18 months in, it clears millions of euros a day. There is no competing product: exchanges want bank wires, LocalBitcoins wants a person.",
    cites: [15],
  },
  {
    date: "2016–2018",
    title: "It becomes the on-ramp for the unbanked world",
    body: "Venezuela, Nigeria, Russia, Colombia, Kenya, Argentina. Where the banking system is broken, capital-controlled, or hostile to crypto, LocalBitcoins IS the market. Ruble and naira order books rival the dollar book.",
    cites: [15],
  },
  {
    date: "Jan 2019",
    title: "Forum breach → phishing → user funds drained",
    body: "A compromise traced to third-party forum software feeds a phishing page that harvests logins and 2FA codes. About $28,200 is taken from user accounts. Small money, big trust damage.",
    cites: [9, 10],
  },
  {
    date: "1 May 2019",
    title: "Finland's Act on Virtual Currency Providers enters force",
    body: "Crypto businesses in Finland now fall under FIN-FSA supervision for AML purposes. LocalBitcoins' entire product — anonymous strangers meeting for cash — becomes a compliance liability overnight.",
    cites: [5],
  },
  {
    date: "1 Jun 2019",
    title: "Cash-in-person trades deleted",
    body: "Quietly, without warning, the in-person cash category is removed. This is the killshot. The one thing LocalBitcoins had that nobody could copy — meet a human, hand over cash, no bank, no trace — is gone to \"adapt to the regulations.\"",
    cites: [7, 8],
  },
  {
    date: "18 Jun 2019",
    title: "Tiered mandatory ID verification",
    body: "Four account levels gate trade volume behind escalating identity documents. The permissionless marketplace becomes a KYC exchange with a worse UX than the KYC exchanges.",
    cites: [7],
  },
  {
    date: "1 Nov 2019",
    title: "FIN-FSA registers LocalBitcoins Oy",
    body: "They win the license — and lose the business. Registration is the formal end of the no-KYC era; from here the product is a regulated venue competing on liquidity it no longer has.",
    cites: [6],
  },
  {
    date: "2020–2022",
    title: "Volume bleeds out",
    body: "Traders migrate to Paxful, Binance P2P, Bisq, HodlHodl, LocalMonero, and Telegram/WhatsApp OTC groups. Emerging-market order books thin. Reputation graphs built over a decade stop mattering because nobody is there to trade against.",
    cites: [15],
  },
  {
    date: "9 Feb 2023",
    title: "Shutdown announced",
    body: "The company cites the \"ongoing very cold crypto winter\" and slumping volume. Trading functions stop around 17 Feb; the site becomes a withdrawal portal. Reporting also points to alleged ties to a US-DOJ-flagged Russian exchange as a factor — never confirmed by the company.",
    cites: [2, 3, 14],
  },
  {
    date: "2024–2025",
    title: "Final closure and fund recovery notices",
    body: "The site posts a permanent closure notice; an April 2025 newswire release urges remaining users to withdraw balances, with a maintenance fee applying from 1 July 2025. No court-supervised bankruptcy proceeding was found — it reads as a voluntary wind-down.",
    cites: [1, 4],
  },
];

const SUCCESSORS = [
  {
    name: "Paxful",
    status: "Alive, wounded",
    note: "Shut abruptly Apr 2023 amid a founder war, reopened May 2023. Co-founder Artur Schaback pleaded guilty Jul 2024 to conspiring to fail to maintain an AML program.",
    cites: [16, 17],
  },
  {
    name: "LocalMonero / AgoraDesk",
    status: "Dead (Nov 2024)",
    note: "Wound down trading May 2024 citing \"internal and external factors\"; full shutdown 7 Nov 2024. The closest spiritual heir to LocalBitcoins, gone.",
    cites: [18, 19],
  },
  {
    name: "Bisq / Bisq 2",
    status: "Alive, niche",
    note: "Desktop, non-custodial, 2-of-3 multisig, no company holding funds. Real censorship resistance, real friction — it never crosses over to normal users.",
    cites: [],
  },
  {
    name: "HodlHodl",
    status: "Alive",
    note: "Non-custodial multisig escrow, no KYC, web-based. Closest thing to a working LocalBitcoins replacement, deliberately small.",
    cites: [],
  },
  {
    name: "RoboSats",
    status: "Alive, growing",
    note: "Lightning-native, Tor-only, hold-invoice escrow, ephemeral robot identities. Fast and private; capped by Lightning liquidity and UX.",
    cites: [],
  },
  {
    name: "Peach Bitcoin",
    status: "Alive, shipping",
    note: "Mobile-first P2P with escrow, active through 2026. Mobile UX is what LocalBitcoins never built.",
    cites: [],
  },
  {
    name: "Vexl / Mostro",
    status: "Alive, experimental",
    note: "Vexl trades through your actual phone contacts; Mostro is Nostr + Lightning P2P with no platform account at all. Where the ideology went.",
    cites: [],
  },
  {
    name: "Binance / Bybit / OKX / Noones P2P",
    status: "Dominant by volume",
    note: "The real winners. They took LocalBitcoins' emerging-market order flow and put it behind full exchange KYC and custodial escrow — the exact thing users were avoiding.",
    cites: [],
  },
];

function LbtcReport() {
  return (
    <div className="mx-auto max-w-7xl px-5">
      <section className="py-16 md:py-20">
        <p className="font-mono text-[11px] tracking-[0.3em] text-primary uppercase">
          Research report · Post-mortem
        </p>
        <h1 className="mt-5 max-w-4xl font-display text-4xl leading-[1.05] font-black tracking-tight text-foreground uppercase md:text-5xl">
          They didn't get hacked to death.
          <br />
          <span className="text-primary">They got compliant to death.</span>
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground">
          LocalBitcoins was the best crypto on-ramp ever built: a stranger near you, a reputation
          score, cash in hand, escrow in the middle. It ran for ten and a half years and died in
          February 2023. The cause of death was not a hack, not a bank run, and not a rival product.
          It was the deletion of its own core feature in order to satisfy AML rules — followed by
          four years of watching the liquidity leave.
        </p>

        <div className="mt-10 grid gap-px bg-border md:grid-cols-4">
          {[
            { k: "Founded", v: "Jun 2012", h: "Helsinki, Finland" },
            { k: "Killshot", v: "1 Jun 2019", h: "cash trades removed" },
            { k: "Announced dead", v: "9 Feb 2023", h: "\"very cold crypto winter\"" },
            { k: "Bankruptcy?", v: "No", h: "voluntary wind-down" },
          ].map((s) => (
            <div key={s.k} className="bg-surface p-5">
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {s.k}
              </p>
              <p className="mt-1 font-mono text-lg text-foreground">{s.v}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{s.h}</p>
            </div>
          ))}
        </div>
      </section>

      <Section eyebrow="Short answer" title="Your four questions, answered up front">
        <p>
          <strong className="text-foreground">Did something go horribly wrong?</strong> No single
          disaster. There was one real security incident — a January 2019 phishing attack routed
          through third-party forum software that cost users roughly $28,200 — which is trivial by
          exchange standards and never threatened solvency.
          <Cite ns={[9, 10]} />
        </p>
        <p>
          <strong className="text-foreground">Was it licensing and compliance?</strong> Yes,
          overwhelmingly. Finland's Act on Virtual Currency Providers took effect 1 May 2019, putting
          them under FIN-FSA AML supervision. Within a month they deleted in-person cash trading;
          within seven weeks they imposed tiered mandatory ID verification; by November 2019 they
          were a registered virtual currency provider. Each step was survival for the company and
          amputation for the product.
          <Cite ns={[5, 6, 7, 8]} />
        </p>
        <p>
          <strong className="text-foreground">Were they US-based?</strong> No. LocalBitcoins Oy was a
          Finnish company, Helsinki, regulated by FIN-FSA — which did not spare it from US pressure.
          American users trading on the platform were repeatedly prosecuted for running unlicensed
          money-transmitting businesses: a Missouri seller and Michigan trader Sal Mansy both pleaded
          guilty in May 2017, and in March 2020 a Washington-state seller was charged over $140,000+
          in laundered bitcoin. LocalBitcoins transaction records also showed up in the DOJ's Bitcoin
          Fog prosecution. The message to every US trader was: the platform is legal, you are not.
          <Cite ns={[11, 12, 13, 24]} />
        </p>
        <p>
          <strong className="text-foreground">Has anyone taken their place?</strong> Not really — the
          demand fragmented. By volume, centralized exchange P2P desks (Binance, Bybit, OKX, Noones)
          won, by re-importing the exact custodial KYC model LocalBitcoins users were escaping. By
          principle, non-custodial protocols won: HodlHodl, Bisq, RoboSats, Peach, Vexl, Mostro. The
          direct heir, LocalMonero/AgoraDesk, shut down in November 2024. Nobody rebuilt the
          combination of scale + local payment methods + trusted reputation graph.
          <Cite ns={[18, 19]} />
        </p>
      </Section>

      <Section eyebrow="Timeline" title="Ten years, cause by cause">
        <div className="not-prose -mt-2 space-y-0">
          {TIMELINE.map((t) => (
            <div key={t.date} className="flex gap-5 border-b border-border py-5 last:border-b-0">
              <div className="w-28 shrink-0 font-mono text-[11px] tracking-wider text-primary uppercase">
                {t.date}
              </div>
              <div>
                <p className="font-display text-base font-bold text-foreground">
                  {t.title}
                  {t.cites.length ? <Cite ns={t.cites} /> : null}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Diagnosis" title="What actually killed it">
        <p>
          <strong className="text-foreground">1. Its moat was the illegal-feeling part.</strong>{" "}
          Cash-in-person was not a feature, it was the entire reason to exist. No exchange could
          compete with a person standing in front of you in Lagos or Caracas. That is also precisely
          the flow that AML supervisors cannot tolerate, because there is no payment record to
          monitor. Once regulated, LocalBitcoins had to remove the only thing it was best at.
          <Cite ns={[7, 8]} />
        </p>
        <p>
          <strong className="text-foreground">2. Compliance turned it into a worse Binance.</strong>{" "}
          After tiered ID verification, a user handing over a passport had no reason to accept P2P
          spreads, escrow delays, and counterparty risk when a full CEX with deep books was one
          signup away. The value proposition inverted: same KYC cost, worse execution.
          <Cite ns={[7]} />
        </p>
        <p>
          <strong className="text-foreground">3. Liquidity is reflexive and it only runs one way.</strong>{" "}
          A P2P marketplace is nothing but its counterparties. Once the best traders left for Paxful,
          Binance P2P, and Telegram OTC groups, spreads widened, which pushed more traders out. The
          decade-old reputation graph — LocalBitcoins' most defensible asset — became worthless the
          moment there was nobody to trade with.
          <Cite ns={[15]} />
        </p>
        <p>
          <strong className="text-foreground">4. US enforcement scared off the supply side.</strong>{" "}
          Market makers, not buyers, are the scarce resource in P2P. A steady drip of §1960
          unlicensed-money-transmission prosecutions against ordinary LocalBitcoins sellers taught
          every profitable US trader that making markets was a felony risk. They quit.
          <Cite ns={[11, 12, 13]} />
        </p>
        <p>
          <strong className="text-foreground">5. Then the winter finished the corpse.</strong> The
          official reason given in February 2023 — collapsed volume during a brutal bear market — was
          true. It just wasn't the cause. Volume had been structurally declining since mid-2019.
          <Cite ns={[2, 3]} />
        </p>
      </Section>

      <Section eyebrow="The field today" title="Who took the flow, who died trying">
        <div className="not-prose mt-2 overflow-hidden rounded-sm border border-border">
          <table className="w-full text-left">
            <thead className="bg-surface font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">What happened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SUCCESSORS.map((s) => (
                <tr key={s.name} className="align-top">
                  <td className="px-4 py-4 font-mono text-sm text-foreground">{s.name}</td>
                  <td className="px-4 py-4 font-mono text-xs text-primary">{s.status}</td>
                  <td className="px-4 py-4 text-sm leading-relaxed text-muted-foreground">
                    {s.note}
                    {s.cites.length ? <Cite ns={s.cites} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="Regulatory reality, 2026" title="What a new P2P venue walks into">
        <p>
          <strong className="text-foreground">Europe: MiCA is fully live.</strong> Regulation (EU)
          2023/1114 entered force 29 June 2023, with the full crypto-asset service provider regime
          applying from 30 December 2024, alongside the Transfer of Funds Regulation travel-rule
          obligations. Critically, the EBA and ESMA have publicly rejected the "we're DeFi, MiCA
          doesn't apply" argument: where a legal person exercises operational control over matching,
          escrow, or fiat rails, they intend to treat it as a licensable service.
          <Cite ns={[23]} />
        </p>
        <p>
          <strong className="text-foreground">
            US: "non-custodial" is not the safe harbor it was assumed to be.
          </strong>{" "}
          FinCEN's May 2019 CVC guidance still turns on whether a business "accepts and transmits"
          value on another's behalf, and nominally distinguishes pure unhosted-wallet software from
          money transmission.
          <Cite ns={[20]} /> But the DOJ has since prosecuted non-custodial software directly and
          won: Tornado Cash developer Roman Storm was convicted in August 2025 on the conspiracy to
          operate an unlicensed money-transmitting business count (acquitted on sanctions, hung jury
          on money laundering),
          <Cite ns={[21]} /> and both Samourai Wallet founders pleaded guilty in mid-2025 to the same
          §1960 conspiracy, tied to over $200M in transmitted criminal proceeds.
          <Cite ns={[22]} /> On top of federal exposure sits state-by-state money-transmitter
          licensing, plus the personal criminal risk to your own market makers that emptied
          LocalBitcoins' supply side.
          <Cite ns={[11, 12, 13]} />
        </p>
        <p>
          <strong className="text-foreground">Honest read:</strong> being non-custodial materially
          improves the argument — no pooled customer funds, no omnibus account, no ability to abscond
          — but it does not by itself remove the analysis. What draws prosecutors is the combination
          of running the matching engine, holding escrow authority, taking fees, and having knowledge
          of illicit use. Architecture matters, but so does who you let trade and what you know about
          them.
        </p>
      </Section>

      <Section eyebrow="The angle" title="What Seeds should learn from the corpse">
        <p>
          <strong className="text-foreground">
            The lesson is not "avoid regulation." It's "don't build your moat on the thing
            regulation deletes."
          </strong>{" "}
          LocalBitcoins' differentiator was untraceable cash handoffs. Ours is that we never take
          custody — which is the opposite kind of moat: it gets{" "}
          <em>stronger</em> under scrutiny, not weaker. No deposits means no omnibus account, no
          proof-of-reserves theater, no FTX failure mode, and nothing for a supervisor to seize.
        </p>
        <p>
          <strong className="text-foreground">What is genuinely worth stealing from them:</strong>{" "}
          the reputation graph, the local payment methods, the sheer emerging-market accessibility,
          and the idea that a trade is between two named humans rather than an anonymous book. A
          reputation-scored P2P layer on top of non-custodial settlement — where the escrow is a
          capped, expiring key rather than a company's bank account — is the version of LocalBitcoins
          that could not have been regulated to death in 2019.
        </p>
        <p>
          <strong className="text-foreground">What to refuse to copy:</strong> in-person cash as a
          core dependency, unlimited anonymous fiat rails, and any design that requires you to be
          the counterparty of last resort.
        </p>
        <div className="not-prose mt-6 flex flex-wrap gap-3">
          <Link
            to="/how-it-works"
            className="rounded-sm bg-primary px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase transition-opacity hover:opacity-90"
          >
            How Seeds works
          </Link>
          <Link
            to="/manifesto"
            className="rounded-sm border border-border px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
          >
            Read the manifesto
          </Link>
        </div>
      </Section>

      <Section eyebrow="Caveats" title="Where this report is soft">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            No Finnish court filing was found confirming a formal insolvency proceeding for
            LocalBitcoins Oy. The public record reads as a voluntary wind-down, not a bankruptcy.
            Confirming this would require a direct search of Finland's trade and bankruptcy
            registers.
          </li>
          <li>
            Peak volume figures often quoted as "$100M+ per week" were not verified against a dated
            historical dataset in this pass; the directional collapse is well documented, the exact
            peak is not.
            <Cite ns={[15]} />
          </li>
          <li>
            The claim that ties to a DOJ-flagged Russian exchange contributed to the shutdown comes
            from secondary reporting, not from any LocalBitcoins statement. Treat it as unconfirmed.
            <Cite ns={[14]} />
          </li>
          <li>
            Current market-share rankings among successor platforms rest on comparison content of
            mixed quality rather than audited volume data. Direction is reliable; precise ordering is
            not.
          </li>
          <li>
            Nothing here is legal advice. Before Seeds does anything that looks like fiat P2P, this
            needs a real regulatory opinion per jurisdiction.
          </li>
        </ul>
      </Section>

      <Section eyebrow="Sources" title="Everything above, checkable">
        <ol className="not-prose space-y-2">
          {SOURCES.map((s) => (
            <li key={s.n} id={`src-${s.n}`} className="flex gap-3 text-sm">
              <span className="w-6 shrink-0 font-mono text-xs text-primary">{s.n}.</span>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
