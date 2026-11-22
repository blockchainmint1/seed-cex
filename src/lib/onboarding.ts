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

export const ONBOARDING_STEPS = ["welcome", "name", "security", "wallet", "login", "fees", "alerts", "ignite", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = "done" | "skipped" | null;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  name: "Your name",
  wallet: "Link a wallet",
  login: "Easy login",
  fees: "Network fees",
  alerts: "Alerts",
  security: "Two-factor",
  ignite: "Ignite class",
  done: "All set",
};

/** Only members who have neither finished nor skipped the guide are sent to it. */
export function needsOnboarding(status: string | null | undefined): boolean {
  return status !== "done" && status !== "skipped";
}

/**
 * The steps this member sees. "Easy login" (join Honest.Money so they can sign in
 * without their coin, Vault or wallet) is only for members who started with their
 * own key; Honest.Money members already have that login. It stays in the list after
 * they join, so the step they're on never vanishes under them.
 */
const HME_MEMBER_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter((s) => s !== "login");
export function stepsFor(who: { keyMember: boolean }): readonly OnboardingStep[] {
  return who.keyMember ? ONBOARDING_STEPS : HME_MEMBER_STEPS;
}

/** A known step name, or the first step. */
export function cleanStep(raw: unknown): OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(raw as string) ? (raw as OnboardingStep) : "welcome";
}

/** The next step this member sees; a step that isn't theirs moves on to the next one that is. */
export function nextStep(s: OnboardingStep, steps: readonly OnboardingStep[] = ONBOARDING_STEPS): OnboardingStep {
  const i = steps.indexOf(s);
  if (i < 0) return steps.find((x) => ONBOARDING_STEPS.indexOf(x) > ONBOARDING_STEPS.indexOf(s)) ?? "done";
  return steps[Math.min(i + 1, steps.length - 1)] ?? "done";
}

export function prevStep(s: OnboardingStep, steps: readonly OnboardingStep[] = ONBOARDING_STEPS): OnboardingStep | null {
  const i = steps.indexOf(s);
  return i > 0 ? (steps[i - 1] ?? null) : null;
}

/** "Step 2 of 6": the closing screen isn't counted as a step. */
export function stepNumber(s: OnboardingStep, steps: readonly OnboardingStep[] = ONBOARDING_STEPS): { n: number; of: number } {
  return { n: Math.max(1, Math.min(steps.indexOf(s) + 1, steps.length - 1)), of: steps.length - 1 };
}

/** Where to go when the guide ends: the page they were heading to, if it's a safe same-site page; never the guide itself. */
export function afterOnboarding(raw: unknown): string {
  const p = safeReturnPath(raw);
  if (!p) return "/account";
  const path = p.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return path === "/welcome" ? "/account" : p;
}
