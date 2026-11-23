// Server-only Ignite helpers shared by self checkout and Peer Pay.
import type { ClassPrice, MinerStatus } from "./ignite-classes";
import type { ClassRow } from "./ignite-classes.server";
import type { Details } from "./ignite-registration";

/** Seats in this class held by everyone except `excludeUserId`: confirmed, or with a live/short invoice. */
export async function seatsFull(excludeUserId: string, classId: string, capacity: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();
  const { count } = await supabaseAdmin.from("ignite_registrations").select("id", { count: "exact", head: true })
    .eq("class_id", classId).neq("user_id", excludeUserId)
    .or(`status.eq.confirmed,and(status.in.(pending,underpaid),invoice_expires_at.gt.${now})`);
  return (count ?? 0) >= capacity;
}

export function peerSecret() {
  const s = process.env.EMAIL_LINK_SECRET;
  if (!s) throw new Error("Peer Pay isn't configured yet.");
  return s;
}

const minerCache = new Map<string, { at: number; v: MinerStatus }>();
/** Miner status, remembered for 5 minutes per member (finished values only). */
export async function cachedMinerStatus(userId: string): Promise<MinerStatus> {
  const hit = minerCache.get(userId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.v;
  const { minerStatusFor } = await import("./ignite-classes.server");
  const { status } = await minerStatusFor(userId);
  minerCache.set(userId, { at: Date.now(), v: status });
  return status;
}

/**
 * The class a member is registering for and what their seat costs, computed
 * here from the stored class (never from the browser). Throws a plain-English
 * reason when the class can't take them.
 */
export async function priceSeat(userId: string, classId: string): Promise<{ cls: ClassRow; price: ClassPrice; miner: MinerStatus }> {
  if (!/^[0-9a-f-]{36}$/i.test(classId ?? "")) throw new Error("Pick a class first.");
  const { loadClass } = await import("./ignite-classes.server");
  const { canRegister, classPrice } = await import("./ignite-classes");
  const cls = await loadClass({ id: classId });
  if (!cls) throw new Error("That class isn't open.");
  if (!canRegister({ status: cls.status, endsAt: cls.ends_at, startsAt: cls.starts_at }, 1)) throw new Error(`${cls.name} isn't taking registrations.`);
  if (await seatsFull(userId, cls.id, cls.capacity)) throw new Error(`${cls.name} is fully reserved.`);
  const fee = Number(cls.fee_usd);
  const miner: MinerStatus = cls.miners_free && fee > 0 ? await cachedMinerStatus(userId) : "unknown";
  const price = classPrice({ feeUsd: fee, depositUsd: Number(cls.deposit_usd), minersFree: cls.miners_free }, miner);
  if (price.totalUsd < 1) throw new Error("This class has nothing to pay.");
  return { cls, price, miner };
}

type ExistingReg = { id: string; status: string; class_id: string | null; amount_usd: number | string; invoice_expires_at: string | null } | null;

/**
 * Why a member's registration can't be moved to this class/price right now, or null.
 * A live checkout keeps its class and amount until it's paid or runs out, so a
 * payment on it always matches what the seat expects.
 */
export function switchBlock(existing: ExistingReg, classId: string, totalUsd: number, className: string): string | null {
  if (!existing) return null;
  if (existing.status === "confirmed") return "You already have a paid seat.";
  if (existing.status === "underpaid") return "A payment for your seat arrived short. Contact support@honest.money before paying again.";
  const live = !!existing.invoice_expires_at && new Date(existing.invoice_expires_at).getTime() > Date.now();
  if (live && (existing.class_id !== classId || Number(existing.amount_usd) !== totalUsd))
    return `You have a checkout open for another class or price. Finish it, or wait for it to run out (about an hour), then register for ${className}.`;
  return null;
}

/** Saves the member's details, class and price on their one registration row. */
export async function saveRegistration(userId: string, d: Details & { ref?: string | null }, cls: ClassRow, price: ClassPrice, method: "nectarpay" | "peer", existingId: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { cleanRefCode, normalizeEmail } = await import("./ignite-registration");
  const { addInterest } = await import("./ignite-classes.server");
  const now = new Date().toISOString();
  const fields = {
    full_name: d.fullName.trim(), email: normalizeEmail(d.email), country_code: d.countryCode,
    phone: d.phone.replace(/[\s\-().]/g, ""), marketing_opt_in: !!d.marketingOptIn, updated_at: now,
    class_id: cls.id, fee_usd: price.feeUsd, miner_discount_usd: price.minerDiscountUsd, deposit_usd: price.depositUsd, amount_usd: price.totalUsd,
    ...(cleanRefCode(d.ref) ? { ref_code: cleanRefCode(d.ref) } : {}),
  };
  let id = existingId;
  if (id) {
    const { error } = await supabaseAdmin.from("ignite_registrations")
      .update({ ...fields, status: "pending", ...(method === "nectarpay" ? { payment_method: method } : {}) })
      .eq("id", id).not("status", "in", "(confirmed,underpaid)");
    if (error) throw new Error("Couldn't save your registration.");
  } else {
    const { data: prof } = await supabaseAdmin.from("profiles").select("hm_member_id").eq("id", userId).maybeSingle();
    const { data: row, error } = await supabaseAdmin.from("ignite_registrations")
      .insert({ user_id: userId, hm_member_id: prof?.hm_member_id ?? null, ...fields, status: "pending", payment_method: method }).select("id").single();
    if (error || !row) throw new Error("Couldn't save your registration.");
    id = row.id;
  }
  // Everyone who starts registering hears about future classes (the admin list shows who has a seat).
  await addInterest({ email: fields.email, fullName: fields.full_name, userId, source: "registration", registrationId: id });
  return id!;
}
