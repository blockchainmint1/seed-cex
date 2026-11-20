# Auditor's report #3: what it means for Seeds

The auditor checked Seeds as it was before today's "withdrawals for every coin" work, so that work hasn't been reviewed yet. I checked every finding against today's code. **All of them are real.** Nothing has been changed yet; I'm waiting for your OK.

## The two big ones

**A1: someone could take the other side of a trade and keep their own coins.**
Right now, when two people trade (say USDC for TXC), Seeds sends the buyer's USDC and then, seconds later, the seller's TXC. Members hold the same keys Seeds holds. A buyer could quickly "cancel" their USDC send from their own HME Wallet by sending the same money to themselves with a higher network fee. They keep the USDC, and the seller's TXC is already gone.
- Trading isn't live yet (the red demo banner), so nobody can lose money this way today. It **must** be fixed before trading opens.
- **Fix:** wait until the first send is confirmed on its network before sending the second. Also watch for a send that disappears; if one does, freeze that trader and open a dispute.
- **What you'd notice:** trades finish a few minutes later instead of seconds. The seller's coins are never sent until the buyer's have arrived.

**A2: an AI-assistant connection can do much more than "look things up".**
When a member connects an AI assistant (ChatGPT, Claude, …), the approval screen promises it's read-only. But the pass it gets is accepted everywhere a signed-in member is. It could place orders, run P2P trades, change settings or start an AI plan's trades.
- It **can't** withdraw, send to an outside address, change Telegram or raise the one-tap limit. Those need a fresh authenticator code, which the assistant doesn't have.
- **Fix:** Seeds refuses an assistant's pass everywhere except the assistant's own read-only tools, with a matching lock in the database. Members won't notice any difference.

## Smaller fixes with no trade-off (nothing you'd notice)
- **A3:** AI plan trades always run "as a tester" (no limits). It's harmless today because only testers can use AI real buying. One-line fix, so it's right before members get it.
- **A5:** a Telegram approval for an outside-address swap should also lock which coin you receive and which route it takes, not just what you pay and where it goes.
- **D1:** a member creating a Peer Pay link can make the emailed link point to a look-alike website. Pin it to seeds.honest.money.
- **D2:** if a backup server says "I already have that send", Seeds marks it failed when it actually went out. Fix: record it as sent. Where it's unclear, record "not sure" and never send twice.

## Your calls
- **A4: beta testers have no hold on withdrawals.** You chose "no limits" for testers on Nov 19. The auditor worries that a fully stolen tester account could empty a pocket with no time to stop it. Today's new rules already make that much harder: every withdrawal needs an email code, an authenticator code and a Telegram tap. Options:
  - keep it as is;
  - add a short 30-minute hold for testers (you can still cancel from Telegram);
  - also require a fresh admin code to make someone a tester.
- **A6: confirming an AI plan's trades on the website needs no code at any size.** On Telegram, anything above the member's one-tap limit already has to be done on the site. The auditor suggests asking for an authenticator code on the site above that same limit. Downside: one extra code for bigger trades.
- **A7: the visitor speed limit.** Under very heavy traffic it quietly stops limiting. Fixing it is a small rework; it can wait until load testing.
- **A8:** a note only; nothing to change while Seeds is hosted where it is now.

## Also from the auditor
Don't put these audit reports in the public code repository until A1, A2 and D1 are fixed. I haven't added any of them.
