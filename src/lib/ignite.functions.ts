import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { safeOrigin } from "./safe-origin";
import { inviteUrl, validateDetails, type Details } from "./ignite-registration";
import { emailsLeft, peerLinkState, peerToken, selfCheckoutBlock } from "./ignite-peer";
import type { ClassPrice, IgniteClassPublic, MinerStatus } from "./ignite-classes";

const COLS = "id, class_id, payment_method, status, full_name, email, country_code, phone, amount_usd, fee_usd, miner_discount_usd, deposit_usd, checkout_url, invoice_expires_at, confirmed_at, paid_chain, paid_asset";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Short class summary attached to a member's registration. */
export type MyClass = { id: string; slug: string; name: string; dates: string; time: string | null; sessions: string; timezone: string };

async function classSummary(classId: string | null): Promise<MyClass | null> {
  if (!classId) return null;
  const { loadClass, toPublic } = await import("./ignite-classes.server");
  const row = await loadClass({ id: classId }, true);
  if (!row) return null;
  const c = toPublic(row);
  const { dateRangeLabel, sharedTimeLabel, sessionsLabel } = await import("./ignite-classes");
  return { id: c.id, slug: c.slug, name: c.name, dates: dateRangeLabel(c.sessions, c.timezone), time: sharedTimeLabel(c.sessions, c.timezone), sessions: sessionsLabel(c.sessions), timezone: c.timezone };
}

/**
 * The signed-in member's registration (if any) with its class, prefill from their HME
 * profile, whether crypto checkout is open, and — when a class is named — what a seat in
 * that class costs them (with the HME-miner waiver worked out on the server).
 */
export const getMyIgnite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { classId?: string } | undefined) => ({ classId: d?.classId && UUID_RE.test(d.classId) ? d.classId : null }))
  .handler(async ({ data, context }) => {
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
    let quote: null | { price: ClassPrice; miner: MinerStatus } = null;
    if (data.classId) {
      const { loadClass } = await import("./ignite-classes.server");
      const cls = await loadClass({ id: data.classId });
      if (cls) {
        const { classPrice } = await import("./ignite-classes");
        const { cachedMinerStatus } = await import("./ignite.server");
        const fee = Number(cls.fee_usd);
        const miner: MinerStatus = cls.miners_free && fee > 0 ? await cachedMinerStatus(context.userId) : "unknown";
        quote = { miner, price: classPrice({ feeUsd: fee, depositUsd: Number(cls.deposit_usd), minersFree: cls.miners_free }, miner) };
      }
    }
    return {
      peer,
      registration: reg,
      regClass: await classSummary(reg?.class_id ?? null),
      quote,
      prefill: { fullName: prof?.display_name ?? "", email: (context.claims as { email?: string }).email ?? "" },
      hmeLinked: !!prof?.hm_member_id,
      cryptoOpen: nectarpayConfigured(),
    };
  });

/** Saves details and opens a NectarPay invoice for a seat in one class. Amount always comes from the server. */
export const startIgniteCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Details & { origin: string; ref?: string | null; classId: string }) => d)
  .handler(async ({ data, context }) => {
    if (Object.keys(validateDetails(data)).length) throw new Error("Please check your details.");
    const origin = safeOrigin(data.origin); // Seeds' own hosts only (review P1 sweep)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createInvoice, nectarpayConfigured } = await import("./nectarpay.server");
    if (!nectarpayConfigured()) throw new Error("Crypto checkout isn't open yet.");

    const { data: existing } = await supabaseAdmin.from("ignite_registrations")
      .select("id, status, class_id, amount_usd, payment_method, checkout_url, invoice_expires_at").eq("user_id", context.userId).maybeSingle();
    if (existing?.status === "confirmed") throw new Error("Your seat is already confirmed.");
    const { data: activeLink } = existing
      ? await supabaseAdmin.from("ignite_peer_links").select("id, status, expires_at").eq("registration_id", existing.id).eq("status", "active").maybeSingle()
      : { data: null };
    const block = selfCheckoutBlock({ hasActivePeerLink: !!activeLink && peerLinkState(activeLink) === "active", reg: existing ?? null });
    if (block) throw new Error(block);

    const { priceSeat, saveRegistration, switchBlock } = await import("./ignite.server");
    const { cls, price } = await priceSeat(context.userId, String(data.classId ?? ""));
    const sw = switchBlock(existing ?? null, cls.id, price.totalUsd, cls.name);
    if (sw) throw new Error(sw);
    if (existing?.status === "pending" && existing.payment_method === "nectarpay" && existing.class_id === cls.id && Number(existing.amount_usd) === price.totalUsd
      && existing.checkout_url && existing.invoice_expires_at && new Date(existing.invoice_expires_at).getTime() > Date.now() + 60_000)
      return { checkoutUrl: existing.checkout_url };

    const regId = await saveRegistration(context.userId, data, cls, price, "nectarpay", existing?.id ?? null);
    const inv = await createInvoice({
      amount: price.totalUsd, order_id: `ignite-${regId}`,
      description: `Seeds Flight School: ${cls.name} seat${price.feeUsd - price.minerDiscountUsd > 0 ? " (class fee + trade deposit)" : " (trade deposit)"}`,
      redirect_url: `${origin}/flight-school/confirmed`, buyer_email: data.email.trim().toLowerCase(), expires_in_seconds: 3600,
    });
    await supabaseAdmin.from("ignite_registrations").update({ invoice_id: inv.id, checkout_url: inv.checkout_url, invoice_expires_at: inv.expires_at }).eq("id", regId);
    return { checkoutUrl: inv.checkout_url };
  });

