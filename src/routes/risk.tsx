import { createFileRoute, Link } from "@tanstack/react-router";
import { B, Callout, List, Section, Sub } from "@/components/site/LegalDoc";

export const Route = createFileRoute("/risk")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Risk Disclosure Statement — Seeds" },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      {
        name: "description",
        content:
          "The full Seeds risk disclosure: price swings, small-coin liquidity, TSD and stablecoin risk, blockchain confirmations, wallet keys, P2P scams, locked balances, swaps, bots, legal and tax.",
      },
      { property: "og:title", content: "Risk Disclosure Statement — Seeds" },
      {
        property: "og:description",
        content:
          "Everything that can go wrong when you trade crypto on Seeds, written plainly so you can decide with open eyes.",
      },
    ],
  }),
  component: RiskPage,
});

const toc = [
  { id: "first", label: "Read this first" },
  { id: "what", label: "What Seeds is and is not" },
  { id: "total-loss", label: "You can lose everything" },
  { id: "price", label: "Price and market risk" },
  { id: "liquidity", label: "Liquidity and small coins" },
  { id: "stablecoins", label: "TSD and other stablecoins" },
  { id: "background", label: "BTC, LTC and ETH behind the scenes" },
  { id: "chains", label: "Blockchain and network risk" },
  { id: "keys", label: "Your keys and your wallet" },
  { id: "pocket", label: "Trading pocket access modes" },
  { id: "lock", label: "Locked trading balances" },
  { id: "settlement", label: "How trades settle" },
  { id: "p2p", label: "P2P marketplace" },
  { id: "swaps", label: "Cross-chain swaps" },
  { id: "bots", label: "Bots and the API" },
  { id: "software", label: "Software and security" },
  { id: "partners", label: "Partners we depend on" },
  { id: "service", label: "Service changes and shutdown" },
  { id: "legal", label: "Legal and regulatory" },
  { id: "tax", label: "Taxes" },
  { id: "advice", label: "No advice, and the Ignite class" },
  { id: "info", label: "Data and information" },
  { id: "privacy", label: "Public blockchains and privacy" },
  { id: "you", label: "Your responsibilities" },
  { id: "ack", label: "Acknowledgement" },
];

function RiskPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-16">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto pr-2">
            <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
              On this page
            </p>
            <ol className="mt-4 space-y-2 text-sm">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {i + 1}. {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="max-w-3xl">
          <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
            Risk disclosure · Last updated 17 November 2026 · About 20 minutes
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] font-bold tracking-tight text-foreground sm:text-5xl">
            Risk Disclosure Statement
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-foreground/90">
            Trading crypto is risky. Trading it on a young exchange, in small coins, with tools that
            are still being finished, is riskier still. This page lists the risks we know about, in
            plain words, so you can decide with your eyes open. Please read all of it before you
            trade, list a P2P ad, link a wallet or pay for a class.
          </p>

          <details className="mt-8 rounded-xl border border-border bg-card px-5 py-3 lg:hidden">
            <summary className="cursor-pointer font-mono text-[11px] tracking-[0.24em] text-primary uppercase">
              On this page
            </summary>
            <ol className="mt-3 space-y-2 pb-2 text-sm">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-muted-foreground hover:text-foreground">
                    {i + 1}. {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </details>

          <div className="mt-12 space-y-12">
            <Section id="first" n={1} title="Read this first">
              <p>If you read nothing else, read these ten points:</p>
              <List
                items={[
                  <>
                    <B>You can lose all the money you put in.</B> Crypto prices can fall to zero,
                    and nobody will make you whole.
                  </>,
                  <>
                    <B>Blockchain payments are final.</B> Coins sent to the wrong address, or to a
                    scammer, are almost always gone for good.
                  </>,
                  <>
                    <B>Some of our coins are small.</B> TXC, ISK, ZCU and TSD trade in thin
                    markets. You may not be able to sell when you want, or at the price you want.
                  </>,
                  <>
                    <B>A stablecoin is only as good as whoever stands behind it.</B> TSD, USDC and
                    USDT can lose their $1 value or be frozen by their issuers.
                  </>,
                  <>
                    <B>Your recovery phrase is your money.</B> Lose it and nobody, including us,
                    can get your coins back. Seeds will never ask you for it.
                  </>,
                  <>
                    <B>&ldquo;Instant access&rdquo; means trusting Seeds.</B> If you let Seeds
                    sign trades for you without asking, Seeds can move the funds in that trading
                    pocket. Keep only what you are actively trading there.
                  </>,
                  <>
                    <B>P2P trades involve strangers and banks.</B> Bank and app payments can be
                    reversed, faked or frozen. Seeds does not hold the coins in a P2P trade.
                  </>,
                  <>
                    <B>Parts of Seeds are still being built or tested.</B> Each part is labelled.
                    Unfinished features can fail in ways we have not seen yet.
                  </>,
                  <>
                    <B>There is no insurance.</B> Your crypto is not a bank deposit. No government
                    fund protects it.
                  </>,
                  <>
                    <B>Nothing on Seeds is advice.</B> Not the pages, not the class, not the
                    Telegram alerts. Your decisions are your own.
                  </>,
                ]}
              />
            </Section>

            <Section id="what" n={2} title="What Seeds is and is not">
              <p>
                Seeds is trading software that is part of the{" "}
                <a href="https://honest.money" target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-4 hover:underline">
                  Honest Money Ecosystem
                </a>
                . It matches buyers and sellers, shows prices, and helps trades settle between
                members&rsquo; own wallets. You sign in with your Honest.Money account and trade
                from a trading pocket in HME Wallet.
              </p>
              <p>Seeds is not:</p>
              <List
                items={[
                  "a bank, and your balances are not deposits;",
                  "a broker, investment adviser or financial planner;",
                  "an insurer or guarantor of any coin, stablecoin or counterparty;",
                  "the issuer of TSD, TXC, ISK, ZCU, USDC, USDT or any other coin we list;",
                  "a party to P2P trades between members, beyond providing the software, alerts and dispute help.",
                ]}
              />
              <p>
                We design Seeds so that, wherever we can, your coins stay in wallets you control.
                &ldquo;Non-custodial&rdquo; describes how the software is built. It is not a
                promise that you cannot lose money, and some access choices described below give
                Seeds more power over your funds than others.
              </p>
            </Section>

            <Section id="total-loss" n={3} title="You can lose everything">
              <p>
                Crypto assets are not backed by a government. Most are not backed by anything at
                all except what people are willing to pay for them. Their value can fall sharply,
                quickly, and permanently. Coins have gone to zero before, and they will again.
              </p>
              <p>
                Only trade with money you can afford to lose completely, without it changing your
                rent, your bills, your debts or your family&rsquo;s plans. Do not borrow to trade.
                Do not trade money you were saving for something specific. Past price rises,
                including any you hear about in the Ignite class or from other members, tell you
                nothing reliable about the future.
              </p>
              <Callout>
                If losing what you are about to put in would hurt you, stop here and put in less,
                or nothing.
              </Callout>
            </Section>

            <Section id="price" n={4} title="Price and market risk">
              <Sub title="Prices move fast">
                <p>
                  Crypto trades every hour of every day. Prices can move ten, twenty or fifty
                  percent in a day, sometimes in minutes, while you are asleep. An order you
                  placed at a good price can look like a bad one by morning.
                </p>
              </Sub>
              <Sub title="Your order may fill at a worse price">
                <p>
                  When few people are trading, the gap between the best buy and best sell price
                  (the &ldquo;spread&rdquo;) can be wide. A large order can eat through several
                  price levels and fill at a worse average price than you expected. Always check
                  the order book and the final amount before you confirm.
                </p>
              </Sub>
              <Sub title="Small markets are easier to push around">
                <p>
                  In thin markets, one person with enough money can move the price on purpose,
                  place orders they never mean to fill, or trade with themselves to make volume
                  look bigger. We watch for this and act when we find it, but we cannot catch
                  everything, and a price on Seeds may not match what the same coin costs
                  elsewhere.
                </p>
              </Sub>
              <Sub title="Market-following prices change on their own">
                <p>
                  Some P2P ads follow a market price instead of a fixed number. The price you see
                  when you open the ad may be different a minute later. The price is locked only
                  once an order opens.
                </p>
              </Sub>
            </Section>

            <Section id="liquidity" n={5} title="Liquidity and small coins">
              <p>
                &ldquo;Liquidity&rdquo; means being able to sell when you want to, near the price
                you expect. Several coins on Seeds &mdash; TEXITcoin (TXC), ISK, ZCU and the Texas
                Stable Dollar (TSD) &mdash; are young and trade in small volumes compared with
                Bitcoin or Ethereum.
              </p>
              <List
                items={[
                  "There may be no buyer at all for your coins at a given moment.",
                  "Few or no other exchanges may list these coins, so you may have nowhere else to sell them.",
                  "A single large seller can drop the price sharply.",
                  "The projects behind these coins are small. If developers, miners or businesses stop supporting a coin, it can lose most or all of its value.",
                  "Seeds may stop offering a market if it becomes unsafe or too thin. You would still hold your coins, but might have fewer places to trade them.",
                ]}
              />
              <p>
                Displayed volume, liquidity and market statistics come from activity on Seeds and
                from outside sources. They can be wrong, delayed, or not representative of the
                price you will actually get.
              </p>
            </Section>

            <Section id="stablecoins" n={6} title="TSD and other stablecoins">
              <p>
                Most Seeds markets are priced in the Texas Stable Dollar (TSD). Stablecoins aim to
                stay worth $1, but &ldquo;stable&rdquo; is a goal, not a guarantee.
              </p>
              <Sub title="TSD">
                <List
                  items={[
                    <>
                      TSD is a token (Omni property #39) on the TEXITcoin blockchain. It is issued
                      and redeemed by TSD Swap at{" "}
                      <a href="https://tsd.honest.money" target="_blank" rel="noreferrer noopener" className="text-primary underline-offset-4 hover:underline">
                        tsd.honest.money
                      </a>
                      , not by Seeds. Read more on our <Link to="/tsd" className="text-primary underline-offset-4 hover:underline">TSD page</Link>.
                    </>,
                    "TSD's value depends on the issuer holding enough reserves and honouring redemptions. If reserves fall short, are lost, frozen or mismanaged, TSD can trade below $1 or become unredeemable.",
                    "Redemptions can be paused, delayed, limited or charged fees by the issuer.",
                    "Seeds treats TSD as worth $1 for pricing and display. That is a convenience, not a promise that you can get $1 for it.",
                    "TSD relies on both the TEXITcoin network and the Omni layer working correctly. Problems in either can delay or break TSD transfers.",
                  ]}
                />
              </Sub>
              <Sub title="USDC and USDT">
                <List
                  items={[
                    "USDC is issued by Circle and USDT by Tether. They can freeze or blacklist addresses, and coins at a frozen address cannot be moved.",
                    "Both have briefly lost their $1 value before. They depend on banks and reserves outside anyone's control at Seeds.",
                    "USDC and USDT on Seeds live on EVM networks such as Ethereum. Network fees there can be high and change quickly.",
                    "Sending a stablecoin on the wrong network, or to an address on a different network, can lose it permanently.",
                  ]}
                />
              </Sub>
            </Section>

            <Section id="background" n={7} title="BTC, LTC and ETH behind the scenes">
              <p>
                When you trade Bitcoin, Litecoin or Ethereum against TSD on Seeds, the balance you
                see is labelled with the real coin&rsquo;s name. To settle quickly, some of these
                trades use tokens issued on the TEXITcoin network by a separate issuer, each backed
                one-for-one by real coins it holds. Seeds handles this conversion in the
                background.
              </p>
              <p>That convenience adds risks you should know about:</p>
              <List
                items={[
                  <>
                    <B>While converted, you rely on the issuer.</B> The real BTC, LTC or ETH sits
                    with the issuer, not in your wallet. If the issuer is hacked, fails,
                    mismanages reserves or stops redeeming, you could lose some or all of that
                    value.
                  </>,
                  "Converting in and out takes time. Deposits must reach enough confirmations first; withdrawals back to the real coin can be delayed by the issuer's checks, limits or reviews.",
                  "Large amounts may need manual review and can wait longer.",
                  "The issuer can pause conversions, for example during a network problem or a security event.",
                  "Fees on the Bitcoin, Litecoin or Ethereum networks are paid when coins move in or out, and can be high when those networks are busy.",
                ]}
              />
            </Section>

            <Section id="chains" n={8} title="Blockchain and network risk">
              <Sub title="Payments are final">
                <p>
                  Once a blockchain payment confirms, it cannot be reversed by Seeds, by the coin&rsquo;s
                  developers or by anyone else. Check every address and amount. A single wrong
                  character can send your coins somewhere nobody can recover them.
                </p>
              </Sub>
              <Sub title="Until a payment confirms, it is not done">
                <p>
                  A payment waiting to be confirmed can be replaced by a different payment of the
                  same coins &mdash; for example, by someone paying a higher fee to send them
                  somewhere else. That is why Seeds waits for confirmations before it treats a
                  trade as settled (two blocks on TEXITcoin, about six minutes in normal
                  conditions). Waiting reduces this risk; it does not remove it completely.
                </p>
              </Sub>
              <Sub title="Small networks are easier to attack">
                <p>
                  Smaller blockchains such as TEXITcoin, ISK and ZCU have less mining power
                  protecting them than Bitcoin. Someone with enough mining power could rewrite
                  recent blocks and undo payments that looked confirmed (a &ldquo;51%
                  attack&rdquo; or &ldquo;reorganisation&rdquo;). If that happens, trades that
                  looked finished may not be.
                </p>
              </Sub>
              <Sub title="Other network risks">
                <List
                  items={[
                    "Networks can slow down, stall, or split into two competing versions (a 'fork'). Seeds may pause trading in that coin until things settle.",
                    "Network fees can rise suddenly. A payment with too low a fee can sit unconfirmed for a long time.",
                    "Bugs in a coin's own software, or in the Omni layer that carries tokens like TSD on TEXITcoin, could cause lost or stuck funds.",
                    "Seeds reads blockchains through servers we and others run. If those are out of date or wrong, balances and statuses on Seeds can be wrong until they catch up.",
                    "Network rules can change through upgrades, and a change can affect how Seeds works with that coin.",
                  ]}
                />
              </Sub>
            </Section>

            <Section id="keys" n={9} title="Your keys and your wallet">
              <p>
                Your coins are controlled by the private keys in your HME Wallet, which come from
                your recovery phrase. Whoever has the phrase has the coins.
              </p>
              <List
                items={[
                  <>
                    <B>Seeds cannot recover your phrase.</B> If you lose it, or lose access to the
                    device holding your wallet without a backup, your coins may be gone for good.
                  </>,
                  <>
                    <B>Seeds will never ask for your recovery phrase</B> &mdash; not by email, not
                    on Telegram, not in a P2P chat, not on a call. Anyone who asks is trying to rob
                    you.
                  </>,
                  "Fake websites, fake apps and fake support accounts copy real ones. Always check you are on seeds.honest.money and mobile.honest.money before signing in or approving anything.",
                  "Malware on your phone or computer can steal keys, change copied addresses, or trick you into approving a payment you did not mean. Keep your devices updated and be careful what you install.",
                  "Anyone with access to your Honest.Money account or email may be able to sign in to Seeds as you. Protect them with strong, unique passwords.",
                  "Read every approval in HME Wallet before you confirm it. Approving a transaction is the same as signing a cheque.",
                ]}
              />
            </Section>

            <Section id="pocket" n={10} title="Trading pocket access modes">
              <p>
                You trade on Seeds from a separate trading pocket in HME Wallet, kept apart from
                your savings. When you link it, you choose how much Seeds may do on its own.
              </p>
              <Sub title="Approve every trade">
                <p>
                  Seeds proposes each payment and you approve it in HME Wallet. Seeds holds no key
                  that can move your coins. This is the safest mode, but trades are slower, and a
                  trade can fail or be cancelled if you do not approve in time.
                </p>
              </Sub>
              <Sub title="Instant access">
                <p>
                  You give Seeds a key to your trading pocket so trades settle without asking you
                  each time. This is faster, but <B>it means Seeds can move the funds in that
                  pocket</B>. In practice, this is like leaving those funds with Seeds.
                </p>
                <List
                  items={[
                    "A bug, an insider, or someone who breaks into Seeds' servers could misuse that key while it is in use.",
                    "Seeds limits each trade with caps and checks, but limits reduce damage; they do not make it impossible.",
                    "Keep only what you are actively trading in an instant-access pocket. Leave savings elsewhere.",
                    "You can revoke access from HME Wallet at any time. Revoking retires the pocket; trades already being settled may still complete.",
                    "Some coins (such as DOGE, BCH, ZEC, XRP, TRX and SOL) can only be linked in instant-access mode.",
                  ]}
                />
              </Sub>
            </Section>

            <Section id="lock" n={11} title="Locked trading balances">
              <Callout>
                <B>Status: in testing.</B> Locked balances have passed small real-money tests but
                are not yet open to members. Everything below describes how they are designed to
                work.
              </Callout>
              <p>
                A locked balance moves your trading coins into a shared address that needs both
                your signature and Seeds&rsquo; signature to spend. It also has a built-in
                refund: after a waiting period shown when you create the lock, you can take the
                coins back on your own, without Seeds.
              </p>
              <List
                items={[
                  "While coins are locked, you cannot spend them alone until the waiting period ends. If Seeds goes offline, you must wait out the full period to get them back.",
                  "To use the refund, you need your own key and a tool that can build the refund payment. If you lose your key, the refund cannot help you.",
                  "Seeds' half of the key is kept in Amazon Web Services' key service. An outage there can pause trading out of locks.",
                  "The lock relies on exact scripts and on TEXITcoin and Omni behaving as tested. A flaw in our code, in HME Wallet, or in those networks could cause stuck or lost funds.",
                  "Seeds signs only payments it built itself and records every coin it has signed for, so it will not sign the same coin twice. These are protections, not guarantees.",
                  "Whether a locked balance counts as 'custody' under the law where you live is a legal question that is still being reviewed.",
                ]}
              />
            </Section>

            <Section id="settlement" n={12} title="How trades settle">
              <p>
                When your order matches, each side sends its coins directly to the other. Each of
                those payments is a separate blockchain transaction, and things can go wrong
                between them.
              </p>
              <List
                items={[
                  "One side may arrive and the other may be delayed, fail, or be held for review.",
                  "Seeds checks both sides can pay before sending anything, but a balance can change between the check and the payment.",
                  "A trade is not finished until both sides are confirmed on their blockchains. Until then its status may change.",
                  "Some settlement paths are still being built. Each market and feature shows its current status; trades in unfinished paths may not settle on-chain automatically.",
                  "If settlement fails, Seeds may retry, cancel, or freeze the trade and open a review. Reviews take time, and the outcome is not guaranteed to be the one you want.",
                  "Network fees are paid out of the coins being moved and can change the final amount you receive.",
                ]}
              />
            </Section>

            <Section id="p2p" n={13} title="P2P marketplace">
              <p>
                The P2P marketplace connects you with other members who want to trade crypto for
                regular money &mdash; Zelle, Venmo, Cash App, PayPal, bank transfers or cash. The
                regular-money side happens completely outside Seeds.
              </p>
              <Sub title="Seeds does not hold the coins">
                <p>
                  Seeds uses &ldquo;lock and watch&rdquo;: when an order opens, Seeds reserves the
                  seller&rsquo;s coins against their live trading-pocket balance and watches the
                  blockchain. If the balance drops, Seeds flags the order. But{" "}
                  <B>this is not escrow</B>. A dishonest seller with access to their own wallet
                  can still move the coins before releasing them to you.
                </p>
              </Sub>
              <Sub title="Payment risks">
                <List
                  items={[
                    "Bank and app payments can be reversed days or weeks later through chargebacks or fraud claims. A seller who released crypto may lose both the crypto and the money.",
                    "Screenshots and 'payment pending' emails can be faked. Sellers should confirm money in their real bank or app before releasing anything.",
                    "Banks and payment apps may freeze accounts used for crypto trades, or close them, and may hold the funds while they review.",
                    "Many payment apps forbid using their service for crypto trades. Breaking their rules can cost you your account.",
                    "Cash trades in person carry personal-safety risk. Meet only in busy public places and never alone.",
                    "Payment details and receipts you share can be misused by the other trader.",
                  ]}
                />
              </Sub>
              <Sub title="People risks">
                <List
                  items={[
                    "Seller scores, Honest.Money badges and trade history help, but they do not prove someone is honest. Accounts can be bought, borrowed or hijacked.",
                    "Scammers often try to move conversations off Seeds. Keep every message in the trade chat so it can be reviewed in a dispute.",
                    "Disputes are decided by people using the evidence available. They can take time and can get it wrong. Seeds cannot force a bank or another member to pay you.",
                    "New-buyer limits and block tools reduce, but do not remove, the risk of trading with strangers.",
                  ]}
                />
              </Sub>
            </Section>

            <Section id="swaps" n={14} title="Cross-chain swaps">
              <Callout>
                <B>Status: quotes only.</B> The <Link to="/swap" className="text-primary underline-offset-4 hover:underline">Swap</Link>{" "}
                page compares prices from THORChain and Maya but does not send anything yet.
              </Callout>
              <p>When sending is switched on, cross-chain swaps will carry extra risks:</p>
              <List
                items={[
                  "THORChain and Maya are independent networks that Seeds does not control. They have been hacked and halted in the past, and could be again.",
                  "Swaps are sent to a network address with special instructions attached. A wrong address or instruction can mean the coins are lost permanently. Seeds checks these several ways before allowing a send.",
                  "The amount you receive can be lower than the quote because of price movement, network fees and swap fees. If a swap cannot complete within limits, you may get a refund in the original coin, minus fees, after a delay.",
                  "These networks can pause trading in a coin, or all coins, at any time.",
                  "Cross-chain swaps can take from minutes to hours.",
                ]}
              />
            </Section>

            <Section id="bots" n={15} title="Bots and the API">
              <p>
                Members can connect trading bots through the{" "}
                <Link to="/api" className="text-primary underline-offset-4 hover:underline">Seeds API</Link>.
                Bots trade automatically, which means they can lose money automatically.
              </p>
              <List
                items={[
                  "A bug in your bot, a bad setting, or a misread price can place many bad orders very quickly.",
                  "Anyone who gets your API key and secret can trade with your account within that key's permissions. API keys cannot withdraw, but a thief can still trade at bad prices.",
                  "Limit each key's permissions and allowed IP addresses, and delete keys you no longer use.",
                  "Rate limits, outages and maintenance can stop your bot from cancelling orders in time.",
                  "Market data in the API can be delayed or incomplete.",
                ]}
              />
            </Section>

            <Section id="software" n={16} title="Software and security">
              <p>
                All software has bugs, and ours is no exception. We publish{" "}
                <Link to="/proof/code" className="text-primary underline-offset-4 hover:underline">our code</Link>,
                work with an outside security auditor, and test changes before they go live. None
                of that guarantees Seeds is free of mistakes.
              </p>
              <List
                items={[
                  "A bug could show a wrong balance, place or match an order incorrectly, settle the wrong amount, or leave a trade stuck.",
                  "Attackers target exchanges constantly. Even the largest exchanges in the world, with huge security teams, have lost billions. Our Manifesto lists some of them.",
                  "We may need to pause trading, settlement, sign-in or the whole site without warning to protect members.",
                  "An audit checks what the auditor looked at, at the time they looked. New features and new attacks come after.",
                  "Browser extensions, outdated browsers and public Wi-Fi can expose your session.",
                ]}
              />
            </Section>

            <Section id="partners" n={17} title="Partners we depend on">
              <p>
                Seeds relies on other services. If any of them fails, parts of Seeds can stop
                working. In most cases your coins stay safe in your wallet, but you may not be able
                to trade until the service returns.
              </p>
              <List
                items={[
                  <><B>Honest.Money</B> for sign-in and profiles. If it is down, you cannot sign in to Seeds.</>,
                  <><B>HME Wallet</B> (mobile.honest.money) for your keys, trading pockets and approvals.</>,
                  <><B>TSD Swap</B> for issuing and redeeming TSD, and for converting BTC, LTC and ETH in the background.</>,
                  <><B>NectarPay</B> for Ignite class payments.</>,
                  <><B>Amazon Web Services</B> for email and for Seeds&rsquo; half of locked-balance keys.</>,
                  <><B>Telegram</B> for alerts. Alerts can arrive late or not at all; do not rely on them alone.</>,
                  <><B>Blockchain servers and price sources</B>, ours and others&rsquo;, for balances, confirmations and prices.</>,
                  <><B>Our hosting providers</B>, which run the website itself.</>,
                ]}
              />
              <p>
                These companies have their own terms, policies and risks. Seeds is not responsible
                for what they do, and cannot always fix problems they cause.
              </p>
            </Section>

            <Section id="service" n={18} title="Service changes and shutdown">
              <List
                items={[
                  "We can add, change, pause or remove markets, coins, features, limits and fees. Fees and limits that apply are shown before you confirm.",
                  "Maintenance and outages happen, sometimes at bad moments.",
                  "Seeds is a young business. It could change owners, run out of money, be forced to close by law, or decide to stop. Because your coins are meant to stay in your own wallet, a shutdown should not take them with it — but open orders, P2P trades, locks waiting out their refund period, and any instant-access trades in progress could be affected.",
                  "We may limit or close accounts that break our Terms, put other members at risk, or that the law requires us to restrict.",
                ]}
              />
            </Section>

            <Section id="legal" n={19} title="Legal and regulatory">
              <List
                items={[
                  "Crypto laws differ from place to place and change often. Something legal today may be restricted tomorrow, where you live or where Seeds operates.",
                  "It is your job to know whether trading these coins, using P2P payments, or taking part in Seeds is legal for you.",
                  "Seeds may have to stop serving some countries or regions, ask for more information, or freeze activity if the law requires it.",
                  "Governments may treat coins, stablecoins, locked balances or instant-access trading differently from how we describe them. Legal questions about custody are still being reviewed by our attorneys.",
                  "Your crypto is not protected by deposit insurance (such as the FDIC) or investor protection schemes (such as SIPC).",
                  "Sending coins to people or places under sanctions is illegal, and Seeds may block it.",
                ]}
              />
            </Section>

            <Section id="tax" n={20} title="Taxes">
              <p>
                In many countries, every trade, swap, sale or crypto payment can be a taxable
                event &mdash; even crypto-for-crypto trades, and even when you made no money in
                regular currency. You are responsible for keeping records and paying any taxes
                you owe. Seeds shows your trade history, but it is not a tax report and may not
                include everything your tax authority needs. Talk to a tax professional.
              </p>
            </Section>

            <Section id="advice" n={21} title="No advice, and the Ignite class">
              <p>
                Nothing on Seeds &mdash; pages, prices, charts, statistics, emails, Telegram
                alerts, member chats, the Manifesto, or anything said in the Ignite class &mdash;
                is financial, investment, legal or tax advice. We do not know your situation and do
                not recommend any coin or trade.
              </p>
              <Sub title="About the Ignite class">
                <List
                  items={[
                    "Ignite is education. It does not promise any profit, income or result.",
                    "The $400 registration deposit is returned to you during the class for trading activity. Once it is returned as trading funds, it carries all the risks on this page and can lose value or be lost.",
                    "Examples, strategies and stories shared in class are for learning. Results others got may not happen for you.",
                    "Refunds of class payments are handled by hand through NectarPay and are not automatic.",
                  ]}
                />
              </Sub>
              <Sub title="About future AI tools">
                <p>
                  We are exploring tools that help members describe a trading strategy for Seeds to
                  follow. If we launch them, they will follow your rules, not predict the market,
                  and a strategy can lose money exactly as written.
                </p>
              </Sub>
            </Section>

            <Section id="info" n={22} title="Data and information">
              <p>
                Prices, volumes, balances, confirmations, seller scores, statistics and coin
                information on Seeds come from our systems, from blockchains and from outside
                sources. They can be delayed, incomplete or wrong. Check important numbers
                yourself, for example in a block explorer, before acting on them. Descriptions of
                coins and projects reflect our understanding at the time of writing and may go out
                of date.
              </p>
            </Section>

            <Section id="privacy" n={23} title="Public blockchains and privacy">
              <p>
                Blockchain payments are public and permanent. Anyone can see the addresses, amounts
                and times of your transactions. Once an address is linked to you &mdash; for
                example, through a P2P trade, a payment request, or a public post &mdash; others
                may be able to follow your activity. Read our{" "}
                <Link to="/privacy" className="text-primary underline-offset-4 hover:underline">Privacy Policy</Link>{" "}
                to see what Seeds itself keeps.
              </p>
            </Section>

            <Section id="you" n={24} title="Your responsibilities">
              <p>Before and while you trade, please:</p>
              <List
                items={[
                  "Trade only what you can afford to lose.",
                  "Back up your recovery phrase offline, and never share it.",
                  "Keep savings out of any instant-access trading pocket.",
                  "Check every address, network, amount and price before you confirm.",
                  "Start with a small trade when you try anything new.",
                  "Confirm P2P payments in your real bank or app before releasing coins.",
                  "Keep all P2P messages inside Seeds.",
                  "Protect your Honest.Money account, email, devices and API keys.",
                  "Know the laws and taxes that apply to you.",
                  "Ask questions before you act if something is unclear.",
                ]}
              />
            </Section>

            <Section id="ack" n={25} title="Acknowledgement">
              <p>
                This page cannot list every possible risk. New ones appear as technology, markets
                and laws change, and we will update this page when we learn of them. By using
                Seeds, you confirm that you have read and understood this disclosure, that you
                accept these risks, and that you are trading by your own choice and at your own
                risk.
              </p>
              <p>
                This statement sits alongside our{" "}
                <Link to="/terms" className="text-primary underline-offset-4 hover:underline">Terms of Use</Link>{" "}
                and{" "}
                <Link to="/privacy" className="text-primary underline-offset-4 hover:underline">Privacy Policy</Link>.
                If anything here conflicts with the Terms, the Terms apply. To learn why we built
                Seeds the way we did, read the{" "}
                <Link to="/manifesto" className="text-primary underline-offset-4 hover:underline">Manifesto</Link>.
              </p>
            </Section>
          </div>
        </article>
      </div>
    </div>
  );
}
