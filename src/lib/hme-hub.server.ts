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

/**
 * Member's Honest.Money affiliate code (their HME username) via member-check.
 * Only approved members get one. Best effort: null on any failure.
 */
export async function hmeReferralCode(memberId: string | null | undefined): Promise<string | null> {
  if (!memberId) return null;
  try {
    const res = await fetch("https://honest.money/api/public/minetxc/member-check", {
      method: "POST", headers: ecosystemHeaders(),
      body: JSON.stringify({ members: [{ ref: "seeds-referral", hmeId: memberId }] }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { result?: string; hmeId?: string; username?: string; status?: string }[] };
    const r = j.results?.[0];
    if (!r || r.result !== "found" || r.hmeId !== memberId || r.status !== "APPROVED") return null;
    const { cleanRefCode } = await import("./ignite-registration");
    return cleanRefCode(r.username);
  } catch {
    return null;
  }
}
