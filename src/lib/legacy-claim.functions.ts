import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CLAIM_TOKEN_RE, claimErrorMessage, claimTokenHash } from "./legacy-claim";

/** Public: the 256-bit emailed code is the credential. Joins the old account to the HME membership once. */
export const confirmLegacyLink = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().regex(CLAIM_TOKEN_RE) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userId, error } = await supabaseAdmin.rpc("redeem_legacy_claim", { _token_hash: claimTokenHash(data.token) });
    if (error || !userId) return { ok: false as const, message: claimErrorMessage(error?.message ?? "") };

    const { emailAccountChange } = await import("./email/send.server");
    await emailAccountChange(userId, "sign-in method", [
      "This Seeds account is now linked to your Honest.Money membership.",
      "From now on you sign in with Honest.Money.",
    ], "contact support@honest.money right away so we can unlink it.");
    return { ok: true as const };
  });
