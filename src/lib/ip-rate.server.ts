/**
 * Per-visitor rate limiting for public endpoints. The connection address is hashed
 * (never stored) and counted in api_rate_buckets, which keeps only the last ten minutes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { minuteWindow, withinLimit } from "./ip-rate";

export const TOO_MANY = "Too many requests from your connection. Wait a minute and try again.";

async function visitorKey(bucket: string, ip: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`seeds-rate|${bucket}|${ip}`)));
  return `${bucket}:${Array.from(d.slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function requestIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** True when this visitor is still within `perMinute` for `bucket`. Fails open if the counter can't be reached. */
export async function ipAllowed(bucket: string, headers: Headers, perMinute: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc("api_bump_rate", {
      _key: await visitorKey(bucket, requestIp(headers)), _weight: 1, _window: minuteWindow(Date.now()),
    });
    if (error) return true;
    return withinLimit(Number(data), perMinute);
  } catch {
    return true;
  }
}

/** For server functions: throw TOO_MANY when the caller's connection is over the limit. */
export async function requireIpAllowance(bucket: string, perMinute: number): Promise<void> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  if (!req?.headers) return;
  if (!(await ipAllowed(bucket, req.headers, perMinute))) throw new Error(TOO_MANY);
}
