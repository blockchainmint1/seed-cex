// NectarPay (nectar-pay.com/api). Non-custodial: funds go straight to the store's own wallet.
export const NECTARPAY_API = "https://app.nectar-pay.com";

export function nectarpayConfigured() {
  return !!process.env.NECTARPAY_API_KEY;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.NECTARPAY_API_KEY;
  if (!key) throw new Error("NectarPay is not configured yet.");
  const res = await fetch(`${NECTARPAY_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`NectarPay ${path} failed [${res.status}]: ${text}`);
    throw new Error(`NectarPay request failed [${res.status}]: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as T;
}

export type NectarInvoice = {
  id: string; status: string; checkout_url: string; expires_at: string;
  fiat_amount: number; order_id?: string | null; chain?: string | null; address?: string | null;
};

export function createInvoice(body: { amount: number; order_id: string; description: string; redirect_url: string; buyer_email: string; expires_in_seconds: number }) {
  return call<NectarInvoice>("/api/public/v1/invoices", { method: "POST", body: JSON.stringify({ ...body, currency: "USD" }) });
}

export function getInvoice(id: string) {
  return call<NectarInvoice>(`/api/public/v1/invoices/${encodeURIComponent(id)}`);
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Verifies X-TXCPay-Signature "t=<unix>,v1=<hex>" = HMAC-SHA256(secret, `${t}.${rawBody}`), rejecting >5 min old. */
export async function verifyNectarSignature(header: string | null, rawBody: string, secret: string, nowMs = Date.now()) {
  if (!header || !secret) return false;
  const t = header.match(/t=(\d+)/)?.[1];
  const v1 = header.match(/v1=([a-f0-9]{64})/)?.[1];
  if (!t || !v1) return false;
  if (Math.abs(nowMs / 1000 - Number(t)) > 300) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${t}.${rawBody}`)));
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}
