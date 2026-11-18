/**
 * New-member setup guide (pure rules, tested; no I/O).
 *
 * A member whose profile has no onboarding status is sent to /welcome the
 * first time they open their account. They can skip it at any step, and
 * reopen it any time from Account → Overview. Skipping or finishing is
 * stored on the server, so it never comes back on another device.
 */
import { safeReturnPath } from "./return-path";

/** Query key for the member's guide status (shared by the account layout and the guide). */
export const ONBOARDING_QUERY = ["my-onboarding"] as const;

export const ONBOARDING_STEPS = ["welcome", "name", "security", "wallet", "alerts", "ignite", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = "done" | "skipped" | null;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  name: "Your name",
  wallet: "Link HME Wallet",
  alerts: "Alerts",
  security: "Two-factor",
  ignite: "Ignite class",
  done: "All set",
};

/** Only members who have neither finished nor skipped the guide are sent to it. */
export function needsOnboarding(status: string | null | undefined): boolean {
  return status !== "done" && status !== "skipped";
}

/** A known step name, or the first step. */
export function cleanStep(raw: unknown): OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(raw as string) ? (raw as OnboardingStep) : "welcome";
}

export function nextStep(s: OnboardingStep): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(s);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)];
}

export function prevStep(s: OnboardingStep): OnboardingStep | null {
  const i = ONBOARDING_STEPS.indexOf(s);
  return i > 0 ? ONBOARDING_STEPS[i - 1] : null;
}

/** "Step 2 of 6": the closing screen isn't counted as a step. */
export function stepNumber(s: OnboardingStep): { n: number; of: number } {
  return { n: Math.min(ONBOARDING_STEPS.indexOf(s) + 1, ONBOARDING_STEPS.length - 1), of: ONBOARDING_STEPS.length - 1 };
}

/** Where to go when the guide ends: the page they were heading to, if it's a safe same-site page; never the guide itself. */
export function afterOnboarding(raw: unknown): string {
  const p = safeReturnPath(raw);
  if (!p) return "/account";
  const path = p.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path === "/welcome" ? "/account" : p;
}
