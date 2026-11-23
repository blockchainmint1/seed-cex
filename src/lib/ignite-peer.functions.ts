import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeEmail, validateDetails, type Details } from "./ignite-registration";
import { PEER_TOKEN_RE, emailsLeft, invoiceLive, peerCheckoutBlock, peerLinkExpiry, peerLinkState, peerToken, peerTokenHash, safeOrigin, shortName } from "./ignite-peer";

const firstName = (n: string) => n.trim().split(/\s+/)[0] || "your friend";
const DAY_AGO = () => new Date(Date.now() - 86_400_000).toISOString();

/** Saves the registrant's details and issues a fresh 7-day Peer Pay link (retiring any earlier one). */
export const createPeerLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Details & { origin: string; classId: string }) => d)
  .handler(async ({ data, context }) => {
    if (Object.keys(validateDetails(data)).length) throw new Error("Please check your details.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { peerSecret, priceSeat, saveRegistration, switchBlock } = await import("./ignite.server");
    const { nectarpayConfigured } = await import("./nectarpay.server");
    if (!nectarpayConfigured()) throw new Error("Crypto checkout isn't open yet.");
    const secret = peerSecret();
    const now = new Date();
    const { data: existing } = await supabaseAdmin.from("ignite_registrations").select("id, status, class_id, amount_usd, invoice_expires_at").eq("user_id", context.userId).maybeSingle();
    if (existing?.status === "confirmed") throw new Error("Your seat is already confirmed.");
    if (existing?.status === "underpaid") throw new Error("A payment for your seat arrived short. Contact help before anyone pays again.");
    // The friend pays what this member's seat costs, worked out now (class fee, any miner waiver, deposit).
    const { cls, price } = await priceSeat(context.userId, String(data.classId ?? ""));
    const sw = switchBlock(existing ?? null, cls.id, price.totalUsd, cls.name);
    if (sw) throw new Error(sw);
    const regId = await saveRegistration(context.userId, data, cls, price, "peer", existing?.id ?? null);
    await supabaseAdmin.from("ignite_peer_links").update({ status: "replaced", updated_at: now.toISOString() }).eq("registration_id", regId).eq("status", "active");
    const id = crypto.randomUUID();
    const token = peerToken(secret, id);
    const expires = peerLinkExpiry(now).toISOString();
    const { error } = await supabaseAdmin.from("ignite_peer_links").insert({ id, registration_id: regId, registrant_id: context.userId, token_hash: peerTokenHash(token), expires_at: expires });
    if (error) throw new Error("Couldn't create your link. Try again.");
    return { url: `${safeOrigin(data.origin)}/pay/${token}`, expiresAt: expires };
  });

/** Turns off the registrant's live link. */
export const cancelPeerLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin.from("ignite_peer_links").update({ status: "cancelled", cancelled_at: now, updated_at: now }).eq("registrant_id", context.userId).eq("status", "active");
    return { ok: true };
  });

