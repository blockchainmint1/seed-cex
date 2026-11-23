import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";
import {
  canApply, cleanApplication, cleanPrices, cleanPromoCode, cleanPromoInput, LISTING_STATUSES, packageById, paymentActionAllowed,
  priceWithPromo, pricesFromRows, promoLabel, promoProblem, type ListingPrices, type ListingStatus, type PackageId, type PaymentAction, type Promo,
} from "./listing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
/** Promo code checks per member per minute (stops guessing codes). */
const PROMO_CHECKS_PER_MINUTE = 10;

type PromoRow = { id: string; code: string; kind: string; value: number | string; packages: string[] | null; max_uses: number | null; uses: number; expires_at: string | null; active: boolean };
const toPromo = (r: PromoRow): Promo => ({
  code: r.code, kind: r.kind as Promo["kind"], value: Number(r.value), packages: (r.packages as PackageId[] | null) ?? null,
  maxUses: r.max_uses, uses: r.uses, expiresAt: r.expires_at, active: r.active,
});

/** Public: the live package prices (shown on /list). */
export const getListingPrices = createServerFn({ method: "GET" }).handler(async (): Promise<ListingPrices> => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const db = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      } },
    });
    const { data } = await db.from("listing_prices").select("package, price_usd");
    return pricesFromRows(data);
  } catch {
    return pricesFromRows(null);
  }
});

async function promoAllowance(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { minuteWindow, withinLimit } = await import("./ip-rate");
  const { data, error } = await supabaseAdmin.rpc("api_bump_rate", { _key: `listing-promo:${userId}`, _weight: 1, _window: minuteWindow(Date.now()) });
  if (!error && !withinLimit(Number(data), PROMO_CHECKS_PER_MINUTE)) throw new Error("Too many code tries. Wait a minute and try again.");
}

/** A signed-in member checks a promo code against a package before applying. */
export const checkListingPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string; package: string }) => {
    if (!packageById(String(d?.package))) throw new Error("Pick a package.");
    return { code: cleanPromoCode(d?.code), package: String(d.package) as PackageId };
  })
  .handler(async ({ data, context }) => {
    await promoAllowance(context.userId);
    if (!data.code) return { ok: false as const, message: "That code isn't valid." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { livePrices } = await import("./listing-pay.server");
    const { data: row } = await supabaseAdmin.from("listing_promo_codes").select("id, code, kind, value, packages, max_uses, uses, expires_at, active").eq("code", data.code).maybeSingle();
    const promo = row ? toPromo(row as PromoRow) : null;
    const problem = promoProblem(promo, data.package);
    if (problem || !promo) return { ok: false as const, message: problem ?? "That code isn't valid." };
    const price = priceWithPromo((await livePrices())[data.package], promo);
    return { ok: true as const, code: promo.code, label: promoLabel(promo), ...price };
  });

/**
 * A signed-in member applies to list a coin. Written by the server only; the price
 * comes from listing_prices and the discount from a claimed promo code, never the browser.
 * Opens a NectarPay checkout straight away when there's something to pay.
 */
export const submitListingApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => ({
    app: cleanApplication(d ?? {}),
    promoCode: d?.promoCode ? cleanPromoCode(d.promoCode) ?? "__bad__" : null,
    origin: typeof d?.origin === "string" ? d.origin : "",
    ref: typeof d?.ref === "string" ? d.ref : null,
  }))
  .handler(async ({ data: { app: data, promoCode, origin, ref }, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { livePrices, openListingCheckout, tellListingAdmins } = await import("./listing-pay.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabaseAdmin.from("listing_applications").select("id", { count: "exact", head: true })
      .eq("user_id", context.userId).gte("created_at", since);
    if (!canApply(count ?? 0)) throw new Error("You've sent the most applications we take in a day. Please try again tomorrow, or reply to our email if you already applied.");

    const listPrice = (await livePrices())[data.package];
    let promo: { id: string; kind: "percent" | "amount"; value: number } | null = null;
    if (promoCode) {
      if (promoCode === "__bad__") throw new Error("That code isn't valid.");
      const { data: claimed } = await supabaseAdmin.rpc("claim_listing_promo", { _code: promoCode, _package: data.package });
      const c = (claimed as { id: string; kind: string; value: number | string }[] | null)?.[0];
      if (!c) {
        const { data: row } = await supabaseAdmin.from("listing_promo_codes").select("id, code, kind, value, packages, max_uses, uses, expires_at, active").eq("code", promoCode).maybeSingle();
        throw new Error(promoProblem(row ? toPromo(row as PromoRow) : null, data.package) ?? "That code can't be used right now.");
      }
      promo = { id: c.id, kind: c.kind as "percent" | "amount", value: Number(c.value) };
    }
    const price = priceWithPromo(listPrice, promo);

    // Affiliate credit (Admin → Affiliates only; never changes the price): the invite code this
    // browser came with, else the code the applicant joined with, never their own.
    const [{ data: joined }, { data: own }] = await Promise.all([
      supabaseAdmin.from("referrals").select("code").eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("referral_codes").select("code").eq("user_id", context.userId).maybeSingle(),
    ]);
    const { purchaseRefCode } = await import("./affiliates");
    const refCode = purchaseRefCode({ browserCode: ref, joinedCode: joined?.code ?? null, ownCode: own?.code ?? null });

    const { data: row, error } = await supabaseAdmin.from("listing_applications").insert({
      user_id: context.userId, package: data.package, coin_name: data.coinName, ticker: data.ticker, network: data.network,
      contract: data.contract, website: data.website, community: data.community, contact_name: data.contactName,
      contact_email: data.contactEmail, contact_telegram: data.contactTelegram, notes: data.notes,
      list_price_usd: price.listPriceUsd, discount_usd: price.discountUsd, amount_usd: price.amountUsd,
      promo_code_id: promo?.id ?? null, promo_code: promo ? promoCode : null,
      payment_status: price.amountUsd > 0 ? "unpaid" : "free", ref_code: refCode,
    }).select("id").single();
    if (error || !row) {
      if (promo) await supabaseAdmin.rpc("release_listing_promo", { _id: promo.id });
      throw new Error("We couldn't save your application. Please try again.");
    }

    const pkg = packageById(data.package)!;
    await tellListingAdmins(
      `🌱 <b>New listing application</b>\n${esc(data.coinName)} (${esc(data.ticker)}) on ${esc(data.network)}\n` +
      `Package: ${pkg.name} · ${usd(price.amountUsd)}${promo ? ` (list ${usd(price.listPriceUsd)}, code ${esc(promoCode!)})` : ""}\n` +
      `Contact: ${esc(data.contactName)} · ${esc(data.contactEmail)}\nReview it at seeds.honest.money/admin/listings`,
    );

    let checkoutUrl: string | null = null;
    let checkoutError: string | null = null;
    if (price.amountUsd > 0) {
      try { checkoutUrl = (await openListingCheckout(row.id, origin)).checkoutUrl; }
      catch (e) { checkoutError = e instanceof Error ? e.message : "Checkout couldn't open."; console.error("[listing] checkout failed", e); }
    }
    return { id: row.id as string, amountUsd: price.amountUsd, checkoutUrl, checkoutError };
  });

/** The applicant opens (or reopens) checkout for their own application. */
export const startListingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; origin: string }) => {
    if (!UUID_RE.test(String(d?.id))) throw new Error("Bad application id");
    return { id: String(d.id), origin: typeof d.origin === "string" ? d.origin : "" };
  })
  .handler(async ({ data, context }) => {
    const { data: mine } = await context.supabase.from("listing_applications").select("id").eq("id", data.id).eq("user_id", context.userId).maybeSingle();
    if (!mine) throw new Error("We couldn't find that application.");
    const { openListingCheckout } = await import("./listing-pay.server");
    return openListingCheckout(data.id, data.origin);
  });

