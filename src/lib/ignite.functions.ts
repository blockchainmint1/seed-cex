import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEPOSIT_USD, SEAT_CAPACITY, cleanRefCode, inviteUrl, seatsLeft, validateDetails, normalizeEmail, type Details } from "./ignite-registration";
import { emailsLeft, peerLinkState, peerToken, selfCheckoutBlock } from "./ignite-peer";

const COLS = "id, payment_method, status, full_name, email, country_code, phone, amount_usd, checkout_url, invoice_expires_at, confirmed_at, paid_chain, paid_asset";

/** The signed-in member's registration (if any), prefill from their HME profile, and whether crypto checkout is open. */
export const getMyIgnite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { nectarpayConfigured } = await import("./nectarpay.server");
    const { reconcileIgniteRegistration } = await import("./ignite-confirm.server");
    const { data: before } = await context.supabase.from("ignite_registrations").select("status, invoice_id, updated_at").eq("user_id", context.userId).maybeSingle();
    await reconcileIgniteRegistration(before);
    const [{ data: reg }, { data: prof }] = await Promise.all([
      context.supabase.from("ignite_registrations").select(COLS).eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("profiles").select("display_name, hm_member_id").eq("id", context.userId).maybeSingle(),
    ]);
    // Latest Peer Pay link, with the shareable URL rebuilt from the server secret.
    let peer: null | { path: string | null; state: string; expiresAt: string; payerName: string | null; openedAt: string | null; paidAt: string | null; emailsLeft: number } = null;
    if (reg) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: link } = await supabaseAdmin.from("ignite_peer_links")
        .select("id, status, expires_at, payer_name, opened_at, paid_at").eq("registration_id", reg.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (link) {
        const state = peerLinkState(link);
        const { count } = await supabaseAdmin.from("ignite_peer_emails").select("id", { count: "exact", head: true })
          .eq("registrant_id", context.userId).gte("sent_at", new Date(Date.now() - 86_400_000).toISOString());
        const secret = process.env.EMAIL_LINK_SECRET;
        peer = {
          path: state === "active" && secret ? `/pay/${peerToken(secret, link.id)}` : null,
          state, expiresAt: link.expires_at, payerName: link.payer_name, openedAt: link.opened_at, paidAt: link.paid_at,
          emailsLeft: emailsLeft(count ?? 0),
        };
      }
    }
    return {
      peer,
      registration: reg,
      prefill: { fullName: prof?.display_name ?? "", email: (context.claims as { email?: string }).email ?? "" },
      hmeLinked: !!prof?.hm_member_id,
      cryptoOpen: nectarpayConfigured(),
    };
  });

/** Saves details and opens a NectarPay invoice. Amount always comes from the server. */
export const startIgniteCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Details & { origin: string; ref?: string | null }) => d)
  .handler(async ({ data, context }) => {
    if (Object.keys(validateDetails(data)).length) throw new Error("Please check your details.");
    const origin = /^https:\/\/[a-z0-9.-]+$/i.test(data.origin) || data.origin.startsWith("http://localhost") ? data.origin : "https://seeds.honest.money";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createInvoice, nectarpayConfigured } = await import("./nectarpay.server");
    if (!nectarpayConfigured()) throw new Error("Crypto checkout isn't open yet.");

    const { data: existing } = await supabaseAdmin.from("ignite_registrations").select("id, status, payment_method, checkout_url, invoice_expires_at").eq("user_id", context.userId).maybeSingle();
    if (existing?.status === "confirmed") throw new Error("Your seat is already confirmed.");
    const { data: activeLink } = existing
      ? await supabaseAdmin.from("ignite_peer_links").select("id, status, expires_at").eq("registration_id", existing.id).eq("status", "active").maybeSingle()
      : { data: null };
    const block = selfCheckoutBlock({ hasActivePeerLink: !!activeLink && peerLinkState(activeLink) === "active", reg: existing ?? null });
    if (block) throw new Error(block);
    if (existing?.status === "pending" && existing.payment_method === "nectarpay" && existing.checkout_url && existing.invoice_expires_at && new Date(existing.invoice_expires_at).getTime() > Date.now() + 60_000)
      return { checkoutUrl: existing.checkout_url };

    const now = new Date().toISOString();
    const { seatsFull } = await import("./ignite.server");
    if (await seatsFull(context.userId)) throw new Error("Ignite is fully reserved.");

    const { data: prof } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", context.userId).maybeSingle();
    const email = normalizeEmail(data.email);
    const { data: row, error } = await supabaseAdmin.from("ignite_registrations").upsert({
      user_id: context.userId, hm_member_id: prof?.hm_member_id ?? null, full_name: data.fullName.trim(), email,
      country_code: data.countryCode, phone: data.phone.replace(/[\s\-().]/g, ""), marketing_opt_in: !!data.marketingOptIn,
      amount_usd: DEPOSIT_USD, status: "pending", payment_method: "nectarpay", updated_at: now,
      ...(cleanRefCode(data.ref) ? { ref_code: cleanRefCode(data.ref) } : {}),
    }, { onConflict: "user_id" }).select("id").single();
    if (error || !row) throw new Error("Couldn't save your registration.");

    const inv = await createInvoice({
      amount: DEPOSIT_USD, order_id: `ignite-${row.id}`, description: "Seeds Ignite class reservation",
      redirect_url: `${origin}/register/confirmed`, buyer_email: email, expires_in_seconds: 3600,
    });
    await supabaseAdmin.from("ignite_registrations").update({ invoice_id: inv.id, checkout_url: inv.checkout_url, invoice_expires_at: inv.expires_at }).eq("id", row.id);
    return { checkoutUrl: inv.checkout_url };
  });

