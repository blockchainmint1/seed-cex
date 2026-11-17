import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEPOSIT_USD, SEAT_CAPACITY, validateDetails, normalizeEmail, type Details } from "./ignite-registration";

const COLS = "status, full_name, email, country_code, phone, amount_usd, checkout_url, invoice_expires_at, confirmed_at, paid_chain";

/** The signed-in member's registration (if any), prefill from their HME profile, and whether crypto checkout is open. */
export const getMyIgnite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { nectarpayConfigured } = await import("./nectarpay.server");
    const [{ data: reg }, { data: prof }] = await Promise.all([
      context.supabase.from("ignite_registrations").select(COLS).eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("profiles").select("display_name, hm_member_id").eq("id", context.userId).maybeSingle(),
    ]);
    return {
      registration: reg,
      prefill: { fullName: prof?.display_name ?? "", email: (context.claims as { email?: string }).email ?? "" },
      hmeLinked: !!prof?.hm_member_id,
      cryptoOpen: nectarpayConfigured(),
    };
  });

/** Saves details and opens a NectarPay invoice. Amount always comes from the server. */
export const startIgniteCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Details & { origin: string }) => d)
  .handler(async ({ data, context }) => {
    if (Object.keys(validateDetails(data)).length) throw new Error("Please check your details.");
    const origin = /^https:\/\/[a-z0-9.-]+$/i.test(data.origin) || data.origin.startsWith("http://localhost") ? data.origin : "https://seeds.honest.money";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createInvoice, nectarpayConfigured } = await import("./nectarpay.server");
    if (!nectarpayConfigured()) throw new Error("Crypto checkout isn't open yet.");

    const { data: existing } = await supabaseAdmin.from("ignite_registrations").select("id, status, checkout_url, invoice_expires_at").eq("user_id", context.userId).maybeSingle();
    if (existing?.status === "confirmed") throw new Error("Your seat is already confirmed.");
    if (existing?.status === "pending" && existing.checkout_url && existing.invoice_expires_at && new Date(existing.invoice_expires_at).getTime() > Date.now() + 60_000)
      return { checkoutUrl: existing.checkout_url };

    const now = new Date().toISOString();
    const { count } = await supabaseAdmin.from("ignite_registrations").select("id", { count: "exact", head: true })
      .neq("user_id", context.userId)
      .or(`status.eq.confirmed,and(status.in.(pending,underpaid),invoice_expires_at.gt.${now})`);
    if ((count ?? 0) >= SEAT_CAPACITY) throw new Error("Ignite is fully reserved.");

    const { data: prof } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", context.userId).maybeSingle();
    const email = normalizeEmail(data.email);
    const { data: row, error } = await supabaseAdmin.from("ignite_registrations").upsert({
      user_id: context.userId, hm_member_id: prof?.hm_member_id ?? null, full_name: data.fullName.trim(), email,
      country_code: data.countryCode, phone: data.phone.replace(/[\s\-().]/g, ""), marketing_opt_in: !!data.marketingOptIn,
      amount_usd: DEPOSIT_USD, status: "pending", payment_method: "nectarpay", updated_at: now,
    }, { onConflict: "user_id" }).select("id").single();
    if (error || !row) throw new Error("Couldn't save your registration.");

    const inv = await createInvoice({
      amount: DEPOSIT_USD, order_id: `ignite-${row.id}`, description: "Seeds Ignite class reservation",
      redirect_url: `${origin}/register?paid=1`, buyer_email: email, expires_in_seconds: 3600,
    });
    await supabaseAdmin.from("ignite_registrations").update({ invoice_id: inv.id, checkout_url: inv.checkout_url, invoice_expires_at: inv.expires_at }).eq("id", row.id);
    return { checkoutUrl: inv.checkout_url };
  });
