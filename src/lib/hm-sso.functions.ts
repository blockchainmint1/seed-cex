import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Honest.Money single sign-on. honest.money redirects back to /sso with
 * `token=<b64url(json)>.<hex HMAC-SHA256>` signed with HME_HMAC_SECRET.
 * We verify it, burn the nonce, and hand back a one-time token hash the
 * browser exchanges for a session (same trick as wallet sign-in).
 */
export const redeemHonestMoneyToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(10).max(4000) }).parse(d))
  .handler(async ({ data }) => {
    const secret = process.env.HME_HMAC_SECRET;
    if (!secret) throw new Error("Honest.Money sign-in isn't configured yet.");
    const [enc, sig] = data.token.split(".");
    if (!enc || !sig || !/^[0-9a-f]{64}$/i.test(sig)) throw new Error("Malformed sign-in ticket.");

    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(enc)));
    const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
    let diff = 0;
    const s = sig.toLowerCase();
    for (let i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ s.charCodeAt(i);
    if (diff !== 0) throw new Error("Sign-in ticket signature is invalid.");

    const json = new TextDecoder().decode(
      Uint8Array.from(atob(enc.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
    );
    const p = z
      .object({ email: z.string().email().max(255), nonce: z.string().min(8).max(100), exp: z.number(), iss: z.string(), minerId: z.string().optional() })
      .parse(JSON.parse(json));
    if (p.iss !== "honest.money") throw new Error("Unknown ticket issuer.");
    if (p.exp < Math.floor(Date.now() / 1000)) throw new Error("That sign-in ticket expired. Try again.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: nonceErr } = await supabaseAdmin.from("sso_nonces").insert({ nonce: p.nonce });
    if (nonceErr) throw new Error("That sign-in ticket was already used.");

    const email = p.email.toLowerCase();
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { hm_member_id: p.minerId ?? null, sso: "honest.money" },
    });
    if (created.error && !/already/i.test(created.error.message)) throw new Error(created.error.message);

    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties?.hashed_token) throw new Error("Could not start a session.");
    return { tokenHash: link.data.properties.hashed_token };
  });