const MY_COLS = "id, package, coin_name, ticker, network, status, created_at, list_price_usd, discount_usd, amount_usd, promo_code, payment_status, invoice_id, invoice_expires_at, checkout_url, paid_at, updated_at";

/** The member's own applications (read as the member; RLS limits it to their rows). Re-checks waiting payments. */
export const getMyListingApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const read = () => context.supabase.from("listing_applications").select(MY_COLS)
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(20);
    let { data } = await read();
    const waiting = (data ?? []).filter((a) => a.payment_status === "pending" && a.invoice_id).slice(0, 3);
    if (waiting.length) {
      const { reconcileListingPayment } = await import("./listing-pay.server");
      const changed = (await Promise.all(waiting.map((a) => reconcileListingPayment(a)))).some(Boolean);
      if (changed) ({ data } = await read());
    }
    return (data ?? []).map(({ invoice_id: _i, updated_at: _u, ...a }) => ({
      ...a, list_price_usd: Number(a.list_price_usd), discount_usd: Number(a.discount_usd), amount_usd: Number(a.amount_usd),
    }));
  });

export type AdminListingRow = {
  id: string; package: string; coin_name: string; ticker: string; network: string; contract: string | null;
  website: string; community: string | null; contact_name: string; contact_email: string; contact_telegram: string | null;
  notes: string | null; status: string; admin_note: string | null; created_at: string; updated_at: string;
  list_price_usd: number; discount_usd: number; amount_usd: number; promo_code: string | null; payment_status: string;
  invoice_id: string | null; paid_invoice_id: string | null; paid_at: string | null; paid_chain: string | null;
  paid_asset: string | null; paid_amount_usd: number | null; payment_note: string | null;
};

export const adminListListingApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminListingRow[]> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("listing_applications")
      .select("id, package, coin_name, ticker, network, contract, website, community, contact_name, contact_email, contact_telegram, notes, status, admin_note, created_at, updated_at, list_price_usd, discount_usd, amount_usd, promo_code, payment_status, invoice_id, paid_invoice_id, paid_at, paid_chain, paid_asset, paid_amount_usd, payment_note")
      .order("created_at", { ascending: false }).limit(500);
    return (data ?? []).map((r) => ({
      ...r, list_price_usd: Number(r.list_price_usd), discount_usd: Number(r.discount_usd), amount_usd: Number(r.amount_usd),
      paid_amount_usd: r.paid_amount_usd == null ? null : Number(r.paid_amount_usd),
    })) as AdminListingRow[];
  });

