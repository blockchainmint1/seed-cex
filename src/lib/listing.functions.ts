import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin-guard";
import { canApply, cleanApplication, LISTING_STATUSES, packageById, type ListingStatus } from "./listing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram heads-up to every admin with verified Telegram. Best-effort: never blocks the application. */
async function tellAdmins(text: string) {
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

/** A signed-in member applies to list a coin. Written by the server only. */
export const submitListingApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, unknown>) => cleanApplication(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await supabaseAdmin.from("listing_applications").select("id", { count: "exact", head: true })
      .eq("user_id", context.userId).gte("created_at", since);
    if (!canApply(count ?? 0)) throw new Error("You've sent the most applications we take in a day. Please try again tomorrow, or reply to our email if you already applied.");

    const { data: row, error } = await supabaseAdmin.from("listing_applications").insert({
      user_id: context.userId,
      package: data.package,
      coin_name: data.coinName,
      ticker: data.ticker,
      network: data.network,
      contract: data.contract,
      website: data.website,
      community: data.community,
      contact_name: data.contactName,
      contact_email: data.contactEmail,
      contact_telegram: data.contactTelegram,
      notes: data.notes,
    }).select("id").single();
    if (error || !row) throw new Error("We couldn't save your application. Please try again.");

    const pkg = packageById(data.package)!;
    await tellAdmins(
      `🌱 <b>New listing application</b>\n${esc(data.coinName)} (${esc(data.ticker)}) on ${esc(data.network)}\n` +
      `Package: ${pkg.name} ($${pkg.priceUsd.toLocaleString("en-US")})\nContact: ${esc(data.contactName)} · ${esc(data.contactEmail)}\n` +
      `Review it at seeds.honest.money/admin/listings`,
    );
    return { id: row.id as string };
  });

/** The member's own applications (read as the member; RLS limits it to their rows). */
export const getMyListingApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("listing_applications")
      .select("id, package, coin_name, ticker, network, status, created_at")
      .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(20);
    return data ?? [];
  });

export type AdminListingRow = {
  id: string; package: string; coin_name: string; ticker: string; network: string; contract: string | null;
  website: string; community: string | null; contact_name: string; contact_email: string; contact_telegram: string | null;
  notes: string | null; status: string; admin_note: string | null; created_at: string; updated_at: string;
};

export const adminListListingApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminListingRow[]> => {
    await requireAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("listing_applications")
      .select("id, package, coin_name, ticker, network, contract, website, community, contact_name, contact_email, contact_telegram, notes, status, admin_note, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(500);
    return (data ?? []) as AdminListingRow[];
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
