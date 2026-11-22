# Auditor's QA Center + Sentry review: what I think

The auditor says the bug tool is **safe for beta testers**. Nothing below blocks it.

| # | What they found | Would the fix break anything? | My advice |
|---|---|---|---|
| Q1a | Screenshots black out typed-in fields only. Codes, QR codes, addresses and balances on screen aren't hidden unless the tester covers them. | No. It's an invisible tag on those screens: the 2FA setup code/QR, the Seeds Key pairing code/QR, deposit and pocket addresses, balances. | **Do it** |
| Q1b | Turn off "Screenshot this page" on sign-in-with-coin, Security and Withdraw screens. | Testers on those pages can still attach their own picture or describe the bug. | **Do it** |
| Q2 | Write the private file storage's settings into the code. | Their exact code can't run here: our platform refuses that kind of storage change in code. The storage is already private with the right limits. | **Skip their version.** Instead, Seeds refuses uploads if that storage ever becomes public. |
| Q3 | Testers could dig up which admin a report is assigned to (an account number). | Severity is already shown to testers on My reports, so it stays. Hiding the assignee breaks nothing. | **Hide the assignee only** |
| Q4/Q5 | Notes only (file types, storage use). | — | Nothing to do |
| Sentry | Build Seeds' own error log first (about a day). Decide on Sentry after the beta. Seeds' error messages contain amounts, addresses and memos. | Nothing leaves Seeds. You'd miss Sentry's code-level detail. | **Agree with the auditor** |

Still owed by us (not code): an admin clicking through Admin → Bugs with a fresh code, one screen recording on a real phone, and a non-tester seeing no button.
