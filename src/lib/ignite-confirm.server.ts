// Server-only: the one place an Ignite seat becomes "confirmed".
// Called by the signed NectarPay webhook and by the payment re-check, so a
// missed webhook can't strand a paid seat. Both paths re-read the invoice from
// the NectarPay API and confirm with a compare-and-set, so notices fire once.
import { CONFIRMABLE_STATUSES, SEAT_NOTICE_GIVE_UP_MS, SEAT_NOTICE_GRACE_MS, canConfirmSeat, seatNoticesDue, invoiceBelongs, invoiceSettled, paidInLabel, inviteUrl, registrationIdFromOrderId } from "./ignite-registration";

type EventData = { invoice_id: string; chain?: string | null; paid_amount_usd?: number | null };
const REG_COLS = "id, user_id, status, hm_member_id, email, full_name, amount_usd, payment_method, invoice_id, ref_code";

export async function processIgniteInvoiceEvent(type: string, data: EventData): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getInvoice } = await import("./nectarpay.server");
  let { data: reg } = await supabaseAdmin.from("ignite_registrations").select(REG_COLS).eq("invoice_id", data.invoice_id).maybeSingle();
  // Peer Pay invoices are also remembered on the link, so a payment on an older checkout is never lost.
  const { data: peer } = await supabaseAdmin.from("ignite_peer_links").select("id, registration_id, status, payer_name, payer_hm_member_id").eq("invoice_id", data.invoice_id).maybeSingle();
  if (!reg && peer) ({ data: reg } = await supabaseAdmin.from("ignite_registrations").select(REG_COLS).eq("id", peer.registration_id).maybeSingle());
  // A seat remembers only its newest checkout. A payment on an earlier checkout for the same seat
  // (member opened a new one later) is found through the order id NectarPay itself reports for
  // that invoice — never the order id in the notice body (Russ, Nov 23 2026).
  let earlierCheckout = false;
  if (!reg && !peer && type === "invoice.confirmed") {
    const regId = registrationIdFromOrderId((await getInvoice(data.invoice_id)).order_id);
    if (regId) ({ data: reg } = await supabaseAdmin.from("ignite_registrations").select(REG_COLS).eq("id", regId).maybeSingle());
    earlierCheckout = !!reg;
  }
  if (!reg) return "ignored";

  if (earlierCheckout && reg.status === "confirmed") {
    // Paid twice (an earlier checkout and the newest one): flag for a refund, never a second seat.
    const inv = await getInvoice(data.invoice_id);
    if (["confirmed", "overpaid"].includes(inv.status) && invoiceBelongs(inv.order_id, reg.id, null)) {
      console.error("[ignite] second payment on an earlier checkout needs refund", { registration: reg.id, invoice: data.invoice_id });
      const { notifyUser } = await import("@/lib/telegram.server");
      await notifyUser(reg.user_id, "notify_p2p", "⚠️ A second payment arrived for your Ignite seat, which was already paid. Contact support@honest.money so it can be refunded.");
    }
    return "duplicate_payment";
  }

  if (type === "invoice.confirmed" && reg.status === "confirmed" && peer && peer.status !== "paid" && peer.status !== "paid_duplicate") {
    // Seat was already paid another way; flag this second payment for a refund.
    const inv = await getInvoice(data.invoice_id);
    if (["confirmed", "overpaid"].includes(inv.status)) {
      const { data: flagged } = await supabaseAdmin.from("ignite_peer_links").update({ status: "paid_duplicate", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", peer.id).not("status", "in", "(paid,paid_duplicate)").select("id");
      if (flagged?.length) {
        console.error("[peer-pay] duplicate payment needs refund", { link: peer.id, invoice: data.invoice_id });
        const { notifyUser } = await import("@/lib/telegram.server");
        await notifyUser(reg.user_id, "notify_p2p", "⚠️ A second payment arrived for your Ignite seat, which was already paid. Contact support@honest.money so it can be refunded.");
      }
    }
    return "duplicate_payment";
  }

  if (type === "invoice.underpaid" && reg.status === "pending") {
    await supabaseAdmin.from("ignite_registrations").update({ status: "underpaid", updated_at: new Date().toISOString() }).eq("id", reg.id).eq("status", "pending");
    return "underpaid";
  }
  if (type !== "invoice.confirmed" || reg.status === "confirmed") return "noop";
  if (!canConfirmSeat(reg.status)) {
    // A cancelled (refunded) seat is never revived by a late or repeated payment notice.
    console.error("[ignite] payment notice for a cancelled seat — review by hand", reg.id, data.invoice_id);
    return "noop";
  }

  const inv = await getInvoice(data.invoice_id);
  if (!invoiceBelongs(inv.order_id, reg.id, peer?.id ?? null)) return "unverified";
  if (!invoiceSettled(inv, reg.amount_usd)) {
    // Paid in full for a smaller amount than the seat now costs (e.g. an older checkout from before
    // the member switched class). Never drop it silently: hold it as underpaid for staff to sort out.
    if (["confirmed", "overpaid"].includes(inv.status)) {
      console.error("[ignite] paid checkout is below the seat price — review by hand", { registration: reg.id, invoice: data.invoice_id, paid: inv.fiat_amount, price: reg.amount_usd });
      await supabaseAdmin.from("ignite_registrations").update({ status: "underpaid", updated_at: new Date().toISOString(), invoice_id: data.invoice_id })
        .eq("id", reg.id).in("status", ["pending", "expired"]);
      return "underpaid";
    }
    return "unverified";
  }
  // NectarPay names the chain, not the coin: read the asset back off the chain itself.
  const { resolvePaidAsset } = await import("./ignite-asset.server");
  const paidAsset = await resolvePaidAsset(inv.chain ?? data.chain, inv.address);
  const now = new Date().toISOString();
  const { data: won } = await supabaseAdmin.from("ignite_registrations").update({
    status: "confirmed", confirmed_at: now, updated_at: now,
    // The checkout that was actually paid (an earlier one can be paid after a newer one was opened).
    ...(earlierCheckout ? { invoice_id: data.invoice_id, checkout_url: null } : {}),
    paid_chain: data.chain ?? inv.chain ?? null, paid_amount_usd: data.paid_amount_usd ?? null, paid_asset: paidAsset,
  }).eq("id", reg.id).in("status", [...CONFIRMABLE_STATUSES]).select("id");
  if (!won?.length) return "noop"; // the other path confirmed it first

  if (peer) await supabaseAdmin.from("ignite_peer_links").update({ status: "paid", paid_at: now, updated_at: now }).eq("id", peer.id);
  await sendSeatNotices(reg.id);
  return "confirmed";
}

const lastCheck = new Map<string, number>();

/**
 * Re-checks a still-unconfirmed seat with NectarPay (server to server) and confirms
 * it through the same path as the webhook. Throttled per invoice; never throws.
 */
export async function reconcileIgniteRegistration(reg: { status: string; invoice_id: string | null; updated_at?: string | null } | null) {
  if (!reg?.invoice_id || !["pending", "underpaid"].includes(reg.status)) return false;
  if (reg.updated_at && Date.now() - new Date(reg.updated_at).getTime() > 7 * 86_400_000) return false;
  const last = lastCheck.get(reg.invoice_id) ?? 0;
  if (Date.now() - last < 8_000) return false;
  lastCheck.set(reg.invoice_id, Date.now());
  try {
    const { getInvoice } = await import("./nectarpay.server");
    const inv = await getInvoice(reg.invoice_id);
    if (!["confirmed", "overpaid"].includes(inv.status)) return false;
    return (await processIgniteInvoiceEvent("invoice.confirmed", { invoice_id: inv.id, chain: inv.chain })) === "confirmed";
  } catch (e) {
    console.warn("[ignite] payment re-check failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * The member's "seat confirmed" email, Telegram note and Honest.Money purchase report.
 * Each one is claimed in alert_log before it goes out, so it is sent at most once; the seat is
 * marked notices_done_at only when the email went out (or was skipped by rule), so a payment
 * notice cut off midway is finished by the minute job (resumeSeatNotices). Never throws.
 */
export async function sendSeatNotices(regId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  try {
    const { data: reg } = await supabaseAdmin.from("ignite_registrations")
      .select("id, user_id, class_id, status, hm_member_id, email, full_name, amount_usd, fee_usd, miner_discount_usd, deposit_usd, ref_code, paid_asset, paid_chain, confirmed_at, notices_done_at")
      .eq("id", regId).maybeSingle();
    if (!reg || reg.status !== "confirmed" || reg.notices_done_at) return false;
    const { data: peer } = await supabaseAdmin.from("ignite_peer_links").select("payer_name, payer_hm_member_id")
      .eq("registration_id", reg.id).eq("status", "paid").order("paid_at", { ascending: false }).limit(1).maybeSingle();
    const payerName = peer ? (peer.payer_name ?? "Your friend") : null;
    const claim = async (kind: string) => {
      const { data } = await supabaseAdmin.from("alert_log")
        .upsert({ user_id: reg.user_id, kind, subject: reg.id }, { onConflict: "user_id,kind,subject", ignoreDuplicates: true }).select("user_id");
      return !!data?.length;
    };

    const { loadClass, toPublic } = await import("./ignite-classes.server");
    const { dateRangeLabel, sharedTimeLabel, sessionLines, firstSessionShort } = await import("./ignite-classes");
    const clsRow = reg.class_id ? await loadClass({ id: reg.class_id }, true) : null;
    const cls = clsRow ? toPublic(clsRow) : null;
    const when = cls ? firstSessionShort(cls.sessions, cls.timezone) : null;
    const { hmeReferralCode, sendHubEvent } = await import("@/lib/hme-hub.server");
    const code = await hmeReferralCode(reg.hm_member_id);
    const { emailUser } = await import("@/lib/email/send.server");
    const emailed = await emailUser(reg.user_id, "ignite-seat-confirmed", (r) => ({
      name: ((n) => n.charAt(0).toUpperCase() + n.slice(1))(reg.full_name.trim().split(/\s+/)[0] || r.name), amount: Number(reg.amount_usd), paidBy: payerName,
      paidWith: paidInLabel(reg.paid_asset, reg.paid_chain),
      confirmedAt: reg.confirmed_at ?? new Date().toISOString(), timezone: r.timezone, referralUrl: code ? inviteUrl(code) : null,
      className: cls?.name ?? "Ignite", classSlug: cls?.slug ?? null,
      dates: cls ? dateRangeLabel(cls.sessions, cls.timezone) : "To be announced",
      time: cls ? (sharedTimeLabel(cls.sessions, cls.timezone) ?? sessionLines(cls.sessions, cls.timezone).join("; ")) : "To be announced",
      feeUsd: Number(reg.fee_usd ?? 0), minerDiscountUsd: Number(reg.miner_discount_usd ?? 0), depositUsd: Number(reg.deposit_usd ?? reg.amount_usd),
    }), { dedupe: reg.id, to: reg.email });

    if (await claim("ignite:telegram-confirmed")) {
      const { notifyUser } = await import("@/lib/telegram.server");
      await notifyUser(reg.user_id, "notify_p2p", payerName
        ? `✅ ${payerName} paid your Seeds Ignite seat${cls ? ` in ${cls.name}` : ""}. You're confirmed.${when ? ` See you ${when}.` : ""}`
        : `✅ Your Seeds Ignite seat${cls ? ` in ${cls.name}` : ""} is confirmed.${when ? ` See you ${when}.` : ""}`);
    }
    if (await claim("ignite:hub-purchase")) {
      await sendHubEvent({
        event: "purchase", member_id: reg.hm_member_id, email: reg.email, ref: reg.ref_code,
        metadata: { product: "ignite_seat", class: cls?.slug ?? null, amount_usd: Number(reg.amount_usd), ...(peer ? { paid_by: "peer", payer_member_id: peer.payer_hm_member_id } : {}) },
      });
    }
    if (emailed === "failed") return false; // claim was freed; the minute job tries again
    await supabaseAdmin.from("ignite_registrations").update({ notices_done_at: new Date().toISOString() }).eq("id", reg.id).is("notices_done_at", null);
    return true;
  } catch (e) {
    console.error("[ignite] seat notices failed", regId, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Minute job: finish notices for seats confirmed 2 minutes to 3 days ago that never got them. */
export async function resumeSeatNotices(limit = 20) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = Date.now();
  const { data } = await supabaseAdmin.from("ignite_registrations").select("id, status, confirmed_at, notices_done_at")
    .eq("status", "confirmed").is("notices_done_at", null)
    .lte("confirmed_at", new Date(now - SEAT_NOTICE_GRACE_MS).toISOString())
    .gte("confirmed_at", new Date(now - SEAT_NOTICE_GIVE_UP_MS).toISOString())
    .order("confirmed_at").limit(limit);
  let done = 0;
  for (const row of data ?? []) if (seatNoticesDue(row, now) && (await sendSeatNotices(row.id))) done++;
  return { due: data?.length ?? 0, done };
}
