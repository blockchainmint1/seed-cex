/**
 * Amazon SES v2 client (SendEmail, GetAccount, ListEmailIdentities) signed
 * with AWS Signature V4. Hand-rolled with @noble/hashes so it runs on the
 * Workers runtime without the AWS SDK. Server-only; credentials are read
 * from the environment inside each call.
 */
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const enc = new TextEncoder();

function creds() {
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secret = process.env.AWS_SES_SECRET_ACCESS_KEY;
  const region = process.env.AWS_SES_REGION;
  if (!accessKeyId || !secret || !region) throw new Error("Email isn't configured (AWS SES credentials missing)");
  return { accessKeyId, secret, region: region.trim() };
}

export function sesConfigured(): boolean {
  return Boolean(process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY && process.env.AWS_SES_REGION);
}

/** Pure SigV4 signer (exported for tests). */
export function signV4(p: {
  method: string; host: string; path: string; query?: string; body: string;
  region: string; service: string; accessKeyId: string; secret: string; now: Date;
  /** Extra headers to sign (e.g. x-amz-target); names must be lowercase. */
  extraHeaders?: Record<string, string>; contentType?: string;
}): Record<string, string> {
  const amzDate = p.now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = bytesToHex(sha256(enc.encode(p.body)));
  const headers: Record<string, string> = { host: p.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (p.body) headers["content-type"] = p.contentType ?? "application/json";
  Object.assign(headers, p.extraHeaders);
  const names = Object.keys(headers).sort();
  const canonical = [p.method, p.path, p.query ?? "", ...names.map((n) => `${n}:${headers[n]}`), "", names.join(";"), payloadHash].join("\n");
  const scope = `${day}/${p.region}/${p.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, bytesToHex(sha256(enc.encode(canonical)))].join("\n");
  let k = hmac(sha256, enc.encode(`AWS4${p.secret}`), enc.encode(day));
  for (const part of [p.region, p.service, "aws4_request"]) k = hmac(sha256, k, enc.encode(part));
  const signature = bytesToHex(hmac(sha256, k, enc.encode(toSign)));
  const { host: _host, ...rest } = headers;
  return { ...rest, authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}` };
}

async function ses<T>(method: "GET" | "POST", path: string, body?: unknown, query = ""): Promise<T> {
  const c = creds();
  const host = `email.${c.region}.amazonaws.com`;
  const raw = body === undefined ? "" : JSON.stringify(body);
  const headers = signV4({ method, host, path, query, body: raw, region: c.region, service: "ses", accessKeyId: c.accessKeyId, secret: c.secret, now: new Date() });
  const res = await fetch(`https://${host}${path}${query ? `?${query}` : ""}`, { method, headers, body: raw || undefined, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try { msg = (JSON.parse(text) as { message?: string }).message ?? msg; } catch { /* keep raw */ }
    throw new Error(`SES ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export type SesMessage = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** RFC 8058 one-click unsubscribe target for optional mail. */
  unsubscribeUrl?: string;
};

export async function sesSend(m: SesMessage): Promise<{ messageId: string }> {
  const headers = m.unsubscribeUrl
    ? [{ Name: "List-Unsubscribe", Value: `<${m.unsubscribeUrl}>` }, { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }]
    : undefined;
  const r = await ses<{ MessageId: string }>("POST", "/v2/email/outbound-emails", {
    FromEmailAddress: m.from,
    Destination: { ToAddresses: [m.to] },
    ReplyToAddresses: m.replyTo ? [m.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: m.subject, Charset: "UTF-8" },
        Body: { Html: { Data: m.html, Charset: "UTF-8" }, Text: { Data: m.text, Charset: "UTF-8" } },
        Headers: headers,
      },
    },
  });
  return { messageId: r.MessageId };
}

export async function sesAccount() {
  return ses<{ ProductionAccessEnabled?: boolean; SendingEnabled?: boolean; SendQuota?: { Max24HourSend: number; MaxSendRate: number; SentLast24Hours: number } }>("GET", "/v2/email/account");
}

export async function sesIdentities() {
  const r = await ses<{ EmailIdentities?: { IdentityName: string; IdentityType: string; SendingEnabled: boolean; VerificationStatus?: string }[] }>("GET", "/v2/email/identities");
  return r.EmailIdentities ?? [];
}
