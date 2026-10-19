import { ecosystemHeaders } from "./hme-auth.server";
export { safeEqual } from "./hme-auth.server";

/** Honest.Money Hub events (honest.money/api §3). Server-only; failures never block the user. */
export async function sendHubEvent(body: {
  event: "signup" | "service_used" | "purchase";
  member_id?: string | null;
  email?: string | null;
  ref?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const response = await fetch("https://honest.money/api/public/hub/events", {
      method: "POST",
      headers: ecosystemHeaders(),
      body: JSON.stringify({
        service: "seeds",
        event: body.event,
        ...(body.member_id ? { member_id: body.member_id } : { email: body.email }),
        ...(body.ref ? { ref: body.ref } : {}),
        metadata: body.metadata ?? {},
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.warn("HME activity report rejected", response.status);
  } catch {
    /* best effort */
  }
}
