# AI Basket Builder — working concept (draft, 2026-11-17)

Status: thinking only. No code. Waiting on more detail from Bobby.

## Core idea
The AI is the *strategy coach*, not the trader. It talks with the member and
writes their plan down as a short, plain-English **rulebook** (a "basket card").
The member approves the card. A fixed, rule-following **engine** (no AI) then
executes exactly what the card says. Changing the plan = chat with the AI, see
the before/after, approve again.

Why split it: an AI that improvises trades can't be audited or predicted; a
written rulebook can. It also keeps Seeds clear of "the robot decided" disputes.

## How a member builds a strategy (the conversation)
1. **Goal** — what's this money for, how long, how much drop can you stomach?
2. **Ingredients** — which coins (today: TSD, TXC, ISK, ZCU, BTC, ETH, LTC, USDC;
   later THORChain/Maya coins once sending is live).
3. **Recipe** — target weights, e.g. 40% BTC / 30% TXC / 30% TSD.
4. **Rules** — pick from a menu:
   - Rebalance: on a schedule (weekly) and/or when a coin drifts more than X%.
   - Steady buying (DCA): add $X of TSD into the basket every week.
   - Take profit: if a coin is up X%, trim back to target into TSD.
   - Safety switch: if the basket drops X%, move Y% into TSD and pause.
5. **Guardrails** (always required) — max per trade, max per day, max price
   slippage, coins never to sell, pause button, end date.
6. **Preview** — "here's what this would have done over the last 90 days" and
   "here are the trades it would place right now".
7. **Approve & run** — the engine executes; every trade reported via Telegram
   and email; weekly basket summary.
8. **Adjust** — chat to change it; AI shows the exact diff; member re-approves.

## Basket card (structured rules the engine reads)
assets + target weights, rebalance trigger(s), DCA amount/schedule,
take-profit/safety triggers, guardrails, approval mode, version history.
AI output is validated against this fixed schema; anything outside it is rejected.

## How it fits what Seeds already has
- Execution uses the linked HME trading pocket and the existing settle-guard
  (caps, single claim per leg, payer-only send). Basket caps sit *inside* those.
- Instant-access pockets: fully automatic. Approve-every-trade pockets: each
  rebalance arrives as a wallet approval (fine for weekly, not for fast rules).
- All markets are TSD pairs, so every rebalance routes through TSD
  (sell overweight -> TSD -> buy underweight). Two trades per move = two fees.
- Our order books are thin: engine places limit orders within the slippage
  guardrail and skips/splits when the book can't absorb the trade.

## Blockers / open questions
- Linked-pocket settlement must be finished first (already on the roadmap).
- Who is it for: beginners ("pick a style") vs traders (full rule editor)?
- Fee model: per trade, % of basket per year, or flat subscription?
- Price history for previews: our own candles are short; need an outside source.
- Legal: automated portfolio management + AI suggestions may count as
  investment advice in some places — needs counsel before launch.
- Should members be able to share/copy baskets (social / leaderboards)?
