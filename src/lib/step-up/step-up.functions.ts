import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const purpose = z.enum(["key_link", "confirm_factor", "telegram_unlink"]);
const proofSchema = z.object({ id: z.string().uuid(), secret: z.string().regex(/^[0-9a-f]{64}$/) });
export const stepUpProofSchema = proofSchema.nullable().optional();
/** Unlink / replace Telegram: the server-signed "screen opened at" stamp (S1). */
export const stepUpIntentSchema = z.string().max(80).nullable().optional();

/** What the fresh sign-in must come after; resolved on the server (S1). */
export const stepUpSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), id: z.string().regex(/^[a-f0-9]{32}$/), secret: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ kind: z.literal("totp"), factorId: z.string().uuid() }),
  z.object({ kind: z.literal("telegram") }),
  z.object({ kind: z.literal("intent"), token: stepUpIntentSchema }),
]).nullable().optional();

/** Which "prove it's you" options this member has right now, and whether this session already signed in after the request. */
export const getMyStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ purpose, subject: stepUpSubjectSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { stepUpState } = await import("./step-up.server");
    return stepUpState(context.userId, context.claims, data.purpose, data.subject ?? null);
  });

/** Send a Telegram "Yes, it's me" tap or an email code. */
export const startMyStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ purpose, method: z.enum(["telegram", "email"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { startStepUp } = await import("./step-up.server");
    return startStepUp(context.userId, data.purpose, data.method);
  });

export const checkMyStepUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => proofSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { stepUpStatus } = await import("./step-up.server");
    return { status: await stepUpStatus(context.userId, data.id, data.secret) };
  });

export const verifyMyStepUpEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => proofSchema.extend({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { verifyStepUpEmail } = await import("./step-up.server");
    await verifyStepUpEmail(context.userId, data.id, data.secret, data.code);
    return { ok: true };
  });

/** Is each 2FA app / the Telegram chat confirmed? (Security tab.) */
export const getMyFactorTrust = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { myFactorTrust } = await import("./step-up.server");
    return myFactorTrust(context.userId);
  });

/** Confirm ONE "Not confirmed yet" 2FA app (by id) or the Telegram chat (auditor S2). */
export const confirmMyFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    subject: z.discriminatedUnion("kind", [z.object({ kind: z.literal("totp"), factorId: z.string().uuid() }), z.object({ kind: z.literal("telegram") })]),
    proof: stepUpProofSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { confirmFactor } = await import("./step-up.server");
    await confirmFactor(context.userId, context.claims, data.subject, data.proof);
    return { ok: true };
  });

/** Remove a 2FA app that isn't confirmed yet — no extra check, since that only makes the account safer (S2). */
export const removeMyUnconfirmedFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ factorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { removeUnconfirmedFactor } = await import("./step-up.server");
    await removeUnconfirmedFactor(context.userId, data.factorId);
    return { ok: true };
  });
