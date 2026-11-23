import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { recordSignupReferral } from "@/lib/affiliates.functions";
import { captureRefFromUrl, refSentKey, storedSignupRef } from "@/lib/referral-capture";

/**
 * Remembers an invite code from the address bar, and once per account sends it after
 * sign-in so Admin → Affiliates can credit new members. The server ignores it for
 * accounts that aren't new. Renders nothing.
 */
export function ReferralCapture() {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const record = useServerFn(recordSignupReferral);

  useEffect(() => { captureRefFromUrl(search); }, [search]);

  useEffect(() => {
    const send = (userId: string | undefined) => {
      if (!userId) return;
      const code = storedSignupRef();
      if (!code) return;
      try { if (localStorage.getItem(refSentKey(userId))) return; localStorage.setItem(refSentKey(userId), "1"); } catch { return; }
      record({ data: { code } }).catch(() => {});
    };
    supabase.auth.getSession().then(({ data }) => send(data.session?.user.id));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_IN") send(session?.user.id); });
    return () => sub.subscription.unsubscribe();
  }, [record]);

  return null;
}
