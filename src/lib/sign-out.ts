import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * End the Seeds session and the Honest.Money one. Shared by the header and
 * Profile → Security so both behave the same.
 */
export async function signOutOfSeeds(qc: QueryClient) {
  await qc.cancelQueries();
  qc.clear();
  // Remember this was a deliberate sign-out so the next SSO run forces the
  // login box (prompt=login) instead of silently re-signing the member in.
  try {
    sessionStorage.setItem("seeds-signed-out", "1");
  } catch {
    /* private mode — best effort */
  }
  await supabase.auth.signOut();
  // HME rule: our sign-out only ends the Seeds session — also end the
  // honest.money one, or the member gets signed right back in.
  window.location.href = `https://honest.money/logout?return_to=${encodeURIComponent(window.location.origin + "/")}`;
}
