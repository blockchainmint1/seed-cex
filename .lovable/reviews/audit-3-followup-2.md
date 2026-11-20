# Auditor follow-up on the trade-watcher fixes — what it means for Seeds

The auditor signed off on the main fixes (TXC/ISK lookups and "resend before freezing").
They found **one real false-alarm path** and **two small annoyances**. I checked each one against our code: all three are real.

## 1. An honest member could be frozen on Ethereum / Base / BNB / PulseChain (real, fix before trading opens)
**What happens:** after a trade payment goes out, Seeds checks one blockchain server to see if it arrived. If that server is behind and hasn't seen the payment yet, and a different, up-to-date server shows that the wallet's send counter has moved on, Seeds decides "someone swapped this payment out" and freezes the member, without even trying the resend.
The resend has the same flaw: if the payment already went through, resending it gets the answer "already used", and Seeds reads that as cheating.

**Fix (two guards):**
- Before blaming anyone, ask the up-to-date server directly whether our payment is there. If it is, keep waiting; no freeze.
- Only count "payment not found" when **two different servers** both say so, the same standard Seeds already uses for THORChain.

**Effect on us:** fewer false freezes, nothing new to set up. One side effect: ZeroChill (ZCU) has only one server, so a missing ZCU payment could never trigger an automatic freeze. It would go to an admin after 6 hours instead, with nobody blamed. Every other network has at least two independent servers.

## 2. A resend with no clear answer repeats every minute (small)
If the network doesn't answer clearly, Seeds resends every minute and writes a log line each time. This does no harm on the blockchain, but it clutters the trade history. **Fix:** wait 5 minutes between those retries.

## 3. A brief TXC/ISK server hiccup turns off cheat detection for 10 minutes (small)
If Seeds can't reach the TXC/ISK server for a moment, it switches off "payment vanished" detection for 10 minutes. That is the safe direction (nobody gets blamed), but it leaves a gap. **Fix:** after a failure, check again in 1 minute instead of 10.

## Already decided / no change
- AI assistants (A2): staying as is, by your decision. The auditor notes it is still open.
- **Live tests before publishing:** there are now four. The auditor added: send a first payment on Base with a deliberately low fee, let it drop, and confirm Seeds resends it instead of freezing anyone. The other three are a two-sided Base trade, the HME Wallet "swap the payment" attack, and a TXC trade watched past confirmation.
