// Server-only: NectarPay checkout and payment confirmation for listing applications.
// Mirrors the Ignite flow: the amount always comes from the stored application, every
// checkout is remembered in listing_invoices, and a payment is confirmed only after
// re-reading the invoice from NectarPay's API, with a compare-and-set so notices fire once.
import {
  CHECKOUT_MINUTES, PAYABLE_STATUSES, applicationIdFromOrderId, checkoutBlock, checkoutStillOpen,
  listingInvoicePaid, listingOrderId, packageById,
} from "./listing";

const APP_COLS = "id, user_id, package, coin_name, ticker, contact_email, status, amount_usd, payment_status, invoice_id, checkout_url, invoice_expires_at, paid_invoice_id, updated_at";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number | string) => `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Telegram heads-up to every admin with verified Telegram. Best-effort. */
export async function tellListingAdmins(text: string) {
  try {
    const { telegramConfigured, sendTelegram } = await import("./telegram.server");
    if (!telegramConfigured()) return;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) return;
    const { data: people } = await supabaseAdmin.from("profiles").select("telegram_chat_id, telegram_verified").in("id", ids);
    await Promise.all((people ?? []).filter((p) => p.telegram_verified && p.telegram_chat_id).map((p) => sendTelegram(String(p.telegram_chat_id), text).catch(() => {})));
  } catch (e) {
    console.error("listing admin alert failed", e);
  }
}

export function safeOrigin(origin: string | null | undefined) {
  const o = origin ?? "";
  return /^https:\/\/[a-z0-9.-]+$/i.test(o) || o.startsWith("http://localhost") ? o : "https://seeds.honest.money";
}

/**
 * Opens (or reuses) a NectarPay checkout for the applicant's own application.
 * Caller has already checked the application belongs to the signed-in member.
 */
export async function openListingCheckout(applicationId: string, origin: string): Promise<{ checkoutUrl: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createInvoice, nectarpayConfigured } = await import("./nectarpay.server");
  if (!nectarpayConfigured()) throw new Error("Crypto checkout isn't open yet. We'll email you payment details.");
  const { data: app } = await supabaseAdmin.from("listing_applications").select(APP_COLS).eq("id", applicationId).maybeSingle();
  if (!app) throw new Error("We couldn't find that application.");
  const block = checkoutBlock(app);
  if (block) throw new Error(block);
  if (app.payment_status === "pending" && app.checkout_url && checkoutStillOpen(app.invoice_expires_at)) return { checkoutUrl: app.checkout_url };

  const pkg = packageById(app.package);
  const inv = await createInvoice({
    amount: Number(app.amount_usd), order_id: listingOrderId(app.id),
    description: `Seeds listing — ${pkg?.name ?? app.package} package for ${app.ticker}`,
    redirect_url: `${safeOrigin(origin)}/list?paid=${app.id}#apply`, buyer_email: app.contact_email,
    expires_in_seconds: CHECKOUT_MINUTES * 60,
  });
  // Remember every checkout, so a payment on an older one is still found.
  const { error: remErr } = await supabaseAdmin.from("listing_invoices").insert({ invoice_id: inv.id, application_id: app.id, amount_usd: Number(app.amount_usd) });
  if (remErr) console.error("[listing] couldn't remember invoice (order id fallback still works)", inv.id, remErr.message);
  const now = new Date().toISOString();
  await supabaseAdmin.from("listing_applications").update({
    invoice_id: inv.id, checkout_url: inv.checkout_url, invoice_expires_at: inv.expires_at, payment_status: "pending", updated_at: now,
  }).eq("id", app.id).in("payment_status", ["unpaid", "pending"]);
  return { checkoutUrl: inv.checkout_url };
}

/** The application a NectarPay invoice belongs to, or null when it isn't a listing invoice. */
export async function listingApplicationForInvoice(invoiceId: string, type: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("listing_invoices").select("application_id").eq("invoice_id", invoiceId).maybeSingle();
  if (data) return data.application_id;
  if (type !== "invoice.confirmed") return null;
  // A known Ignite checkout never needs the extra NectarPay read.
  const [{ data: seat }, { data: peer }] = await Promise.all([
    supabaseAdmin.from("ignite_registrations").select("id").eq("invoice_id", invoiceId).maybeSingle(),
    supabaseAdmin.from("ignite_peer_links").select("id").eq("invoice_id", invoiceId).maybeSingle(),
  ]);
  if (seat || peer) return null;
  // Not remembered (the insert after checkout failed): trust only the order id NectarPay itself reports.
  const { getInvoice } = await import("./nectarpay.server");
  const id = applicationIdFromOrderId((await getInvoice(invoiceId)).order_id);
  if (!id) return null;
  const { data: app } = await supabaseAdmin.from("listing_applications").select("id").eq("id", id).maybeSingle();
  return app?.id ?? null;
}

