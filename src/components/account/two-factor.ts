import { supabase } from "@/integrations/supabase/client";
import { cleanCode } from "@/lib/two-factor";

/** This member's confirmed authenticator, or null. */
export async function myAuthenticator() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error("Couldn't check two-factor sign-in. Refresh and try again.");
  return data.totp[0] ?? null;
}

/**
 * Prove a fresh authenticator code. The sign-in service checks it and upgrades
 * this session; the server then sees the proof in the signed session token.
 */
export async function proveTwoFactor(raw: string) {
  const code = cleanCode(raw);
  if (!code) throw new Error("Enter the 6-digit code from your authenticator app.");
  const f = await myAuthenticator();
  if (!f) throw new Error("Two-factor isn't on for this account.");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
  if (error) throw new Error("That code didn't work. Use the newest code in your app and check your phone's clock is set automatically.");
}
