/**
 * Amazon SNS → Seeds alarm messages (audit M1). Pure rules, tested in sns.test.ts:
 * which hosts may sign or confirm, the exact string SNS signs, freshness, and the
 * Telegram text for a CloudWatch alarm. Signature checking itself is in sns.server.ts.
 */

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
};

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

/** Only certificates and confirm links served by Amazon SNS itself, over https. */
export function isSnsUrl(raw: string | undefined, kind: "cert" | "subscribe"): boolean {
  if (!raw) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.port || u.username || u.password || !SNS_HOST.test(u.hostname)) return false;
  return kind === "cert" ? u.pathname.endsWith(".pem") : true;
}

export function parseSnsMessage(body: unknown): SnsMessage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
  const type = str("Type");
  if (type !== "Notification" && type !== "SubscriptionConfirmation" && type !== "UnsubscribeConfirmation") return null;
  const need = ["MessageId", "TopicArn", "Message", "Timestamp", "SignatureVersion", "Signature", "SigningCertURL"];
  if (need.some((k) => !str(k))) return null;
  if (type !== "Notification" && (!str("SubscribeURL") || !str("Token"))) return null;
  const m: SnsMessage = {
    Type: type, MessageId: str("MessageId")!, TopicArn: str("TopicArn")!, Message: str("Message")!, Timestamp: str("Timestamp")!,
    SignatureVersion: str("SignatureVersion")!, Signature: str("Signature")!, SigningCertURL: str("SigningCertURL")!,
  };
  const subject = str("Subject"), sub = str("SubscribeURL"), token = str("Token");
  if (subject !== undefined) m.Subject = subject;
  if (sub !== undefined) m.SubscribeURL = sub;
  if (token !== undefined) m.Token = token;
  return m;
}

/** The exact text SNS signs (AWS "Verifying the signatures of Amazon SNS messages"). */
export function snsStringToSign(m: SnsMessage): string {
  const keys = m.Type === "Notification"
    ? (["Message", "MessageId", ...(m.Subject !== undefined ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"] as const)
    : (["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const);
  return keys.map((k) => `${k}\n${(m as Record<string, string | undefined>)[k] ?? ""}\n`).join("");
}

/** SNS retries for a while; anything older than an hour (or from the future) is refused. */
export const SNS_MAX_AGE_MS = 60 * 60 * 1000;
export function snsFresh(timestamp: string, nowMs: number): boolean {
  const t = Date.parse(timestamp);
  return Number.isFinite(t) && t <= nowMs + 5 * 60 * 1000 && nowMs - t <= SNS_MAX_AGE_MS;
}

export function snsHashFor(version: string): "SHA-1" | "SHA-256" | null {
  return version === "1" ? "SHA-1" : version === "2" ? "SHA-256" : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram text for a CloudWatch alarm notification; null when it isn't one. */
export function alarmText(message: string): string | null {
  let a: Record<string, unknown>;
  try { a = JSON.parse(message) as Record<string, unknown>; } catch { return null; }
  const name = typeof a["AlarmName"] === "string" ? (a["AlarmName"] as string).slice(0, 120) : null;
  const state = typeof a["NewStateValue"] === "string" ? (a["NewStateValue"] as string) : null;
  if (!name || !state) return null;
  const reason = typeof a["NewStateReason"] === "string" ? (a["NewStateReason"] as string).slice(0, 400) : "";
  const desc = typeof a["AlarmDescription"] === "string" ? (a["AlarmDescription"] as string).slice(0, 300) : "";
  if (state === "ALARM") {
    // Vault signing-key alarms (names contain "Vault"): that key only signs HME Vault link requests, never coins.
    const advice = /vault/i.test(name)
      ? `If nobody at Seeds is working on the HME Vault signing key right now: disable the Vault signing AWS KMS key, then replace the AWS login. ` +
        `HME Vault sign-ins stop until a new key is published and pinned; no coins can move with this key.`
      : `If nobody at Seeds is moving or re-locking keys right now: disable the pocket-key AWS KMS key, then replace the AWS login. ` +
        `Members then re-link; their coins stay in their wallets.`;
    return `🚨 <b>Seeds AWS security alarm</b>\n<b>${esc(name)}</b>${desc ? `\n${esc(desc)}` : ""}\n${esc(reason)}\n\n` + advice;
  }
  if (state === "OK") return `✅ <b>Seeds AWS alarm cleared</b>\n${esc(name)}`;
  return null;
}
