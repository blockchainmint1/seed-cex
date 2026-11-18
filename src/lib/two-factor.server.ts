/**
 * Two-factor status from the Seeds sign-in service (server only).
 * The rules live in two-factor.ts (pure, tested).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Does this member have a confirmed authenticator? Fails closed (throws) if it can't be read. */
export async function hasTwoFactor(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error("Couldn't check two-factor sign-in. Try again.");
  return (data?.factors ?? []).some((f) => f.status === "verified");
}

/** Everyone with a confirmed authenticator, for the admin table. */
export async function twoFactorUserIds(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Couldn't load two-factor status.");
    for (const u of data.users) if ((u.factors ?? []).some((f) => f.status === "verified")) out.add(u.id);
    if (data.users.length < 1000) break;
  }
  return out;
}

/**
 * Bring profiles.two_factor_on in line with the sign-in service and email the
 * member (always, it's a security notice) when it actually changed.
 */
export async function syncTwoFactor(userId: string): Promise<boolean> {
  const on = await hasTwoFactor(userId);
  const { data: prof } = await supabaseAdmin.from("profiles").select("two_factor_on").eq("id", userId).maybeSingle();
  if (prof && prof.two_factor_on !== on) {
    await supabaseAdmin.from("profiles").update({ two_factor_on: on }).eq("id", userId);
    try {
      const { emailAccountChange } = await import("@/lib/email/send.server");
      void emailAccountChange(userId, "Two-factor sign-in",
        on ? ["Two-factor sign-in is now on for your Seeds account", "Withdrawals now ask for a code from your authenticator app"]
           : ["Two-factor sign-in was turned off for your Seeds account", "Your withdrawal level may have dropped"],
        "sign out of Honest.Money everywhere, revoke your trading pocket in HME Wallet, then contact support@honest.money.");
    } catch (e) {
      console.error("two-factor email failed", e);
    }
  }
  return on;
}

/** Remove every authenticator on a member's account (admin reset after checking it's them). */
export async function removeAllFactors(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error("Couldn't read their two-factor setup.");
  let n = 0;
  for (const f of data?.factors ?? []) {
    const { error: e } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ id: f.id, userId });
    if (e) throw new Error("Couldn't remove their authenticator. Nothing else was changed.");
    n++;
  }
  return n;
}