export async function processListingInvoiceEvent(type: string, applicationId: string, data: { invoice_id: string; chain?: string | null; paid_amount_usd?: number | null }): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getInvoice } = await import("./nectarpay.server");
  const { data: app } = await supabaseAdmin.from("listing_applications").select(APP_COLS).eq("id", applicationId).maybeSingle();
  if (!app) return "ignored";
  const now = new Date().toISOString();

  if (type === "invoice.underpaid") {
    const { data: moved } = await supabaseAdmin.from("listing_applications").update({ payment_status: "underpaid", updated_at: now })
      .eq("id", app.id).in("payment_status", ["unpaid", "pending"]).select("id");
    if (moved?.length) await tellListingAdmins(`⚠️ <b>Listing part paid</b>\n${esc(app.coin_name)} (${esc(app.ticker)}) paid less than ${usd(app.amount_usd)}. Sort out the rest with them by hand.\nseeds.honest.money/admin/listings`);
    return "underpaid";
  }
  if (type !== "invoice.confirmed") return "noop";

  const inv = await getInvoice(data.invoice_id);
  if (!listingInvoicePaid(inv, app)) return "unverified";

  if (!(PAYABLE_STATUSES as readonly string[]).includes(app.payment_status)) {
    if (app.payment_status === "paid" && app.paid_invoice_id === inv.id) return "noop";
    // Paid twice (two checkouts), or paid after a refund / free promo: flag it, never count it twice.
    console.error("[listing] extra payment needs refund", { application: app.id, invoice: inv.id, state: app.payment_status });
    await tellListingAdmins(`⚠️ <b>Extra listing payment</b>\n${esc(app.coin_name)} (${esc(app.ticker)}) paid again (invoice ${esc(inv.id)}) after it was already ${esc(app.payment_status)}. Refund it by hand.\nseeds.honest.money/admin/listings`);
    return "duplicate_payment";
  }

  const { resolvePaidAsset } = await import("./ignite-asset.server");
  const paidAsset = await resolvePaidAsset(inv.chain ?? data.chain, inv.address).catch(() => null);
  const { data: won } = await supabaseAdmin.from("listing_applications").update({
    payment_status: "paid", paid_at: now, paid_invoice_id: inv.id, invoice_id: inv.id, checkout_url: null, updated_at: now,
    paid_chain: data.chain ?? inv.chain ?? null, paid_amount_usd: data.paid_amount_usd ?? Number(inv.fiat_amount), paid_asset: paidAsset,
  }).eq("id", app.id).in("payment_status", [...PAYABLE_STATUSES]).select("id");
  if (!won?.length) return "noop"; // the other path confirmed it first

  const pkg = packageById(app.package);
  await tellListingAdmins(
    `💰 <b>Listing paid</b>\n${esc(app.coin_name)} (${esc(app.ticker)}) · ${esc(pkg?.name ?? app.package)} · ${usd(app.amount_usd)}` +
    `${app.status === "declined" ? "\n⚠️ This application was already declined — refund it by hand." : ""}\nseeds.honest.money/admin/listings`,
  );
  const { notifyUser } = await import("./telegram.server");
  await notifyUser(app.user_id, "notify_p2p", `✅ We got your ${usd(app.amount_usd)} payment for listing ${app.coin_name} (${app.ticker}) on Seeds. We'll be in touch by email.`);
  try {
    const { data: prof } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", app.user_id).maybeSingle();
    const { sendHubEvent } = await import("./hme-hub.server");
    await sendHubEvent({
      event: "purchase", member_id: prof?.hm_member_id ?? null, email: app.contact_email,
      metadata: { product: "seeds_listing", package: app.package, amount_usd: Number(app.amount_usd) },
    });
  } catch (e) {
    console.warn("[listing] HME purchase report failed", e instanceof Error ? e.message : e);
  }
  return "confirmed";
}

const lastCheck = new Map<string, number>();
/** Re-checks a waiting checkout with NectarPay so a missed notice can't strand a payment. Never throws. */
export async function reconcileListingPayment(app: { id: string; payment_status: string; invoice_id: string | null; updated_at?: string | null }) {
  if (!app.invoice_id || !["pending", "unpaid"].includes(app.payment_status)) return false;
  if (app.updated_at && Date.now() - new Date(app.updated_at).getTime() > 7 * 86_400_000) return false;
  const last = lastCheck.get(app.invoice_id) ?? 0;
  if (Date.now() - last < 8_000) return false;
  lastCheck.set(app.invoice_id, Date.now());
  try {
    const { getInvoice } = await import("./nectarpay.server");
    const inv = await getInvoice(app.invoice_id);
    if (!["confirmed", "overpaid"].includes(inv.status)) return false;
    return (await processListingInvoiceEvent("invoice.confirmed", app.id, { invoice_id: inv.id, chain: inv.chain })) === "confirmed";
  } catch (e) {
    console.warn("[listing] payment re-check failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Live package prices for server code (submit, recruiting facts). Falls back to the defaults. */
export async function livePrices() {
  const { pricesFromRows } = await import("./listing");
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("listing_prices").select("package, price_usd");
    return pricesFromRows(data);
  } catch {
    return pricesFromRows(null);
  }
}