export const adminUpdateListingApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string; adminNote?: string | null }) => {
    if (!UUID_RE.test(String(d?.id))) throw new Error("Bad application id");
    if (!(LISTING_STATUSES as readonly string[]).includes(String(d?.status))) throw new Error("Bad status");
    const note = typeof d.adminNote === "string" ? d.adminNote.trim().slice(0, 2000) || null : null;
    return { id: String(d.id), status: d.status as ListingStatus, adminNote: note };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("listing_applications")
      .update({ status: data.status, admin_note: data.adminNote, reviewed_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Couldn't save that change.");
    return { ok: true };
  });

/** Admin marks a payment by hand: paid outside NectarPay, or refunded. Logged. */
export const adminSetListingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; action: string; note: string }) => {
    if (!UUID_RE.test(String(d?.id))) throw new Error("Bad application id");
    if (d?.action !== "mark_paid" && d?.action !== "mark_refunded") throw new Error("Bad action");
    const note = typeof d.note === "string" ? d.note.trim().slice(0, 500) : "";
    if (note.length < 3) throw new Error("Add a short note: how it was paid or refunded (e.g. the transaction id).");
    return { id: String(d.id), action: d.action as PaymentAction, note };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: app } = await supabaseAdmin.from("listing_applications").select("payment_status").eq("id", data.id).maybeSingle();
    if (!app) throw new Error("Application not found.");
    if (!paymentActionAllowed(data.action, app.payment_status)) throw new Error(data.action === "mark_paid" ? "Only an unpaid application can be marked paid." : "Only a paid application can be marked refunded.");
    const now = new Date().toISOString();
    const next = data.action === "mark_paid" ? "paid" : "refunded";
    const { data: moved } = await supabaseAdmin.from("listing_applications").update({
      payment_status: next, payment_note: data.note, updated_at: now, ...(next === "paid" ? { paid_at: now, checkout_url: null } : {}),
    }).eq("id", data.id).eq("payment_status", app.payment_status).select("id");
    if (!moved?.length) throw new Error("The payment changed while you were looking. Refresh and try again.");
    await supabaseAdmin.from("listing_admin_events").insert({ actor: context.userId, kind: data.action, application_id: data.id, detail: { from: app.payment_status, note: data.note } });
    return { ok: true };
  });

/* ----------------------------- prices & promos ----------------------------- */

export type AdminPromoRow = {
  id: string; code: string; kind: "percent" | "amount"; value: number; packages: PackageId[] | null; max_uses: number | null;
  uses: number; expires_at: string | null; active: boolean; note: string | null; created_at: string;
};

export const adminGetListingSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: prices }, { data: promos }] = await Promise.all([
      supabaseAdmin.from("listing_prices").select("package, price_usd, updated_at"),
      supabaseAdmin.from("listing_promo_codes").select("id, code, kind, value, packages, max_uses, uses, expires_at, active, note, created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    const updated = (prices ?? []).map((p) => p.updated_at).sort().at(-1) ?? null;
    return {
      prices: pricesFromRows(prices), pricesUpdatedAt: updated,
      promos: (promos ?? []).map((p) => ({ ...p, value: Number(p.value) })) as AdminPromoRow[],
    };
  });

export const adminSaveListingPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => cleanPrices(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin.from("listing_prices").select("package, price_usd");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("listing_prices").upsert(
      (Object.keys(data) as PackageId[]).map((id) => ({ package: id, price_usd: data[id], updated_at: now, updated_by: context.userId })),
      { onConflict: "package" },
    );
    if (error) throw new Error("Couldn't save the prices.");
    await supabaseAdmin.from("listing_admin_events").insert({ actor: context.userId, kind: "prices", detail: { before: pricesFromRows(before), after: data } });
    return { ok: true };
  });

export const adminCreateListingPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => cleanPromoInput(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("listing_promo_codes").insert({
      code: data.code, kind: data.kind, value: data.value, packages: data.packages, max_uses: data.maxUses,
      expires_at: data.expiresAt, note: data.note, created_by: context.userId,
    }).select("id").single();
    if (error?.code === "23505") throw new Error("That code already exists.");
    if (error || !row) throw new Error("Couldn't save the code.");
    await supabaseAdmin.from("listing_admin_events").insert({ actor: context.userId, kind: "promo_create", detail: { id: row.id, ...data } });
    return { ok: true };
  });

/** Pause or turn a code back on. Codes are never deleted, so every past discount stays explained. */
export const adminSetListingPromoActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; active: boolean }) => {
    if (!UUID_RE.test(String(d?.id))) throw new Error("Bad code id");
    return { id: String(d.id), active: d.active === true };
  })
  .handler(async ({ data, context }) => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("listing_promo_codes").update({ active: data.active, updated_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error("Couldn't change the code.");
    await supabaseAdmin.from("listing_admin_events").insert({ actor: context.userId, kind: data.active ? "promo_on" : "promo_off", detail: { id: data.id } });
    return { ok: true };
  });
