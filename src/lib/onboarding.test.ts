import { describe, expect, test } from "bun:test";
import { afterOnboarding, cleanStep, needsOnboarding, nextStep, prevStep, stepNumber } from "./onboarding";

describe("new-member setup guide", () => {
  test("a member who has never finished or skipped it is sent to it", () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding(undefined)).toBe(true);
  });
  test("finishing or skipping it means it never opens by itself again", () => {
    expect(needsOnboarding("done")).toBe(false);
    expect(needsOnboarding("skipped")).toBe(false);
  });
  test("the steps run welcome → name → two-factor → wallet → network fees → alerts → Ignite (two-factor before linking, so the link can withdraw) → all set", () => {
    const seen = ["welcome"];
    let s = cleanStep("welcome");
    while (s !== "done") { s = nextStep(s); seen.push(s); }
    expect(seen).toEqual(["welcome", "name", "security", "wallet", "fees", "alerts", "ignite", "done"]);
    expect(nextStep("done")).toBe("done");
    expect(prevStep("welcome")).toBeNull();
    expect(prevStep("wallet")).toBe("security");
    expect(prevStep("fees")).toBe("wallet"); // fee money comes after linking, so the pocket can be checked
  });
  test("there are 7 counted steps", () => {
    expect(stepNumber("welcome")).toEqual({ n: 1, of: 7 });
    expect(stepNumber("ignite")).toEqual({ n: 7, of: 7 });
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
