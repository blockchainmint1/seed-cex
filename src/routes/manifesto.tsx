import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export const Route = createFileRoute("/manifesto")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "The Seeds Manifesto — Custody Is the Bug" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "Why Seeds refuses custody, told through the exchange failures that prove the point: Binance's $6.3B hack, BitMart's wind-down, Bitget, Bybit, FTX, Celsius, QuadrigaCX and Mt. Gox.",
      },
      { property: "og:title", content: "The Seeds Manifesto — Custody Is the Bug" },
      {
        property: "og:description",
        content:
          "Twelve years of exchange hacks and collapses share one root cause. What we believe, what we built, and what we have not solved yet.",
      },
    ],
  }),
  component: Manifesto,
});

/* ------------------------------------------------------------------ */
/* Sources — every figure on this page links to one of these.          */
/* ------------------------------------------------------------------ */

const sources = [
  { title: "Binance loses over $6 billion in 'biggest crypto hack in history'", outlet: "CoinDesk, 29 Oct 2026", url: "https://www.coindesk.com/business/2026/10/29/potential-multi-billion-binance-hack-hitting-crypto-markets" },
  { title: "Crypto giant Binance hit by $6.3bn hack suspected to be largest in history", outlet: "BBC News, 30 Oct 2026", url: "https://www.bbc.com/news/articles/cwg7xp8kx4v5o" },
  { title: "Binance aims to reopen withdrawals after $6.3 billion hack", outlet: "PYMNTS, 15 Nov 2026", url: "https://www.pymnts.com/cryptocurrency/2026/binance-aims-to-reopen-withdrawals-after-6-3-billion-hack/" },
  { title: "Binance says it has fully covered the $6.34 billion hack with company funds", outlet: "Bitcoin Magazine, 12 Nov 2026", url: "https://bitcoinmagazine.com/news/binance-covers-6-34-billion-hack" },
  { title: "Binance sees $3.64 billion in net outflows as withdrawals resume", outlet: "CNBC, 2 Nov 2026", url: "https://www.cnbc.com/2026/11/02/binance-outflow-hack-bitcoin.html" },
  { title: "Bitget security incident (September 2026): official progress update", outlet: "Bitget, updated 13 Oct 2026", url: "https://www.bitget.com/campaigns/bitget-security-incident-2026" },
  { title: "Bitget hacked via zero-day in third-party security products", outlet: "BleepingComputer, 30 Sep 2026", url: "https://www.bleepingcomputer.com/news/security/bitget-hacked-via-zero-day-in-third-party-security-products/" },
  { title: "Important notice: please do not deposit, and update on the restructuring", outlet: "BitMart support centre", url: "https://bitmart.zendesk.com/hc/en-us/articles/58276355031579-Important-Notice-Please-Do-Not-Deposit-and-Update-on-the-Restructuring" },
  { title: "Announcement on BitMart's initial indicative proposal and roadmap", outlet: "BitMart, 30 Sep 2026", url: "https://www.bitmart.com/en-US/support/articles/7922665245339/39162120325403/56571281537051" },
  { title: "BitMart holds two formal consultations and starts legal drafting", outlet: "TokenPost, 13 Nov 2026", url: "https://www.tokenpost.com/news/business/56634" },
  { title: "BitMart weighs partial restart and creditor payouts weeks after announcing shutdown", outlet: "CoinDesk, 22 Aug 2026", url: "https://www.coindesk.com/business/2026/08/22/crypto-exchange-bitmart-weighs-partial-restart-and-creditor-payouts-weeks-after-announcing-shutdown" },
  { title: "Crypto exchange BitMart hacked with losses estimated at $196M", outlet: "CoinDesk, 4 Dec 2021", url: "https://www.coindesk.com/business/2021/12/05/crypto-exchange-bitmart-hacked-with-losses-estimated-at-196-million" },
  { title: "BitMart says it will compensate victims of $196 million hack", outlet: "CNBC, 5 Dec 2021", url: "https://www.cnbc.com/2021/12/05/hackers-take-196-million-from-crypto-exchange-bitmart-in-large-breach.html" },
  { title: "Binance says more than $40 million in bitcoin stolen in 'large scale' hack", outlet: "TechCrunch, 7 May 2019", url: "https://techcrunch.com/2019/05/07/binance-breach/" },
  { title: "AMA with CZ, May 8, 2019", outlet: "Binance blog", url: "https://www.binance.com/en/blog/from-our-ceo/332782515450425344" },
  { title: "North Korea responsible for $1.5 billion Bybit hack", outlet: "FBI public service announcement, 26 Feb 2025", url: "https://www.fbi.gov/investigate/cyber/alerts/2025/north-korea-responsible-for-1-5-billion-bybit-hack" },
  { title: "FBI confirms Lazarus hackers were behind $1.5B Bybit crypto heist", outlet: "BleepingComputer, 27 Feb 2025", url: "https://www.bleepingcomputer.com/news/security/fbi-confirms-lazarus-hackers-were-behind-15b-bybit-crypto-heist/" },
  { title: "Bankman-Fried sentenced to 25 years for multi-billion dollar FTX fraud", outlet: "Reuters, 28 Mar 2024", url: "https://www.reuters.com/technology/sam-bankman-fried-be-sentenced-multi-billion-dollar-ftx-fraud-2024-03-28/" },
  { title: "Founder of Celsius sentenced to 12 years for fraud and market manipulation", outlet: "US Attorney's Office, SDNY, 8 May 2025", url: "https://www.justice.gov/usao-sdny/pr/founder-celsius-sentenced-12-years-fraud-and-market-manipulation" },
  { title: "Celsius founder Alex Mashinsky sentenced to 12 years in prison", outlet: "The Verge, 8 May 2025", url: "https://www.theverge.com/news/663877/celsius-founder-alex-mashinsky-12-years-sentenced" },
  { title: "QuadrigaCX: a review by staff of the Ontario Securities Commission", outlet: "Ontario Securities Commission, June 2020", url: "https://www.osc.ca/quadrigacxreport/" },
  { title: "Mt. Gox begins repaying bitcoin to creditors a decade after collapse", outlet: "CNBC, 5 Jul 2024", url: "https://www.cnbc.com/2024/07/05/mt-gox-begins-repaying-bitcoin-to-creditors-a-decade-on-from-collapse.html" },
  { title: "Notice regarding commencement of repayments in Bitcoin and Bitcoin Cash", outlet: "Mt. Gox rehabilitation trustee, 24 Jun 2024", url: "https://www.mtgox.com/img/pdf/20240624_announcement_en.pdf" },
  { title: "Exchange hacks and collapses since 2011", outlet: "Casa, updated 30 Oct 2026", url: "https://casa.io/exchange-hacks" },
  { title: "The biggest crypto hacks of 2026 so far, ranked", outlet: "Guardian (security firm), 8 Nov 2026, using DefiLlama data", url: "https://guardian.security/blog/biggest-crypto-hacks-2026/" },
  { title: "BitMart proposes court-backed plan offering users payouts or tokens tied to its 2021 hack", outlet: "Unchained, 1 Oct 2026", url: "https://unchainedcrypto.com/bitmart-proposes-court-backed-plan-offering-users-payouts-or-tokens-tied-to-its-2021-hack/" },
] as const;