/** Emails the live link to a friend. At most 3 emails per registrant per day. */
export const emailPeerLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; origin: string }) => d)
  .handler(async ({ data, context }) => {
    const to = normalizeEmail(String(data.to ?? ""));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 255) throw new Error("Enter a valid email address.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { peerSecret } = await import("./ignite.server");
    const { sesConfigured } = await import("./email/ses.server");
    if (!sesConfigured()) throw new Error("Email isn't available right now. Copy the link instead.");
    const { data: link } = await supabaseAdmin.from("ignite_peer_links").select("id, status, expires_at, registration_id").eq("registrant_id", context.userId).eq("status", "active").maybeSingle();
    if (!link || peerLinkState(link) !== "active") throw new Error("Create a Peer Pay link first.");
    const { count } = await supabaseAdmin.from("ignite_peer_emails").select("id", { count: "exact", head: true }).eq("registrant_id", context.userId).gte("sent_at", DAY_AGO());
    if (emailsLeft(count ?? 0) === 0) throw new Error("You've sent 3 emails today. Copy the link and send it yourself, or try again tomorrow.");
    const { data: reg } = await supabaseAdmin.from("ignite_registrations").select("full_name, amount_usd").eq("id", link.registration_id).single();
    const { error: logErr } = await supabaseAdmin.from("ignite_peer_emails").insert({ link_id: link.id, registrant_id: context.userId, to_email: to });
    if (logErr) throw new Error("Couldn't send right now. Try again.");
    const { deliver } = await import("./email/send.server");
    try {
      await deliver(to, "peer-pay-request", {
        registrantName: (reg?.full_name ?? "A Seeds member").slice(0, 60), amount: Number(reg?.amount_usd ?? 0),
        payUrl: `${safeOrigin(data.origin)}/pay/${peerToken(peerSecret(), link.id)}`, expiresAt: link.expires_at,
      });
    } catch (e) {
      console.error("[peer-pay] email failed", e);
      throw new Error("Couldn't send the email. Copy the link instead.");
    }
    return { emailsLeft: emailsLeft((count ?? 0) + 1) };
  });

async function findLink(token: string) {
  if (!PEER_TOKEN_RE.test(token)) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("ignite_peer_links")
    .select("id, status, expires_at, registrant_id, registration_id, payer_id, invoice_id").eq("token_hash", peerTokenHash(token)).maybeSingle();
  return data;
}

/** Public view of a pay link: only first name + last initial, amount, status and expiry. */
export const getPeerLinkPublic = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => ({ token: String(d?.token ?? "") }))
  .handler(async ({ data }) => {
    const link = await findLink(data.token);
    if (!link) return { found: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: reg } = await supabaseAdmin.from("ignite_registrations").select("full_name, status, invoice_id, updated_at, payment_method, amount_usd, class_id").eq("id", link.registration_id).single();
    // A friend's payment whose NectarPay notice never arrived is picked up here too.
    const { reconcileIgniteRegistration } = await import("./ignite-confirm.server");
    const caughtUp = reg?.payment_method === "peer" && (await reconcileIgniteRegistration(reg));
    const state = reg?.status === "confirmed" || caughtUp ? "paid" : peerLinkState(link);
    let cls: { name: string; dates: string; time: string | null } | null = null;
    if (reg?.class_id) {
      const { loadClass, toPublic } = await import("./ignite-classes.server");
      const row = await loadClass({ id: reg.class_id }, true);
      if (row) {
        const c = toPublic(row);
        const { dateRangeLabel, sharedTimeLabel } = await import("./ignite-classes");
        cls = { name: c.name, dates: dateRangeLabel(c.sessions, c.timezone), time: sharedTimeLabel(c.sessions, c.timezone) };
      }
    }
    return { found: true as const, forName: shortName(reg?.full_name ?? ""), amount: Number(reg?.amount_usd ?? 0), cls, state, expiresAt: link.expires_at };
  });

