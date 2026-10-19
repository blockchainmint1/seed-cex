import { z } from "zod";

export const HME_SITE = "seeds";

export function ecosystemKey() {
  const key = process.env["HME_ECOSYSTEM"];
  if (!key) throw new Error("Honest.Money connection isn't configured yet.");
  return key;
}

export function ecosystemHeaders() {
  return { Authorization: `Bearer ${ecosystemKey()}`, "X-HME-Site": HME_SITE, "Content-Type": "application/json" };
}

export function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function authorizedHmeRequest(request: Request) {
  const key = process.env["HME_ECOSYSTEM"];
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return Boolean(key && request.headers.get("x-hme-site") === HME_SITE && safeEqual(given, key));
}

const Ticket = z.object({
  iss: z.literal("honest.money"),
  site: z.literal(HME_SITE),
  minerId: z.string().uuid(),
  email: z.string().email().max(255),
  nonce: z.string().min(8).max(200),
  exp: z.number().int(),
  redirect: z.string().optional(),
});

export async function verifyHmeTicket(token: string, secret: string, now = Date.now()) {
  const parts = token.split(".");
  const [enc, sig] = parts;
  if (parts.length !== 2 || !enc || !sig || !/^[A-Za-z0-9_-]+$/.test(enc) || !/^[0-9a-f]{64}$/i.test(sig))
    throw new Error("Malformed sign-in ticket.");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(enc)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!safeEqual(hex, sig.toLowerCase())) throw new Error("Sign-in ticket signature is invalid.");
  const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
  const json = new TextDecoder().decode(Uint8Array.from(atob(b64 + "=".repeat((4 - b64.length % 4) % 4)), (c) => c.charCodeAt(0)));
  const ticket = Ticket.parse(JSON.parse(json));
  if (ticket.exp * 1000 <= now || ticket.exp * 1000 > now + 120_000)
    throw new Error("That sign-in ticket expired or has an invalid expiry. Try again.");
  return ticket;
}