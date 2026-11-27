# QA-0018 — interrupted AI basket starts

## Status
Implemented and verified in preview; **independent security review and a funded basket retry remain required before publishing**. No real basket was reset, approved or sent by the assistant. The original QA report and its five failed/cancelled moves remain unchanged.

## Verified incident evidence
- The reported 50 TSD basket requested five 10 TSD buys: TRX, XRP, SOL, BTC and ETH.
- Its owner approved through Telegram at 17:22:59 UTC on November 26. The TRX move entered `starting` at 17:23:00; at 17:26:04 it hit the three-minute fallback, `The swap didn't start.` The other four moves were cancelled.
- The move had no route ID and no matching TSD route was recorded after its start. The last recorded swap for that account preceded the basket attempt.
- This establishes the interrupted-start/recovery failure, **not the exact reason the request was interrupted**. No retained exception identified the underlying process interruption; an upstream outage or runtime cutoff must not be presented as a proven cause.

## Changes to review
1. `reserve_ai_tsd_route` reserves an ordinary TSD route and writes its ID onto the approved AI move **in one database transaction**. It locks the move, verifies owner/check/plan, requires an approved or running check and live locked plan, bounds the input by the move's approved amount, and preserves the underlying TSD route reservation limits. A repeated reservation returns the existing ID.
2. AI starts use one fresh quote and one live free-TSD check inside the existing pocket-spend lock, rather than repeating those expensive reads before reservation. Ordinary interactive swaps retain their existing 1% shown-price drift check. **AI-only difference:** there is no redundant comparison against a quote generated immediately beforehand by the worker; the plan approves the input budget, and the fresh quoted output is stored for the existing downstream leg-price checks. This is an explicit review point.
3. `runAiStart` rereads the atomic link after an exception. A linked swap is preserved; an unreadable result remains pending; a definite unlinked refusal is shown with its actual reason. Missing TSD still prompts the member to deposit more.
4. The three-minute fallback stops only after a successful absence read. It uses a conditional update that cannot overwrite a newly linked swap. A possible legacy swap is held for review, not silently attached by approximate coin/time matching and never restarted automatically.
5. Account → AI strategies adds **Request retry** for fully stopped/unlinked days. Its protected server action rechecks the owner and current real-buying access. The database requires the latest check, a live plan, only failed/cancelled unlinked moves, no active AI move, a ten-minute stop cooldown, and no possible matching legacy route—even a completed/failed route blocks retry.
6. A retry reopens the same fixed trades as `waiting`, with a new 24-hour confirmation window. It does not send. Confirmation still uses the existing site one-tap limit/fresh authenticator rules. Old Telegram messages are invalidated by clearing their stored message ID and checking the tapped message against the current saved message. Retrying from the site does not send a replacement Telegram prompt.
7. Active AI days refresh every ten seconds. Amount formatting rounds inputs down, never above the approved quantity.

## Database changes and access
- Additive migrations: `0122_ai_swap_start_recovery.sql`, followed by `0123_ai_recovery_explicit_plan_checks.sql`.
- Both functions are `SECURITY DEFINER` with fixed `public` search paths, revoked from PUBLIC/anon/authenticated and executable only by service_role. Browser writes remain prohibited; member reads remain owner-scoped.
- The follow-up migration replaces composite-plan field access with explicit locked plan predicates after the signed-in test exposed `record "p" has no field "execute"`. The final implementation was rerun successfully.
- Existing `reserve_tsd_route`, chain senders, key storage, signing, bridge checks, gas limits, approval limits and route completion rules are unchanged.
- The database changes are applied; the published app still needs the reviewed code release to use the new atomic AI path.

## Verification
- `bun test`: **1,744 pass, 0 fail**, 142 files.
- Eight new recovery tests cover the cutoff/unknown reads, possible legacy swaps, the five-buy retry eligibility, lost reservation response, definite pre-reservation refusal, old Telegram-message rejection and input rounding.
- `start-recovery.database-test.sql` ran against a temporary fixture inside a rollback-only exception subtransaction: over-budget reservation refused; route linked atomically; repeated reservation returns same ID; late failure cannot overwrite the link; linked swap cannot be retried; all five unstarted buys reopen for fresh approval; a stale worker cannot reserve the waiting retry; tested function privileges remain closed. Every mutation from these assertions was rolled back, so no test route was visible to a sender.
- Signed in as the owner, used a clearly labelled temporary stopped basket with daily checks deferred to 2099 and Telegram disabled. Request retry reopened its five 10 TSD buys; the 50 TSD Confirm button appeared and the waiting state survived reload. **Confirm was never pressed.** Read-back showed five queued moves, null route IDs, and zero recent owner swaps.
- Desktop and 390px phone views checked; phone had no horizontal overflow. No page errors during the retry check. Preview build log reports build OK.
- Temporary plan/check/move fixture removed. No test swap was sent or retained.

## Remaining limitations and funded test
- Obtain independent approval before publishing these money-path changes.
- After release, ask the original reporter to Request retry, review all five amounts and confirm. Verify first swap creation/link, each completed coin, basket ledger and Telegram finish/failure notices.
- The original runtime/upstream interruption remains unattributed. If it recurs, investigate the job/request diagnostics; do not claim this patch proves a provider fix or that every five-buy day now completes.
- Deliberately no automatic retry, no retry of partial/finished swaps, and no attempt to recover a legacy route by guessing its basket ownership. A manually started matching swap can conservatively block retry and require review.
- Real funded five-buy execution and Telegram device interaction were not exercised this round.

## Tester reply
“Thanks—this was a real bug. Seeds now keeps the swap and basket trade linked together and gives stopped, unstarted baskets a Request retry button. After the reviewed update is released, request a retry and confirm the five trades again. Seeds won't retry a swap that may already have started.”

The attached auditor copy includes the exact final code commit to review.