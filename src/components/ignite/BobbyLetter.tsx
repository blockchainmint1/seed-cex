import { SCHEDULE_DATES, SCHEDULE_TIME } from "@/lib/ignite-registration";

/**
 * "A letter from Bobby" — the why behind Ignite, written from Bobby Gray's
 * Week 138 Honest Money Live remarks. Copy only; no data or payment logic.
 */
const SPLIT: [string, string][] = [
  ["10%", "Mining equipment — we keep building the mine."],
  ["10%", "Overhead and payroll — the team that builds the tools."],
  ["10%", "Liquidity — placed right into our own market on Seeds, where no custodian can run off with it."],
  ["20%", "Promotion — about $20,000 for the first class, and the class votes on where it goes."],
];

export function BobbyLetter() {
  return (
    <section aria-labelledby="bobby-letter" className="mt-20 border-t border-border pt-16">
      <p className="font-mono text-xs font-medium tracking-[0.14em] text-primary">A LETTER FROM BOBBY</p>
      <h2 id="bobby-letter" className="mt-4 max-w-3xl font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl">
        We have a plan. We’re igniting the fire.
      </h2>

      <article className="mt-10 max-w-3xl rounded-3xl border border-primary/40 bg-card/60 p-7 sm:p-12">
        <div className="space-y-5 text-lg leading-relaxed text-muted-foreground">
          <p className="font-display text-2xl text-foreground">Friends,</p>

          <p>
            When we started TEXITcoin 138 weeks ago, it wasn’t a gamble or a shot in the dark. It was a plan, and it went
            like this: <span className="font-semibold text-foreground">community, cash, mine, promotion.</span> A coin
            held by one guy in his garage in McKinney, Texas isn’t a currency. It becomes one when a community trades it.
            So I asked my neighbor to join me, then my daughter, her friends, and a friend in California, and it grew
            from there. As the community grew, the cash grew. As the cash grew, the mine grew. We promoted, and the market
            responded. Together we went from a dirt road to fifty thousand people.
          </p>

          <p>
            Then we lost our momentum, and I want to be honest about why. The mine was phase one. Phase two was always{" "}
            <span className="font-semibold text-foreground">utility</span>: the tools to actually use what we built. We
            didn’t have them yet. All the weight sat on the price, and when the market got shaky there wasn’t enough real
            use underneath to carry us. And a lot of you did exactly what I told you to do: lock your coin in the safe and
            don’t lose it. That was then. This is now.
          </p>

          <p>
            Today we have everything I wished we’d had a year ago: wallets that work, NectarPay terminals and tap to pay,
            and a mine earning real revenue every month. The last piece is{" "}
            <span className="font-semibold text-foreground">Seeds</span>. We’re tired of getting rugged by custodians.
            First it was BitMart, and the hacks keep coming. I’m not asking you to trust me instead. Seeds is built so
            you don’t have to trust anyone. You keep your keys, and you still get the speed and tools of a real
            exchange.
          </p>

          <h3 className="pt-4 font-display text-2xl text-foreground">What we’ll do together</h3>
          <p>
            Five live sessions with me, {SCHEDULE_DATES}, {SCHEDULE_TIME.replace("Daily", "daily")}. The class is free for miners. Bring $400
            you’ll put to work in the market:
          </p>
          <ul className="space-y-3">
            {[
              "Get set up with a wallet, learn how to get into crypto, and move into TSD.",
              "Buy $100 each of TXC, ISK and ZCU, and keep $100 in TSD.",
              "Learn buy orders and sell orders. For example, list part of what you bought at a higher price, so the next class has coins to buy.",
              "Build your own strategy “basket” with our AI basket builder, test it against past prices, and put it to work.",
              "Enter a friendly competition for the best-performing strategies. Rules and prizes will be posted before class.",
            ].map((d) => (
              <li key={d} className="flex gap-4">
                <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <span>{d}</span>
              </li>
            ))}
          </ul>

          <h3 className="pt-4 font-display text-2xl text-foreground">Why 100 seats, and my part</h3>
          <p>
            Your $400 stays yours. It comes back to you during class to trade with. For every seat in this first
            class, I’m putting in <span className="font-semibold text-foreground">$1,000 of my own</span>, about
            $100,000 for a full class. We’ll run my money through the same plan we’ve always talked about, out in the
            open where everyone can watch, as if a brand new class of members had just joined:
          </p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {SPLIT.map(([pct, what]) => (
              <div key={what} className="rounded-2xl border border-border bg-background/40 p-4">
                <dt className="font-display text-3xl text-primary">{pct}</dt>
                <dd className="mt-1 text-base">{what}</dd>
              </div>
            ))}
          </dl>
          <p>
            And we reward the people who got us here. You do your part, we do ours, and we show everyone how the engine
            works when it turns over.
          </p>

          <h3 className="pt-4 font-display text-2xl text-foreground">This isn’t a cash grab</h3>
          <p>
            I’m not asking you to buy and hold. I’m asking for the opposite. Learn to buy, learn to sell, and get a feel
            for the timing. Class one is the spark. Class two buys what class one lists. Every class sets up the next
            one. That’s how we bring our own market to Seeds, and then invite the rest of the world to come and join us.
          </p>
          <p>
            There’s no more sitting on the sidelines. If you don’t know how to open your wallet, how are you going to pay
            a NectarPay merchant? Whatever news comes our way, I want you ready for it.
          </p>
          <p className="text-foreground">
            I don’t need everyone. I need 100 people. Let’s call ignition.
          </p>

          <div className="pt-4">
            <p className="font-display text-3xl font-semibold tracking-[-0.02em] text-foreground">Bobby Gray</p>
            <p className="text-sm">Founder, Honest Money Ecosystem</p>
          </div>
        </div>

        <a href="#reserve" className="seed-btn mt-10 w-auto">Reserve my To the Moon seat</a>

        <p className="mt-6 text-xs text-muted-foreground">
          This letter explains why we’re running To the Moon. It isn’t a promise of profit. Crypto prices go up and down, and
          you can lose money. The funding plan above describes how Bobby’s own contribution is intended to be used; your $400 is your own trading money.
          Competition rules, prizes and final class details will be published separately before the program begins.
        </p>
      </article>
    </section>
  );
}