/** Signed-in Honest.Money member opens a NectarPay checkout for someone else's seat. */
export const startPeerCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; origin: string }) => ({ token: String(d?.token ?? ""), origin: String(d?.origin ?? "") }))
  .handler(async ({ data, context }) => {
    const link = await findLink(data.token);
    if (!link) throw new Error("Payment link not found.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createInvoice, nectarpayConfigured } = await import("./nectarpay.server");
    const { seatsFull } = await import("./ignite.server");
    if (!nectarpayConfigured()) throw new Error("Crypto checkout isn't open yet.");
    const [{ data: reg }, { data: payer }] = await Promise.all([
      supabaseAdmin.from("ignite_registrations").select("id, user_id, class_id, amount_usd, full_name, status, payment_method, invoice_id, checkout_url, invoice_expires_at").eq("id", link.registration_id).single(),
      supabaseAdmin.from("profiles").select("display_name, hm_member_id").eq("id", context.userId).maybeSingle(),
    ]);
    if (!reg) throw new Error("Payment link not found.");
    const payerEmail = normalizeEmail((context.claims as { email?: string }).email ?? "");
    const block = peerCheckoutBlock({ link, reg, payerId: context.userId, payerHmeLinked: !!payer?.hm_member_id && !!payerEmail, registrantFirstName: firstName(reg.full_name) });
    if (block) throw new Error(block);

    // Same payer, checkout still open: send them back to it.
    if (reg.payment_method === "peer" && link.payer_id === context.userId && reg.checkout_url && reg.invoice_id === link.invoice_id && invoiceLive(reg.invoice_expires_at))
      return { checkoutUrl: reg.checkout_url };
    const { loadClass } = await import("./ignite-classes.server");
    const cls = reg.class_id ? await loadClass({ id: reg.class_id }, true) : null;
    if (!cls) throw new Error("This seat's class couldn't be found. Ask your friend to make a new link.");
    if (await seatsFull(reg.user_id, cls.id, cls.capacity)) throw new Error(`${cls.name} is fully reserved.`);
    if (!(Number(reg.amount_usd) >= 1)) throw new Error("This link has no amount to pay.");

    // Claim the seat's checkout slot atomically so two people can't open checkouts at once.
    const nowIso = new Date().toISOString();
    const claimUntil = new Date(Date.now() + 65 * 60_000).toISOString();
    const { data: claimed } = await supabaseAdmin.from("ignite_registrations")
      .update({ status: "pending", payment_method: "peer", checkout_url: null, invoice_expires_at: claimUntil, updated_at: nowIso })
      .eq("id", reg.id).neq("status", "confirmed")
      .or(`invoice_expires_at.is.null,invoice_expires_at.lt.${new Date(Date.now() + 60_000).toISOString()}`)
      .select("id");
    if (!claimed?.length) throw new Error("Someone else is paying for this seat right now. Try again in about an hour.");
    const { data: linkClaim } = await supabaseAdmin.from("ignite_peer_links")
      .update({ payer_id: context.userId, payer_name: (payer?.display_name || payerEmail.split("@")[0]).slice(0, 60), payer_email: payerEmail, payer_hm_member_id: payer!.hm_member_id, opened_at: nowIso, updated_at: nowIso })
      .eq("id", link.id).eq("status", "active").select("id");
    if (!linkClaim?.length) throw new Error("This link is no longer active.");

    let inv;
    try {
      inv = await createInvoice({
        amount: Number(reg.amount_usd), order_id: `ignite-peer-${link.id}`, description: `Seeds Ignite ${cls.name} seat for ${shortName(reg.full_name)} (Peer Pay)`,
        redirect_url: `${safeOrigin(data.origin)}/pay/${data.token}?paid=1`, buyer_email: payerEmail, expires_in_seconds: 3600,
      });
    } catch (e) {
      // Release the slot so the seat isn't held by a checkout that never opened.
      await supabaseAdmin.from("ignite_registrations").update({ invoice_expires_at: null }).eq("id", reg.id).eq("invoice_expires_at", claimUntil);
      throw e;
    }
    await Promise.all([
      supabaseAdmin.from("ignite_registrations").update({ invoice_id: inv.id, checkout_url: inv.checkout_url, invoice_expires_at: inv.expires_at }).eq("id", reg.id),
      supabaseAdmin.from("ignite_peer_links").update({ invoice_id: inv.id }).eq("id", link.id),
    ]);
    if (link.payer_id !== context.userId) {
      const { notifyUser } = await import("./telegram.server");
      await notifyUser(reg.user_id, "notify_p2p", `👀 ${(payer?.display_name || "Your friend").slice(0, 60)} opened your Peer Pay link and is paying for your Ignite seat.`);
    }
    return { checkoutUrl: inv.checkout_url };
  });