/** Seats held right now: confirmed, or with a live checkout. */
async function seatsHeld() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("ignite_registrations").select("id", { count: "exact", head: true })
    .or(`status.eq.confirmed,and(status.in.(pending,underpaid),invoice_expires_at.gt.${new Date().toISOString()})`);
  return count ?? 0;
}

/**
 * The page members land on after NectarPay checkout. Re-checks a pending payment
 * with NectarPay, then reports seat status, seats left and (once confirmed) the
 * member's Honest.Money referral link.
 */
export const getIgniteConfirmation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reconcileIgniteRegistration } = await import("./ignite-confirm.server");
    const cols = "status, invoice_id, invoice_expires_at, updated_at, full_name, email, paid_chain, paid_asset, confirmed_at, payment_method, hm_member_id, id";
    let { data: reg } = await context.supabase.from("ignite_registrations").select(cols).eq("user_id", context.userId).maybeSingle();
    if (reg && (await reconcileIgniteRegistration(reg)))
      ({ data: reg } = await context.supabase.from("ignite_registrations").select(cols).eq("user_id", context.userId).maybeSingle());
    const left = seatsLeft(await seatsHeld());
    if (!reg) return { state: "none" as const, seatsLeft: left, capacity: SEAT_CAPACITY };
    const first = reg.full_name.trim().split(/\s+/)[0] || "there";
    const firstName = first.charAt(0).toUpperCase() + first.slice(1);
    if (reg.status === "confirmed") {
      let paidBy: string | null = null;
      if (reg.payment_method === "peer") {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: link } = await supabaseAdmin.from("ignite_peer_links").select("payer_name").eq("registration_id", reg.id).eq("status", "paid").maybeSingle();
        paidBy = link?.payer_name ?? null;
      }
      const { hmeReferralCode } = await import("./hme-hub.server");
      const code = await hmeReferralCode(reg.hm_member_id);
      return {
        state: "confirmed" as const, seatsLeft: left, capacity: SEAT_CAPACITY, firstName, email: reg.email,
        paidChain: reg.paid_chain, paidAsset: reg.paid_asset, confirmedAt: reg.confirmed_at, paidBy, referralUrl: code ? inviteUrl(code) : null,
      };
    }
    if (reg.status === "underpaid") return { state: "underpaid" as const, seatsLeft: left, capacity: SEAT_CAPACITY, firstName };
    const live = !!reg.invoice_expires_at && new Date(reg.invoice_expires_at).getTime() > Date.now();
    // NectarPay can finish confirming a payment a little after the checkout window closes.
    const recentlyClosed = !!reg.invoice_expires_at && Date.now() - new Date(reg.invoice_expires_at).getTime() < 3 * 3_600_000;
    return { state: live || recentlyClosed ? ("pending" as const) : ("expired" as const), seatsLeft: left, capacity: SEAT_CAPACITY, firstName };
  });

/** Public: seats still open (a count only, no member data). */
export const getIgniteSeats = createServerFn({ method: "GET" }).handler(async () => ({ seatsLeft: seatsLeft(await seatsHeld()), capacity: SEAT_CAPACITY }));
