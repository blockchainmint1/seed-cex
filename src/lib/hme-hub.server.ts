/** Honest.Money Hub events (honest.money/api §3). Server-only; failures never block the user. */
export async function sendHubEvent(body: {
  event: "signup" | "service_used" | "purchase";
  member_id?: string | null;
  email?: string | null;
  ref?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const secret = process.env.HME_HMAC_SECRET;
  if (!secret) return;
  try {
    await fetch("https://honest.money/api/public/hub/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        service: "seeds",
        event: body.event,
        ...(body.member_id ? { member_id: body.member_id } : { email: body.email }),
        ...(body.ref ? { ref: body.ref } : {}),
        metadata: body.metadata ?? {},
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* best effort */
  }
}

export function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
