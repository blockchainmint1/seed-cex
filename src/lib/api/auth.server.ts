/**
 * HMAC-SHA256 request authentication for the Seeds bot API.
 *
 * Scheme is intentionally identical to Binance's so existing signing code
 * works unchanged:
 *
 *   payload   = <query string without `signature`> + <raw body, if any>
 *   signature = hex(HMAC_SHA256(payload, apiSecret))
 *   headers   = { "X-SEEDS-APIKEY": <key id> }
 *
 * Every signed request must carry `timestamp` (unix ms) and may carry
 * `recvWindow` (default 5000ms, max 60000ms). Requests outside that window are
 * rejected, which kills replay attacks without needing a nonce store.
 */

import { apiError, ERR } from "./v1.server";

export type Scope = "read" | "trade";

export type ApiCaller = {
  userId: string;
  keyId: string;
  scopes: string[];
  /** Query + body params, already merged. */
  params: URLSearchParams;
};

const MAX_RECV_WINDOW = 60_000;
const WEIGHT_LIMIT_PER_MINUTE = 1200;

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic key material a bot can hold: id is public, secret is not. */
export function mintKeyPair() {
  const rand = (bytes: number) =>
    [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { keyId: `seeds_${rand(12)}`, secret: rand(32) };
}

type AuthResult = { ok: true; caller: ApiCaller } | { ok: false; response: Response };

export async function authenticate(
  request: Request,
  opts: { scope: Scope; weight?: number },
): Promise<AuthResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const keyId = request.headers.get("x-seeds-apikey");
  if (!keyId) return { ok: false, response: apiError(ERR.BAD_API_KEY, "Missing X-SEEDS-APIKEY header", 401) };

  const url = new URL(request.url);
  const rawQuery = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  const signature = url.searchParams.get("signature");
  if (!signature) return { ok: false, response: apiError(ERR.MANDATORY_PARAM_MISSING, "Missing signature", 400) };

  // Payload is the query string with `signature` stripped from the end, plus
  // the raw body. Substring (not re-serialisation) so encoding matches exactly.
  const idx = rawQuery.indexOf("&signature=");
  const queryPayload = idx >= 0 ? rawQuery.slice(0, idx) : rawQuery.replace(/^signature=[^&]*&?/, "");

  let bodyPayload = "";
  const params = new URLSearchParams(queryPayload);
  if (request.method !== "GET" && request.method !== "DELETE") {
    bodyPayload = await request.text();
    if (bodyPayload) {
      for (const [k, v] of new URLSearchParams(bodyPayload)) params.set(k, v);
    }
  }

  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, key_id, secret, scopes, ip_allowlist, enabled")
    .eq("key_id", keyId)
    .maybeSingle();
  if (error) return { ok: false, response: apiError(ERR.UNKNOWN, "Key lookup failed", 500) };
  if (!key || !key.enabled) {
    return { ok: false, response: apiError(ERR.BAD_API_KEY, "Invalid or disabled API key", 401) };
  }

  const allow = key.ip_allowlist ?? [];
  if (allow.length > 0) {
    const ip = clientIp(request);
    if (!ip || !allow.includes(ip)) {
      return { ok: false, response: apiError(ERR.IP_NOT_ALLOWED, "Source IP not in key allowlist", 403) };
    }
  }

  const expected = await hmacHex(key.secret, queryPayload + bodyPayload);
  if (!timingSafeEqualHex(expected, signature.toLowerCase())) {
    return { ok: false, response: apiError(ERR.INVALID_SIGNATURE, "Signature for this request is not valid", 401) };
  }

  const timestamp = Number(params.get("timestamp"));
  if (!Number.isFinite(timestamp)) {
    return { ok: false, response: apiError(ERR.MANDATORY_PARAM_MISSING, "Missing timestamp", 400) };
  }
  const recvWindow = Math.min(Number(params.get("recvWindow") ?? 5000) || 5000, MAX_RECV_WINDOW);
  const drift = Date.now() - timestamp;
  if (drift > recvWindow || drift < -1000) {
    return {
      ok: false,
      response: apiError(
        ERR.TIMESTAMP_OUT_OF_RECV_WINDOW,
        "Timestamp for this request is outside of the recvWindow",
        400,
      ),
    };
  }

  const scopes = key.scopes ?? [];
  if (!scopes.includes(opts.scope)) {
    return { ok: false, response: apiError(ERR.UNAUTHORIZED, `API key lacks '${opts.scope}' scope`, 403) };
  }

  // Weighted, per-key, one-minute fixed window.
  const weight = opts.weight ?? 1;
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { data: used } = await supabaseAdmin.rpc("api_bump_rate", {
    _key: key.key_id,
    _weight: weight,
    _window: windowStart,
  });
  const usedWeight = Number(used ?? 0);
  if (usedWeight > WEIGHT_LIMIT_PER_MINUTE) {
    return {
      ok: false,
      response: apiError(ERR.TOO_MANY_REQUESTS, "Request weight limit exceeded, back off", 429),
    };
  }

  void supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);

  return { ok: true, caller: { userId: key.user_id, keyId: key.key_id, scopes, params } };
}
