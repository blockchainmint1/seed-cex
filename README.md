<p align="center">
  <a href="https://seeds.honest.money">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://seeds.honest.money/__l5e/assets-v1/3997760a-ad66-42f1-ad68-77cfef9f0b4c/seeds-lockup-full.png">
      <img alt="Seeds" src="https://seeds.honest.money/__l5e/assets-v1/b1a6c149-aab2-4908-80fa-d2bc9e3ef1ba/seeds-lockup-forest.png" width="320">
    </picture>
  </a>
</p>

<h3 align="center">The exchange that never holds your coins.</h3>

<p align="center">
  Spot markets, peer-to-peer trading, cross-chain swaps and AI strategies —<br>
  settled wallet-to-wallet, straight out of your own HME Wallet trading pocket.
</p>

<p align="center">
  <a href="https://seeds.honest.money"><b>seeds.honest.money</b></a> ·
  <a href="https://seeds.honest.money/how-it-works">How it works</a> ·
  <a href="https://seeds.honest.money/api">API</a> ·
  <a href="https://seeds.honest.money/manifesto">Manifesto</a> ·
  <a href="https://seeds.honest.money/proof/code">Verify this code</a> ·
  <a href="https://seeds.honest.money/risk">Risks</a>
</p>

---

## Why Seeds exists

Mt. Gox, QuadrigaCX, FTX, Celsius — the same story every time: people handed an exchange their coins, and the exchange lost them. Seeds is built so that can't happen. There is no Seeds hot wallet full of customer money, no internal IOU balance, and no "withdraw" button that asks us for permission.

You keep your coins in **HME Wallet**, part of the [Honest.Money ecosystem](https://honest.money). You link a separate **trading pocket** to Seeds, and trades settle directly between the two traders' wallets on-chain. Your savings never leave your wallet. Revoke the link and Seeds' access ends.

## What's inside

| Feature | What you get |
|---|---|
| **Spot markets** | TXC/TSD, TSD/USDC, BTC/TSD, ETH/TSD, LTC/TSD, ISK/TSD and ZCU/TSD, with order books, charts and trade history. Settlement is in **TSD** (Texas Stable Dollar, Omni property #39 on TEXITcoin). |
| **P2P desk** | Buy and sell TSD and TXC with real people. A seller's coins are checked on-chain and watched until the trade finishes. Also: payment instructions, trust scores, seller profiles, receipts, chat, block/report and disputes. |
| **Cross-chain swaps** | Live THORChain routes across dozens of coins and networks, plus Maya quotes. Each route is checked first: the swap instructions are validated, two separate servers must agree on where the coins go, and price limits are enforced. Pay in TSD through TSD Bridge. |
| **Seeds AI** | Test basket and momentum strategies on historical prices, then lock in a plan and get a daily Telegram check-in. TSD works as the "cash" position. |
| **Bot API** | Binance-style REST + SSE streams, signed with HMAC-SHA256. Keys are read-only by default, can be limited to IP addresses, and can **never withdraw**. CoinMarketCap-compatible market endpoints. |
| **Account** | Exchange-style account area: balances with deposit QR codes for every supported coin and network, plus profile, security checkup, Telegram/email alerts, API keys, AI plan management and referrals. |
| **Ignite** | Registration and payment for the Seeds Ignite class through NectarPay, including "Peer Pay" (a friend pays your seat). |

## How settlement works

```text
 Your HME Wallet                                       Their HME Wallet
 ├── savings  (never shared)                           ├── savings
 └── trading pocket ───── trade leg (on-chain) ─────► trading pocket
                     ◄──── trade leg (on-chain) ──────
                │
                └── Seeds matches the order and checks both legs.
                    It never pools your funds.
```

- **Sign-in** is Honest.Money single sign-on only. Seeds stores no passwords.
- **Approve-every-trade mode:** Seeds holds no key; you sign each trade in HME Wallet.
- **Instant mode:** an encrypted pocket key is unsealed only for the moment it takes to settle. Every spend passes caps, a single-claim check per trade leg and a "payer only" rule, and the key is wiped afterwards.
- **Locked trading balance (in testing):** a 2-of-2 lock on TEXITcoin that needs both your key and Seeds' key to move, with an automatic refund to you after a set time. Seeds' half is signed in AWS KMS.

The full picture, including the trade-offs, is in [/how-it-works](https://seeds.honest.money/how-it-works) and [/risk](https://seeds.honest.money/risk).

## Status

Seeds is **live and in pilot**. Please read this before trusting it with real money:

- ✅ Live: HME sign-in, markets, linking trading pockets, deposits, P2P, Telegram/email alerts, the bot API, AI strategy testing, Ignite registration.
- 🧪 Admin-only pilot: THORChain swap sending and TSD → any-coin routes.
- 📝 Paper only: AI plans make recommendations; they don't buy anything yet.
- 🔒 In review: locked trading balances need HME Wallet co-signing, legal review and auditor sign-off.

Every major change ships with an audit packet for an independent security reviewer.

## Verify it yourself

This repository is the code behind [seeds.honest.money](https://seeds.honest.money). [/proof/code](https://seeds.honest.money/proof/code) explains how to check it. The rules that protect money are written as small, pure modules with tests:

| Area | Where |
|---|---|
| Settlement guard (caps, claims, payer-only) | `src/lib/settle-guard.server.ts` |
| Pocket keys, address encoders, signers | `src/lib/pockets/` |
| 2-of-2 lock scripts | `src/lib/lock/` |
| Swap safety (memo, limit, vault checks) | `src/lib/xchain/safety.ts` |
| Deposit / withdrawal network rules | `src/lib/account/deposit-options.ts` |
| AI strategy engine | `src/lib/ai/plan.ts` |
| HME sign-in tickets | `src/lib/hme-auth.server.ts` |

```sh
bun install
bun test        # 272 tests across 25 files
```

Design notes and specs live in [`docs/`](docs); architecture rules live in [`AGENTS.md`](AGENTS.md).

## Tech

TanStack Start (React 19, server functions, SSR) on Cloudflare Workers · Postgres with row-level security · Tailwind CSS v4 · `@noble/curves` / `@noble/hashes` for all cryptography · AWS KMS and SES · Telegram Bot API · THORChain & Maya public nodes · NectarPay. Built with [Lovable](https://lovable.dev).

```sh
bun install
bun run dev     # http://localhost:8080
```

## Part of the Honest.Money ecosystem

Seeds is one of the apps in the [Honest.Money](https://honest.money) ecosystem, alongside HME Wallet ([mobile.honest.money](https://mobile.honest.money)), [TEXITcoin](https://texitcoin.org), Iskandercoin, [ZeroChill](https://zerochill.com) and the [Texas Stable Dollar](https://tsd.honest.money).

<sub>[Terms](https://seeds.honest.money/terms) · [Privacy](https://seeds.honest.money/privacy) · [Risk disclosure](https://seeds.honest.money/risk) · [Manifesto](https://seeds.honest.money/manifesto). Nothing here is financial advice. Crypto is risky; only trade what you can afford to lose.</sub>
