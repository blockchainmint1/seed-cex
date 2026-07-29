import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const addressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Not an EVM address");

/** Issue a single-use, 5-minute challenge for a wallet address. */
export const requestWalletChallenge = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ address: addressSchema }).parse(input))
  .handler(async ({ data }) => {
    const { buildChallengeText } = await import("@/lib/wallet-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const address = data.address.toLowerCase();
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const statement = buildChallengeText(data.address, nonce, "Seeds Exchange");

    const { error } = await supabaseAdmin.from("wallet_auth_challenges").insert({
      address,
      nonce,
      statement,
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    if (error) throw new Error(error.message);
    return { statement, nonce };
  });

/**
 * Verify the signature and hand back a one-time token the browser exchanges
 * for a session. No password, no email round-trip.
 */
export const verifyWalletSignature = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        address: addressSchema,
        nonce: z.string().trim().min(16).max(64),
        signature: z.string().trim().regex(/^0x[0-9a-fA-F]{130}$/, "Malformed signature"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { recoverPersonalSignAddress, walletEmail } = await import("@/lib/wallet-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const address = data.address.toLowerCase();
    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from("wallet_auth_challenges")
      .select("id, statement, expires_at, consumed_at")
      .eq("address", address)
      .eq("nonce", data.nonce)
      .maybeSingle();
    if (challengeError) throw new Error(challengeError.message);
    if (!challenge) throw new Error("That sign-in request has expired. Try again.");
    if (challenge.consumed_at) throw new Error("That sign-in request was already used.");
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      throw new Error("That sign-in request has expired. Try again.");
    }

    const recovered = recoverPersonalSignAddress(challenge.statement, data.signature);
    if (!recovered || recovered.toLowerCase() !== address) {
      throw new Error("Signature does not match that wallet.");
    }

    // Burn the nonce before minting anything.
    await supabaseAdmin
      .from("wallet_auth_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id);

    const email = walletEmail(address);
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { wallet_address: recovered, display_name: `${recovered.slice(0, 6)}…${recovered.slice(-4)}` },
    });
    if (created.error && !/already/i.test(created.error.message)) {
      throw new Error(created.error.message);
    }

    const link = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties?.hashed_token) {
      throw new Error(link.error?.message ?? "Could not start a session");
    }
    return { tokenHash: link.data.properties.hashed_token, address: recovered };
  });
