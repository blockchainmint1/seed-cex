# email

- Transactional email lives in src/lib/email/: React Email templates + registry, SigV4 SES client (ses.server.ts), send/opt-out rules (send.server.ts) and event hooks (events.server.ts); sends are best-effort, deduped via alert_log, and security notices ignore opt-outs. Why: email must never block trading or account actions, and members must always hear about account changes.
