import { describe, expect, test } from "bun:test";
import { afterOnboarding, cleanStep, needsOnboarding, nextStep, prevStep, stepNumber, stepsFor } from "./onboarding";

describe("new-member setup guide", () => {
  test("a member who has never finished or skipped it is sent to it", () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding(undefined)).toBe(true);
  });
  test("finishing or skipping it means it never opens by itself again", () => {
    expect(needsOnboarding("done")).toBe(false);
    expect(needsOnboarding("skipped")).toBe(false);
  });
  test("Honest.Money members: welcome → name → two-factor → wallet → network fees → alerts → Ignite (two-factor before linking, so the link can withdraw) → all set", () => {
    const steps = stepsFor({ keyMember: false });
    const seen = ["welcome"];
    let s = cleanStep("welcome");
    while (s !== "done") { s = nextStep(s, steps); seen.push(s); }
    expect(seen).toEqual(["welcome", "name", "security", "wallet", "fees", "alerts", "ignite", "done"]);
    expect(nextStep("done", steps)).toBe("done");
    expect(prevStep("welcome", steps)).toBeNull();
    expect(prevStep("wallet", steps)).toBe("security");
    expect(prevStep("fees", steps)).toBe("wallet"); // fee money comes after linking, so the pocket can be checked
  });
  test("Honest.Money members get 7 counted steps", () => {
    const steps = stepsFor({ keyMember: false });
    expect(stepNumber("welcome", steps)).toEqual({ n: 1, of: 7 });
    expect(stepNumber("ignite", steps)).toEqual({ n: 7, of: 7 });
  });
  test("coin, Vault and wallet members get an Easy login step right after their pocket (Bobby, Nov 22)", () => {
    const steps = stepsFor({ keyMember: true });
    expect(steps).toEqual(["welcome", "name", "security", "wallet", "login", "fees", "alerts", "ignite", "done"]);
    expect(nextStep("wallet", steps)).toBe("login");
    expect(nextStep("login", steps)).toBe("fees");
    expect(prevStep("fees", steps)).toBe("login");
    expect(stepNumber("ignite", steps)).toEqual({ n: 8, of: 8 });
  });
  test("an Honest.Money member sent to the Easy login step just moves on to network fees", () => {
    const steps = stepsFor({ keyMember: false });
    expect(steps).not.toContain("login");
    expect(nextStep("login", steps)).toBe("fees");
  });
  test("an unknown step starts at the beginning", () => {
    expect(cleanStep("hack")).toBe("welcome");
    expect(cleanStep(undefined)).toBe("welcome");
  });
  test("leaving the guide returns to the page they were heading to", () => {
    expect(afterOnboarding("/account/alerts")).toBe("/account/alerts");
    expect(afterOnboarding("/ignite?ref=jane")).toBe("/ignite?ref=jane");
  });
  test("leaving never goes off-site, back to sign-in, or into the guide again", () => {
    expect(afterOnboarding("https://evil.example")).toBe("/account");
    expect(afterOnboarding("//evil.example")).toBe("/account");
    expect(afterOnboarding("/auth")).toBe("/account");
    expect(afterOnboarding("/welcome?step=name")).toBe("/account");
    expect(afterOnboarding(undefined)).toBe("/account");
  });
});
