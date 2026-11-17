/**
 * Seeds email delivery through Amazon SES. Server-only and best-effort:
 * failures are logged and never break the action that triggered them.
 *
 * Who gets what:
 *   welcome            once per account (alert_log dedupe)
 *   trades category    only if profiles.email_trade_confirmations
 *   weekly             only if profiles.email_weekly_update; carries one-click unsubscribe
 *   security           always (account changes can't be opted out of)
 */
import { SITE } from "./components";
import { makeUnsubToken } from "./links";
import { TEMPLATES, renderTemplate, type TemplateName, type TemplateProps } from "./registry";
import { sesConfigured, sesSend } from "./ses.server";

/** honest.money is a verified SES identity; seeds.honest.money is a subdomain of it. */
export const EMAIL_FROM = "Seeds <hello@seeds.honest.money>";
export const EMAIL_REPLY_TO = "support@honest.money";

export type Recipient = { userId: string; email: string; name: string; timezone: string; tradeEmails: boolean; weeklyEmails: boolean };

export async function loadRecipient(userId: string): Promise<Recipient | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: prof }, { data: u }] = await Promise.all([
    supabaseAdmin.from("profiles").select("display_name, timezone, email_trade_confirmations, email_weekly_update").eq("id", userId).maybeSingle(),
    supabaseAdmin.auth.admin.getUserById(userId),
  ]);
  const email = u?.user?.email;
  if (!email) return null;
  return {
    userId, email,
    name: (prof?.display_name || email.split("@")[0] || "there").slice(0, 40),
    timezone: prof?.timezone || "UTC",
    tradeEmails: prof?.email_trade_confirmations ?? true,
    weeklyEmails: prof?.email_weekly_update ?? true,
  };
}

export function unsubscribeUrl(userId: string): string {
  const secret = process.env.EMAIL_LINK_SECRET;
  if (!secret) throw new Error("EMAIL_LINK_SECRET missing");
  return `${SITE}/api/public/email/unsubscribe?t=${encodeURIComponent(makeUnsubToken(secret, "weekly", userId))}`;
}

/** Deliver one message to an address (used by previews/tests and by emailUser). */
export async function deliver<K extends TemplateName>(to: string, name: K, props: TemplateProps[K], opts: { subjectPrefix?: string } = {}) {
  const r = await renderTemplate(name, props);
  const unsub = name === "weekly-update" ? (props as TemplateProps["weekly-update"]).unsubscribeUrl : undefined;
  return sesSend({ from: EMAIL_FROM, replyTo: EMAIL_REPLY_TO, to, subject: `${opts.subjectPrefix ?? ""}${r.subject}`, html: r.html, text: r.text, unsubscribeUrl: unsub });
}

/**
 * Email a member. `build` receives their name/timezone so templates show local
 * times. `dedupe` makes the send at-most-once per (user, template, key).
 */
export async function emailUser<K extends TemplateName>(
  userId: string,
  name: K,
  build: (r: Recipient) => TemplateProps[K] | Promise<TemplateProps[K]>,
  opts: { dedupe?: string } = {},
): Promise<"sent" | "skipped" | "failed"> {
  try {
    if (!sesConfigured()) return "skipped";
    const r = await loadRecipient(userId);
    if (!r) return "skipped";
    const cat = TEMPLATES[name].category;
    if (cat === "trades" && !r.tradeEmails) return "skipped";
    if (cat === "weekly" && !r.weeklyEmails) return "skipped";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const kind = `email:${name}`;
    if (opts.dedupe) {
      const { data: claimed } = await supabaseAdmin.from("alert_log")
        .upsert({ user_id: userId, kind, subject: opts.dedupe }, { onConflict: "user_id,kind,subject", ignoreDuplicates: true })
        .select("user_id");
      if (!claimed?.length) return "skipped";
    }
    try {
      await deliver(r.email, name, await build(r));
      return "sent";
    } catch (err) {
      // Free the claim so a later attempt can retry.
      if (opts.dedupe) await supabaseAdmin.from("alert_log").delete().eq("user_id", userId).eq("kind", kind).eq("subject", opts.dedupe);
      throw err;
    }
  } catch (err) {
    console.error(`[email] ${name} for ${userId} failed`, err);
    return "failed";
  }
}

/** Security confirmation helper used by settings, wallet-link and API-key changes. */
export async function emailAccountChange(userId: string, thing: string, changes: string[], ifNotYou?: string) {
  return emailUser(userId, "account-change", (r) => ({ name: r.name, thing, changes, at: new Date().toISOString(), timezone: r.timezone, ifNotYou }));
}