/**
 * The page members land on after NectarPay checkout. Re-checks a pending payment
 * with NectarPay, then reports seat status, its class and (once confirmed) the
 * member's Honest.Money referral link.
 */
export const getIgniteConfirmation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { reconcileIgniteRegistration } = await import("./ignite-confirm.server");
    const cols = "status, class_id, invoice_id, invoice_expires_at, updated_at, full_name, email, paid_chain, paid_asset, confirmed_at, payment_method, hm_member_id, id, amount_usd";
    let { data: reg } = await context.supabase.from("ignite_registrations").select(cols).eq("user_id", context.userId).maybeSingle();
    if (reg && (await reconcileIgniteRegistration(reg)))
      ({ data: reg } = await context.supabase.from("ignite_registrations").select(cols).eq("user_id", context.userId).maybeSingle());
    if (!reg) return { state: "none" as const, cls: null };
    const cls = await classSummary(reg.class_id);
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
        state: "confirmed" as const, cls, firstName, email: reg.email, amountUsd: Number(reg.amount_usd),
        paidChain: reg.paid_chain, paidAsset: reg.paid_asset, confirmedAt: reg.confirmed_at, paidBy, referralUrl: code ? inviteUrl(code) : null,
      };
    }
    if (reg.status === "underpaid") return { state: "underpaid" as const, cls, firstName };
    const live = !!reg.invoice_expires_at && new Date(reg.invoice_expires_at).getTime() > Date.now();
    // NectarPay can finish confirming a payment a little after the checkout window closes.
    const recentlyClosed = !!reg.invoice_expires_at && Date.now() - new Date(reg.invoice_expires_at).getTime() < 3 * 3_600_000;
    return { state: live || recentlyClosed ? ("pending" as const) : ("expired" as const), cls, firstName };
  });

export type PublicClass = IgniteClassPublic & { seatsLeft: number; held: number };

/** Public: every published class with seat counts (counts only, no member data). */
export const getIgniteClasses = createServerFn({ method: "GET" }).handler(async (): Promise<PublicClass[]> => {
  const { publicClasses } = await import("./ignite-classes.server");
  return publicClasses();
});

/** Public: one published class by its page address. */
export const getIgniteClass = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => ({ slug: String(d?.slug ?? "").slice(0, 40) }))
  .handler(async ({ data }): Promise<PublicClass | null> => {
    const { SLUG_RE, classSeatsLeft } = await import("./ignite-classes");
    if (!SLUG_RE.test(data.slug)) return null;
    const { loadClass, toPublic, seatsHeldByClass } = await import("./ignite-classes.server");
    const row = await loadClass({ slug: data.slug });
    if (!row) return null;
    const c = toPublic(row);
    const h = (await seatsHeldByClass()).get(c.id) ?? 0;
    return { ...c, held: h, seatsLeft: classSeatsLeft(c.capacity, h) };
  });

/** Public: the next class people can still join (for the homepage popup and reminders). */
export const getIgniteSeats = createServerFn({ method: "GET" }).handler(async () => {
  const { publicClasses } = await import("./ignite-classes.server");
  const classes = await publicClasses();
  const { canRegister, dateRangeLabel, priceLine, sessionsLabel, sharedTimeLabel, upcomingClasses } = await import("./ignite-classes");
  const next = upcomingClasses(classes).find((c) => canRegister(c, c.seatsLeft)) ?? null;
  return next
    ? {
        seatsLeft: next.seatsLeft, capacity: next.capacity,
        next: {
          slug: next.slug, name: next.name, startsAt: next.startsAt, dates: dateRangeLabel(next.sessions, next.timezone),
          format: sessionsLabel(next.sessions), time: sharedTimeLabel(next.sessions, next.timezone), price: priceLine(next),
          minersFree: next.minersFree && next.feeUsd > 0, instructorName: next.instructorName,
        },
      }
    : { seatsLeft: 0, capacity: 0, next: null };
});
