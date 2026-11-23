import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const purpose = z.enum(["key_link", "confirm_factor", "telegram_unlink"]);
const proofSchema = z.object({ id: z.string().uuid(), secret: z.string().regex(/^[0-9a-f]{64}$/) });
export const stepUpProofSchema = proofSchema.nullable().optional();

/** Which "prove it's you" options this member has right now (and whether this session is already fresh). */
export const getMyStepUp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stepUpState } = await import("./step-up.server");
    return stepUpState(context.userId, context.claims);
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

/** Confirm a "Not confirmed yet" 2FA app or Telegram chat. */
export const confirmMyFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["totp", "telegram"]), proof: stepUpProofSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { confirmFactor } = await import("./step-up.server");
    await confirmFactor(context.userId, context.claims, data.kind, data.proof);
    return { ok: true };
  });