const S = {
  coindeskBinance: 1, bbcBinance: 2, pymntsBinance: 3, btcmagBinance: 4, cnbcBinance: 5,
  bitgetOfficial: 6, bleepBitget: 7, bitmartNotice: 8, bitmartProposal: 9, tokenpostBitmart: 10,
  coindeskBitmart26: 11, coindeskBitmart21: 12, cnbcBitmart21: 13, techcrunchBinance19: 14,
  binanceAma19: 15, fbiBybit: 16, bleepBybit: 17, reutersFtx: 18, dojCelsius: 19, vergeCelsius: 20,
  oscQuadriga: 21, cnbcGox: 22, goxTrustee: 23, casa: 24, guardian2026: 25, unchainedBitmart: 26,
} as const;

function Cite({ n }: { n: number }) {
  return (
    <sup className="ml-0.5 align-super text-[10px]">
      <a
        href={`#source-${n}`}
        className="font-mono text-primary tabular-nums no-underline hover:underline"
        aria-label={`Source ${n}`}
      >
        [{n}]
      </a>
    </sup>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

type Failure = {
  when: string;
  who: string;
  kind: "Hack" | "Fraud" | "Collapse" | "Wind-down";
  amount: string;
  body: ReactNode;
};

const timeline: Failure[] = [
  {
    when: "February 2014",
    who: "Mt. Gox",
    kind: "Collapse",
    amount: "Up to 950,000 BTC",
    body: (
      <>
        Once the largest bitcoin exchange in the world, Mt. Gox filed for bankruptcy after a series
        of thefts. Estimates of the missing bitcoin run from about 740,000 to 950,000. Customers
        started getting coins back in July 2024 — ten years later.
        <Cite n={S.cnbcGox} />
        <Cite n={S.goxTrustee} />
      </>
    ),
  },
  {
    when: "February 2019",
    who: "QuadrigaCX",
    kind: "Fraud",
    amount: "C$215 million owed",
    body: (
      <>
        Canada’s largest exchange announced its CEO had died, and shut down weeks later owing about
        76,000 clients C$215 million. Staff of the Ontario Securities Commission concluded the
        collapse came from fraud by the CEO, who “spent, traded and used those assets at will.” Only
        C$46 million was found.
        <Cite n={S.oscQuadriga} />
      </>
    ),
  },
  {
    when: "May 2019",
    who: "Binance",
    kind: "Hack",
    amount: "7,000 BTC (~$40 million)",
    body: (
      <>
        Attackers collected API keys, two-factor codes and other account data, then pulled more
        than 7,000 bitcoin out of Binance’s bitcoin hot wallet in one transaction that passed the
        exchange’s own security checks. Binance covered it from its SAFU emergency fund.
        <Cite n={S.techcrunchBinance19} />
        <Cite n={S.binanceAma19} />
      </>
    ),
  },
  {
    when: "December 2021",
    who: "BitMart",
    kind: "Hack",
    amount: "~$196 million",
    body: (
      <>
        One stolen private key opened two BitMart hot wallets, on Ethereum and BNB Smart Chain. The
        thief swapped the tokens and ran them through a mixer. Early on, BitMart representatives
        called reports of the hack “fake news.” The CEO later confirmed it and promised to
        compensate users from company funds.
        <Cite n={S.coindeskBitmart21} />
        <Cite n={S.cnbcBitmart21} />
      </>
    ),
  },
  {
    when: "June–July 2022",
    who: "Celsius",
    kind: "Fraud",
    amount: "“Billions in losses”",
    body: (
      <>
        Celsius sold itself as the “safest place for your crypto,” then halted withdrawals and filed
        for bankruptcy weeks later. Its founder pleaded guilty to fraud and was sentenced to 12
        years in May 2025.
        <Cite n={S.dojCelsius} />
        <Cite n={S.vergeCelsius} />
      </>
    ),
  },
  {
    when: "November 2022",
    who: "FTX",
    kind: "Fraud",
    amount: "$8 billion",
    body: (
      <>
        A US judge found that FTX’s founder took $8 billion of customer money. He used it to cover
        his trading firm’s losses, buy property and make political donations. He was sentenced to
        25 years in March 2024.
        <Cite n={S.reutersFtx} />
      </>
    ),
  },
  {
    when: "February 2025",
    who: "Bybit",
    kind: "Hack",
    amount: "~$1.5 billion",
    body: (
      <>
        Attackers intercepted a routine transfer from one of Bybit’s cold wallets to a hot wallet
        and redirected it to themselves. The FBI attributed the theft to a North Korean group it
        calls TraderTraitor.
        <Cite n={S.fbiBybit} />
        <Cite n={S.bleepBybit} />
      </>
    ),
  },
  {
    when: "July 2026 — now",
    who: "BitMart",
    kind: "Wind-down",
    amount: "~$319.5 million shortfall",
    body: (
      <>
        Four and a half years after promising to cover its 2021 hack, BitMart announced on 26 July
        2026 that it was shutting down. It now attributes the hole in its balance sheet chiefly to
        that hack, valued at about $319.5 million at December 2021 prices. Trading stopped on 26
        August. As of mid-November, customers have no recovery rate and no date for withdrawals.
        <Cite n={S.bitmartNotice} />
        <Cite n={S.bitmartProposal} />
        <Cite n={S.tokenpostBitmart} />
      </>
    ),
  },
  {
    when: "24 September 2026",
    who: "Bitget",
    kind: "Hack",
    amount: "~$387.5 million",
    body: (
      <>
        Attackers broke into two third-party security appliances, moved onto Bitget’s wallet
        server, and forged withdrawal instructions that bypassed its risk controls. Bitget says no
        private keys leaked and cold wallets were untouched. The money still left through its own
        systems.
        <Cite n={S.bitgetOfficial} />
        <Cite n={S.bleepBitget} />
      </>
    ),
  },
  {
    when: "29 October 2026",
    who: "Binance",
    kind: "Hack",
    amount: "~$6.3 billion",
    body: (
      <>
        This is the largest crypto theft on record. Binance says the attack began in June. A wallet
        engineer installed a tampered setup file for an AI coding tool. Another opened malware
        hidden in a fake job interview’s coding test. Nine days after the attackers found a
        deployment permission they could use, they submitted withdrawals Binance’s systems
        accepted. Investigators linked it to the same North Korean group blamed for Bybit.
        <Cite n={S.coindeskBinance} />
        <Cite n={S.bbcBinance} />
        <Cite n={S.pymntsBinance} />
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* Theses                                                              */
/* ------------------------------------------------------------------ */

const theses: { n: string; title: string; body: ReactNode }[] = [
  {
    n: "I",
    title: "Custody is the bug, not the feature",
    body: (
      <>
        Every failure on the list above shares one root cause: somebody else held the keys. The
        attack methods differ — a stolen key, a fooled engineer, a hacked security box, a founder
        with a spending habit. The outcome is the same. When one company holds everyone’s coins, it
        becomes the single most valuable target in the room. An exchange that cannot lose your coins
        is not a feature request. It is the minimum viable design.
      </>
    ),
  },
  {
    n: "II",
    title: "A key you hand over is a key you have already shared",
    body: (
      <>
        If a website can read your recovery phrase, so can its staff, its attackers and anyone who
        compels it. Seeds never asks for your recovery phrase. You sign in with Honest.Money. Your
        savings stay in HME Wallet. Seeds only ever sees the trading pocket you choose to link, and
        you can revoke that link at any time. If anyone claiming to be Seeds asks for your phrase,
        it is not us.
      </>
    ),
  },
  {
    n: "III",
    title: "Convenience without disclosure is a lie",
    body: (
      <>
        Instant access sells. We would rather tell you exactly where the sharp edges are. When you
        choose instant access for your trading pocket, Seeds holds an encrypted key for that pocket
        so it can settle without asking you each time. In plain terms, that pocket is in our care
        while it is linked. Keep only what you are actively trading in it. Approve-every-trade mode
        exists for anyone who wants Seeds to hold nothing at all.
      </>
    ),
  },
  {
    n: "IV",
    title: "Settlement should be between people, on a public chain",
    body: (
      <>
        Markets do not need an omnibus account where everyone’s coins are mixed together. They need
        a fair queue, an honest price and a settlement both sides can check on the chain. When a
        Seeds trade settles, coins move from one member’s pocket to another’s. They do not pass
        through a Seeds wallet first.
      </>
    ),
  },
  {
    n: "V",
    title: "Covered is not recovered",
    body: (
      <>
        After a hack, the press release always says users are safe. Sometimes that is true: Binance
        says it replaced all $6.34 billion from company funds.
        <Cite n={S.btcmagBinance} /> But that only works when the company is big enough. Then it has
        to stay healthy for years afterward. BitMart made the same promise in 2021, and in 2026 it
        named that same hack as the hole that sank it. A promise to cover your loss is only as good
        as the balance sheet behind it.
      </>
    ),
  },
  {
    n: "VI",
    title: "Withdrawals stop before the public knows",
    body: (
      <>
        Mt. Gox, Celsius, Voyager and FTX all stopped withdrawals days or weeks before filing for
        bankruptcy.
        <Cite n={S.casa} /> By the time the news is public, the exit is already shut. The only
        reliable defense is to never put your coins behind someone else’s exit in the first place.
      </>
    ),
  },
  {
    n: "VII",
    title: "People are the attack surface",
    body: (
      <>
        Almost none of the largest losses were clever math. Bybit was a tricked signing process.
        Binance in 2026 was a fake job interview and a poisoned installer. Bitget was a security
        product with an unpatched hole. One security firm’s reading of DefiLlama data found that 11
        of 2026’s 15 largest hacks came through keys, signers, infrastructure or wallet devices, not
        smart-contract bugs.
        <Cite n={S.guardian2026} /> The fewer keys a company holds, the less there is for a tricked
        employee to give away.
      </>
    ),
  },
  {
    n: "VIII",
    title: "Proof beats promises",
    body: (
      <>
        A proof-of-reserves snapshot shows what an exchange holds at one moment. It does not show
        what the exchange owes, or what happens the next day. We would rather you never need to
        trust our books. That is why our code is public, our{" "}
        <Link to="/custody" className="text-primary underline underline-offset-2">
          custody ledger
        </Link>{" "}
        counts every key we hold in real time, and settlement happens where anyone can check it.
      </>
    ),
  },
  {
    n: "IX",
    title: "Bots should trade, never withdraw",
    body: (
      <>
        Many exchange break-ins start with stolen API keys. In the 2019 Binance hack, attackers
        gathered API keys and two-factor codes first.
        <Cite n={S.techcrunchBinance19} /> Seeds API keys can place and cancel orders. They cannot
        withdraw, by design. That is not a setting you can turn on.
      </>
    ),
  },
  {
    n: "X",
    title: "Build in the open, on open chains",
    body: (
      <>
        TEXITcoin is a public, auditable, proof-of-work chain, and TSD lives on its Omni layer.
        Anyone can verify a block, a balance or a transfer without asking us. Learn how it works at{" "}
        <a
          href="https://texitcoin.org/build"
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          texitcoin.org/build
        </a>
        .
      </>
    ),
  },
];

/* ------------------------------------------------------------------ */
/* What Seeds does, with honest status labels                          */
/* ------------------------------------------------------------------ */

type Status = "Live" | "Built" | "In testing" | "Being built";

const practices: { title: string; status: Status; body: string }[] = [
  {
    title: "One sign-in, and it is not a password we store",
    status: "Live",
    body: "You sign in with your Honest.Money account. Seeds keeps no passwords, so there is no Seeds password list to leak.",
  },
  {
    title: "Savings never touch Seeds",
    status: "Live",
    body: "HME Wallet keeps your savings and your trading pocket apart. Seeds only ever asks to link the trading pocket. If you revoke the link, HME Wallet moves you to a fresh pocket, and the old key is useless to Seeds.",
  },
  {
    title: "Approve every trade",
    status: "Being built",
    body: "In this mode, Seeds holds no key at all. Each trade waits for you to approve it in HME Wallet. HME Wallet supports this today. The Seeds side that executes approved trades is still being finished.",
  },
  {
    title: "Instant access, disclosed",
    status: "Built",
    body: "Seeds keeps an encrypted key for your trading pocket only, opens it briefly to settle a trade, then closes it. This is faster, and it is custody of that pocket for as long as it stays linked. We say so plainly.",
  },
  {
    title: "Locked trading balance",
    status: "In testing",
    body: "Your trading coins sit in a lock that needs both your key and Seeds’ key to move. If Seeds disappears, a timer lets you take everything back on your own. Seeds can never move it alone. A real-money test on TEXITcoin worked. We are waiting on HME Wallet to sign for the member’s half.",
  },
  {
    title: "P2P without holding the coins",
    status: "Built",
    body: "On the P2P market, Seeds checks that the seller’s coins are really there and watches them on the chain until the trade completes. The coins stay in the seller’s own pocket the whole time.",
  },
  {
    title: "Trading bots that cannot withdraw",
    status: "Live",
    body: "API keys can trade, cancel and read your account. They cannot send coins anywhere.",
  },
  {
    title: "Open code and a public key count",
    status: "Live",
    body: "The source code is public, and the custody ledger shows how many trading keys Seeds holds right now, and when each one expires.",
  },
];

const questions = [
  "Who can move my coins without me, and how many people is that?",
  "If the company vanished tonight, how would I get my coins back, and how long would it take?",
  "Are my coins mixed with everyone else’s in one wallet, or kept apart?",
  "Can a stolen API key or a hacked employee laptop withdraw my funds?",
  "When you say losses will be “covered,” covered from what money, and is that money enough?",
  "Do you publish what you owe customers, not just what you hold?",
  "Have withdrawals ever been paused? For how long, and why?",
  "Will you ever ask for my recovery phrase? (The only correct answer is no.)",
];

/* ------------------------------------------------------------------ */

const toc = [
  { id: "why-now", label: "Why we are writing this now" },
  { id: "record", label: "Twelve years of the same story" },
  { id: "patterns", label: "Four ways custody fails" },
  { id: "bitmart", label: "BitMart: the slow failure" },
  { id: "binance", label: "Binance: the fast one" },
  { id: "beliefs", label: "What we believe" },
  { id: "practice", label: "What we built" },
  { id: "unsolved", label: "What we have not solved" },
  { id: "questions", label: "Questions to ask any exchange" },
  { id: "promises", label: "Our promises" },
  { id: "sources", label: "Sources" },
];

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-12">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">{kicker}</p>
      <h2 className="mt-2 font-display text-2xl leading-tight font-semibold tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function StatusChip({ status }: { status: Status }) {
  const tone =
    status === "Live"
      ? "border-primary/50 text-primary"
      : status === "Built"
        ? "border-foreground/40 text-foreground"
        : "border-warning/60 text-warning";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${tone}`}
    >
      {status}
    </span>
  );
}

function Manifesto() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14">
        {/* Contents */}
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24">
            <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
              On this page
            </p>
            <ol className="mt-4 space-y-2 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="max-w-3xl">
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
            Manifesto · Updated 17 November 2026 · About 15 minutes
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] font-bold tracking-tight text-foreground sm:text-5xl">
            Custody is the bug.
            <br />
            <span className="text-primary">Escrow is the fix.</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-foreground/90">
            Seeds started from an uncomfortable question: what if an exchange simply refused the one
            power that makes exchanges dangerous? Here is what we believe, why we believe it, and
            where we still fall short — written plainly enough to be held against us.
          </p>

          <details className="mt-8 rounded-xl border border-border bg-card px-5 py-3 lg:hidden">
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
              On this page
            </summary>
            <ol className="mt-3 space-y-2 pb-2 text-sm">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">
                    {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          <div className="mt-12 space-y-14">
            <Section id="why-now" kicker="Part 1" title="Why we are writing this now">
              <p>
                On 29 October 2026, the largest crypto exchange in the world lost about $6.3 billion
                in a single day. It is the biggest theft in the history of crypto.
                <Cite n={S.coindeskBinance} /> Five weeks earlier, Bitget lost about $387.5 million.
                <Cite n={S.bitgetOfficial} /> Meanwhile BitMart, an exchange that had run for nine
                years, was quietly winding down. It told customers the hole in its books traced back
                to a hack it had promised to cover in 2021.
                <Cite n={S.bitmartProposal} />
              </p>
              <p>
                These are not three unlucky companies. They are three versions of the same problem,
                and that problem is older than most of the people now trading crypto. By one count,
                more than $34 billion of customer money has been lost, stolen or frozen at
                exchanges, lenders and custodial wallets since 2011, across 155 incidents.
                <Cite n={S.casa} /> In one tracker’s data, 2026 is already the worst year on
                record for crypto hacks by value.
                <Cite n={S.guardian2026} />
              </p>
              <p>
                The industry’s answer is always the same: more security staff, more audits, more
                insurance, a bigger emergency fund. Some of that helps. None of it changes the basic
                design. The exchange holds the keys to everyone’s money, so the exchange is the
                target. We think the design is the bug.
              </p>
            </Section>

            <Section id="record" kicker="Part 2" title="Twelve years of the same story">
              <p>
                Here are ten failures, oldest first. They cover every kind of
                company: small, huge, regulated, unregulated, honest and fraudulent. Read the
                causes, not just the dollar amounts.
              </p>
              <ol className="mt-6 space-y-5">
                {timeline.map((f) => (
                  <li
                    key={`${f.who}-${f.when}`}
                    className="rounded-xl border border-border bg-card p-5"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="font-display text-lg font-semibold text-foreground">
                        {f.who}
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                          {f.when}
                        </span>
                      </h3>
                      <p className="font-mono text-sm text-foreground tabular-nums">{f.amount}</p>
                    </div>
                    <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-primary uppercase">
                      {f.kind}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                  </li>
                ))}
              </ol>
              <p className="text-sm">
                Amounts are in US dollars at the time, as reported by the sources. Later repayments
                are not subtracted.
              </p>
            </Section>

            <Section id="patterns" kicker="Part 3" title="Four ways custody fails">
              <p>
                Strip away the names and the list sorts into four patterns. Each one depends on a
                company holding keys that can move customer money.
              </p>
              <h3 className="pt-2 font-display text-lg font-semibold text-foreground">
                1. A key gets stolen
              </h3>
              <p>
                Exchanges keep a “hot wallet” online so withdrawals can go out quickly. That wallet
                is protected by a private key, and whoever has the key has the coins. BitMart lost
                about $196 million this way in 2021, from one key that opened two wallets.
                <Cite n={S.coindeskBitmart21} /> Mt. Gox lost far more over several years.
              </p>
              <h3 className="pt-2 font-display text-lg font-semibold text-foreground">
                2. A person gets fooled
              </h3>
              <p>
                The newer attacks don’t steal the key. They trick the systems and people who use
                it. Bybit’s attackers hijacked a routine transfer between its own wallets.
                <Cite n={S.bleepBybit} /> Bitget’s attackers came in through a hole in a security
                product it had bought.
                <Cite n={S.bleepBitget} /> Binance’s attackers spent months on a fake job interview
                and a poisoned software installer before they could submit withdrawals that looked
                legitimate.
                <Cite n={S.pymntsBinance} /> Bitget and Binance both said their private keys never
                leaked. The money still left, because their systems were built to send it when
                asked.
              </p>
              <h3 className="pt-2 font-display text-lg font-semibold text-foreground">
                3. The owner spends your money
              </h3>
              <p>
                FTX, Celsius and QuadrigaCX were not hacked. The people at the top used customer
                deposits as their own: for trading, property, political donations, and to hide
                losses. Each was told, in public, that the coins were safe.
                <Cite n={S.reutersFtx} />
                <Cite n={S.dojCelsius} />
                <Cite n={S.oscQuadriga} /> A company that holds your coins can lend them, bet them or
                lose them, and you find out last.
              </p>
              <h3 className="pt-2 font-display text-lg font-semibold text-foreground">
                4. The hole stays hidden
              </h3>
              <p>
                The quietest failure is a loss that is “covered” on paper and carried for years.
                That is the BitMart story, and it deserves its own section.
              </p>
            </Section>

            <Section id="bitmart" kicker="Part 4" title="BitMart: the slow failure">
              <p>
                In December 2021, BitMart lost about $196 million from two hot wallets. At first,
                its representatives called the reports “fake news.”
                <Cite n={S.coindeskBitmart21} /> Within days the CEO confirmed the breach and said
                BitMart would reimburse victims with its own money. Trading resumed.
                <Cite n={S.cnbcBitmart21} /> For most customers, the story ended there.
              </p>
              <p>
                It didn’t end there. On 26 July 2026, BitMart announced an orderly wind-down. It
                stopped deposits, ended all trading on 26 August, and set 31 January 2027 as its
                last day of operation.
                <Cite n={S.bitmartNotice} /> The first notice gave no clear reason.
                <Cite n={S.coindeskBitmart26} /> By 30 September, BitMart’s own account was blunt:
                a bad year for trading, losses from wash-trading groups, and a balance-sheet deficit
                tied to the 2021 hack, valued at about $319.5 million at December 2021 prices.
                <Cite n={S.bitmartProposal} />
              </p>
              <p>
                BitMart’s proposed fix turns every customer’s account into a single dollar figure.
                Customers can then take a share of whatever liquid assets remain, or accept new
                tokens that pay out only if BitMart recovers money from the 2021 thief, or from its
                other investments.
                <Cite n={S.unchainedBitmart} /> As of 13 November, BitMart had not published
                expected recovery rates or a date for withdrawals. It is still asking a court to
                approve the plan.
                <Cite n={S.tokenpostBitmart} />
              </p>
              <p>
                The lesson is not that BitMart lied in 2021. It may well have meant every word. The
                lesson is that when an exchange holds your coins, a hack does not end on the day it
                happens. It sits on the balance sheet for years, quietly turning customer coins into
                a promise, until one bad year turns the promise into a court case.
              </p>
            </Section>

            <Section id="binance" kicker="Part 5" title="Binance: the fast one">
              <p>
                Binance is the opposite case, and it is the one other exchanges will point to.
                About $6.3 billion left its wallets on 29 October 2026.
                <Cite n={S.bbcBinance} /> Roughly $3 billion was frozen, including $2.3 billion in
                USDT and USDC that the stablecoin issuers blocked.
                <Cite n={S.coindeskBinance} /> Binance froze withdrawals, reopened them in stages
                from 1 November, and saw $3.64 billion in net outflows that first day as customers
                rushed for the exit.
                <Cite n={S.cnbcBinance} /> By 12 November it said it had replaced every affected
                token from company money. It drew on its SAFU emergency fund, part of its futures
                insurance fund and its corporate treasury.
                <Cite n={S.btcmagBinance} /> On 14 November it said it aimed to reopen the last
                networks by the end of the following week.
                <Cite n={S.pymntsBinance} />
              </p>
              <p>
                That is a remarkable recovery, and Binance deserves credit for it. It is also the
                strongest possible argument for our point. The world’s largest exchange did
                everything an exchange is supposed to do: cold storage, emergency funds, a big
                security team. A fake job interview still got through. Most companies could not
                write a $6 billion cheque. For BitMart, a $196 million hack became the hole it now
                blames for its shutdown.
              </p>
              <p>
                It is also not the first time. In May 2019, attackers gathered API keys and
                two-factor codes, then took more than 7,000 bitcoin from Binance’s hot wallet in a
                single transaction that “passed our existing security checks,” in Binance’s own
                words.
                <Cite n={S.techcrunchBinance19} /> Seven years later, the 2026 attack also passed the checks. When the design is “one
                company can send everyone’s coins,” the security budget only changes how hard the
                attackers have to work.
              </p>
            </Section>

            <Section id="beliefs" kicker="Part 6" title="What we believe">
              <p>
                Ten principles. Each one comes straight from the record above, and each one
                constrains what we are allowed to build.
              </p>
              <ol className="mt-6 space-y-8">
                {theses.map((t) => (
                  <li key={t.n} className="border-l-2 border-primary/40 pl-6">
                    <p className="font-mono text-xs tracking-[0.2em] text-primary">{t.n}</p>
                    <h3 className="mt-2 font-display text-lg font-semibold tracking-tight text-foreground">
                      {t.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="practice" kicker="Part 7" title="What we built — and how finished it is">
              <p>
                Beliefs are cheap. Here is what Seeds actually does, with an honest label on each
                one. “Live” means you can use it today. “Built” means the code is done but not yet
                switched on for live trading. “In testing” and “Being built” mean what they say.
              </p>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {practices.map((p) => (
                  <li key={p.title} className="rounded-xl border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-base font-semibold text-foreground">
                        {p.title}
                      </h3>
                      <StatusChip status={p.status} />
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  </li>
                ))}
              </ul>
              <p>
                You can read how each piece works on{" "}
                <Link to="/how-it-works" className="text-primary underline underline-offset-2">
                  How it works
                </Link>
                , check the code on{" "}
                <Link to="/proof/code" className="text-primary underline underline-offset-2">
                  Proof
                </Link>
                , and see the live key count on the{" "}
                <Link to="/custody" className="text-primary underline underline-offset-2">
                  custody ledger
                </Link>
                .
              </p>
            </Section>

            <Section id="unsolved" kicker="Part 8" title="What we have not solved">
              <p>
                A manifesto that only lists strengths is a sales page. Here is what is still hard.
              </p>
              <ul className="list-disc space-y-3 pl-5">
                <li>
                  <span className="font-semibold text-foreground">
                    Instant access is a trade-off.
                  </span>{" "}
                  If you choose it, Seeds holds the key to your trading pocket while it is linked.
                  That pocket carries the same kind of risk as any exchange, just limited to what you
                  put in it. Keep the amount small, or use approve-every-trade.
                </li>
                <li>
                  <span className="font-semibold text-foreground">
                    The locked balance is not live yet.
                  </span>{" "}
                  It is the piece that makes instant trades safe without custody. It passed a
                  real-money test, but it needs HME Wallet to sign for your half before members can
                  use it.
                </li>
                <li>
                  <span className="font-semibold text-foreground">
                    Not holding your coins doesn’t mean nothing can go wrong.
                  </span>{" "}
                  Seeds can still have bugs, go offline or price something wrong. We can’t lose
                  coins we never held. We can still waste your time, and we will own that.
                </li>
                <li>
                  <span className="font-semibold text-foreground">You can still lose your keys.</span>{" "}
                  Self-custody moves the responsibility to you. If you lose your HME Wallet recovery
                  phrase, nobody — not Seeds, not Honest.Money — can rebuild it.
                </li>
                <li>
                  <span className="font-semibold text-foreground">
                    Cross-chain swaps are still in a small test.
                  </span>{" "}
                  Our swap page compares live THORChain and Maya prices. Only the Seeds team can send
                  swaps for now, with small limits, because one wrong address there is a permanent loss.
                </li>
                <li>
                  <span className="font-semibold text-foreground">We are new.</span> The companies
                  on our timeline had years of history before they failed. Ours is short. Judge us
                  by what we publish, not by what we promise.
                </li>
              </ul>
            </Section>

            <Section id="questions" kicker="Part 9" title="Questions to ask any exchange — including us">
              <p>
                You do not need to understand cryptography to protect yourself. You need to ask
                these questions, and walk away from anyone who can’t answer them in plain words.
              </p>
              <ol className="mt-4 space-y-3">
                {questions.map((q, i) => (
                  <li key={q} className="flex gap-4">
                    <span className="w-6 shrink-0 font-mono text-sm text-primary tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-foreground/90">{q}</span>
                  </li>
                ))}
              </ol>
              <p>
                BitMart’s own wind-down notice warns that it will never ask for passwords,
                two-factor codes, private keys or recovery phrases, because scammers are already
                pretending to be BitMart to “speed up” withdrawals.
                <Cite n={S.bitmartNotice} /> When an exchange fails, the scams come next. Never give
                anyone your recovery phrase.
              </p>
            </Section>

            <Section id="promises" kicker="Part 10" title="Our promises">
              <ul className="list-disc space-y-3 pl-5 marker:text-primary">
                <li>We will never ask for your recovery phrase, in any channel, for any reason.</li>
                <li>We will never ask to link your savings. Only the trading pocket you choose.</li>
                <li>We will tell you in plain words whenever a feature means we hold a key.</li>
                <li>We will publish how many keys we hold, and keep the code public.</li>
                <li>
                  If something goes wrong, we will say so first, plainly. We will never call it
                  “maintenance” or “fake news.”
                </li>
              </ul>
              <p>
                Hold us to these. If we break one, this page is the evidence. Seeds is part of the{" "}
                <a
                  href="https://honest.money"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary underline underline-offset-2"
                >
                  Honest Money Ecosystem
                </a>
                , and the name is the standard.
              </p>
            </Section>

            <section id="sources" className="scroll-mt-24 border-t border-border pt-12">
              <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
                Sources
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">
                Where every number comes from
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Figures are as reported by these sources as of 17 November 2026. Some 2026 numbers
                are still being updated by the companies involved. If you find an error, tell us
                and we will correct it here.
              </p>
              <ol className="mt-6 space-y-2 text-sm">
                {sources.map((s, i) => (
                  <li key={s.url} id={`source-${i + 1}`} className="flex scroll-mt-24 gap-3">
                    <span className="w-8 shrink-0 font-mono text-primary tabular-nums">
                      [{i + 1}]
                    </span>
                    <span className="min-w-0 text-muted-foreground">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="break-words text-foreground underline-offset-2 hover:text-primary hover:underline"
                      >
                        {s.title}
                      </a>{" "}
                      — {s.outlet}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <div className="mt-14 flex flex-wrap gap-3">
            <Link
              to="/how-it-works"
              className="rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-action-foreground"
            >
              See how Seeds works
            </Link>
            <a
              href="https://texitcoin.org/build"
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-xl border border-foreground/60 px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Learn TXC + Omni L2
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}
