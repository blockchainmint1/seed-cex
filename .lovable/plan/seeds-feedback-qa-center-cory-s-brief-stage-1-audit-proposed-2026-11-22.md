# Seeds Feedback & QA Center (Cory's brief) — stage 1: audit + proposed schema

## What I found (audit)
- **No feedback tool exists.** Today "feedback" in the code only means P2P seller ratings. Nothing to merge or replace.
- **Testers already exist.** "Beta testers" = everyone with the beta role plus every admin. Admins switch members on and off in Admin → Admin access. I'll reuse that group, with no new role.
- **Admin area** is the existing side-menu layout. Every admin page checks on the server that you hold the admin role and entered your authenticator code in the last 12 hours. **Bugs** becomes a new menu item at **/admin/bugs**.
- **File storage:** Seeds has none yet, and the workspace blocks public storage. The QA Center gets a new **private** storage area.
- **Sentry:** not installed or connected. Outside scripts are already limited to public info pages by an earlier audit rule.
- **App version:** not recorded anywhere. I'll stamp each build with a version and build time.

## What gets built
1. **Floating "Feedback" button** (bottom corner, phone-friendly, can be tucked away). Only signed-in testers and admins see it, and only while the QA switch is on.
2. **Report form:** Bug / Performance / Feature request / General feedback, plus title, description, expected vs actual, steps to reproduce. Attach a screenshot, files, or a short screen recording (up to 30 s).
3. **Screenshot review:** the screenshot is taken in the browser and shown to the tester first. Form fields are blanked automatically, and the tester can black out anything else (balances, addresses) before sending. Nothing uploads until they press Send.
4. **My reports** page (/feedback): testers see only their own reports, replies from the team, and a **"Fixed for me / Still broken"** button when a report is Ready for Retest.
5. **/admin/bugs dashboard:** list with search and filters (status, severity, category, assignee, reporter, date), a detail view with attachments, comments (team-only notes or replies the tester sees), duplicate grouping, a change history and CSV export.
6. **Statuses:** New → Investigating → Fixed → Ready for Retest → Verified. Severity (Critical/High/Medium/Low) is set by admins.
7. **On/off switch** in /admin/bugs: off hides the button and refuses new reports. Existing reports stay readable.
8. **Sentry:** a written evaluation only (privacy settings, scrubbing, cost, what would leave Seeds). Nothing installed or sent until you approve.

## Not touched
Trading, wallets/pockets, swaps, withdrawals, onboarding, sign-in and every existing admin page. The only shared-file edits: one line in the site frame for the button, one menu entry in Admin, and the build version stamp.

## Privacy rules (what is and isn't collected)
- **Collected:** tester's account id, page path, time, browser and OS name/version, screen size, app version, and what the tester typed or attached.
- **Never collected:** sign-in tokens, cookies, saved browser data, passwords, recovery phrases or keys, form contents, balances or amounts (except anything the tester chooses to show in a reviewed screenshot), console logs, network traffic.
- **Page address:** the part after `?` and `#` is dropped (except a short safe list such as `tab`), so one-time codes and sign-in links in an address are never stored.
- Text fields are capped in length. Files are limited to images, PDF, plain text and short video (10 MB per image/file, 25 MB per recording, 5 files per report). At most 20 reports per tester per hour.

## Technical details

### Tables (all written only by Seeds' server; reads as below)
```text
qa_settings      (single row) enabled bool, recordings_enabled bool, updated_by, updated_at
qa_reports       id, ref_no serial (shown as QA-0001), reporter_id, category, title, description,
                 expected, actual, steps, status, severity (null until triaged), assignee_id,
                 duplicate_of -> qa_reports.id, page_path, app_version, browser, os,
                 viewport "1495x907@1", created_at, updated_at
qa_attachments   id, report_id, kind (screenshot|file|recording), storage_path, mime, size_bytes,
                 redacted bool, created_at
qa_comments      id, report_id, author_id, body, internal bool, created_at
qa_events        id, report_id, actor_id, field (status|severity|assignee|duplicate_of), from, to, created_at
```
Check constraints on category, status and severity values. Duplicates point to one root report (no chains). Events are append-only (trigger blocks edits and deletes), and reports can't be deleted: an admin closes a wrong report as Verified or marks it a duplicate.

### Access controls
| Who | Reports | Attachments | Comments | Settings |
|---|---|---|---|---|
| Tester (beta or admin role) | create own (server fn); read **own** only | upload into own folder; read own | read non-internal on own reports; add a reply | read "enabled" only |
| Admin (role + fresh 12-h code) | read/triage all (server fn, `requireAdmin`) | short-lived (60 s) signed links | all, incl. internal | change |
| Signed-in non-tester | nothing | nothing | nothing | nothing |
| Signed out | nothing | nothing | nothing | nothing |

- RLS: `authenticated` gets SELECT only, with owner policies (`reporter_id = auth.uid()`, comments `internal = false` on own reports). No client INSERT/UPDATE/DELETE grants. `service_role` gets all. No `anon` grants.
- Every server fn re-checks the tester role server-side (`hasTesterRole`), and admin fns use `requireAdmin`. The browser never decides access.
- Private bucket `qa-attachments`, path `{reporter_id}/{report_id}/{file}`. storage.objects policies: insert only into your own folder, only for testers, with the type and size limits above. Select own folder only. No update/delete for testers. Admins view through server-made signed links.
- Upload flow: the server creates the report, then hands out a signed upload link per file (checked type and size). The report shows an attachment only after the server confirms the file exists.

### Files
- `src/lib/qa/qa-rules.ts` (pure, tested): categories, statuses, allowed status moves, page-path scrubbing, file limits, CSV.
- `src/lib/qa/qa.functions.ts` (tester) and `qa-admin.functions.ts` (admin).
- `src/components/qa/FeedbackButton.tsx`, `ReportDialog.tsx`, `ScreenshotReview.tsx` (in-browser capture + black-out boxes, no outside service), `Recorder.tsx` (browser screen recorder, preview before attach).
- Routes: `/_authenticated/feedback`, `/_authenticated/admin/bugs` (+ `/admin/bugs/$ref`). Both are kept out of the sitemap.
- `src/lib/qa/AGENTS.md` for the rules.

### Rollback
- Quick: flip the switch off in /admin/bugs. The button disappears and new reports are refused.
- Full: delete the one `<FeedbackButton />` line and the Admin menu entry. Tables and storage are separate, so nothing else depends on them.

## Stages
1. This plan (schema + access) for your OK.
2. Database, storage, server rules + tests.
3. Button, form, screenshot review, recorder, My reports.
4. /admin/bugs dashboard, comments, duplicates, export, switch.
5. Desktop + phone checks signed in as a tester and as an admin, the Sentry evaluation, and a note for the auditor.
