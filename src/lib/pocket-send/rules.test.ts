import { describe, expect, test } from "bun:test";
import {
  approvalButtonData,
  approvalMatches,
  approvalSignatureOk,
  approvalTapDecision,
  parseApprovalData,
  pocketForLeg,
  pocketSendBlocker,
  tradeApprovalOutcome,
} from "./rules";

const ready = {
  link: { mode: "access", hasKey: true, pocketAddress: "Tabc" },
  twoFactor: "ready" as const,
  telegramVerified: true,
};

describe("who can send from a pocket", () => {
  test("instant-access link + two-factor first + Telegram = ready", () => {
    expect(pocketSendBlocker(ready, "TXC")).toBeNull();
  });
  test("no two-factor blocks the send (same rule as withdrawals)", () => {
    expect(pocketSendBlocker({ ...ready, twoFactor: "needs_2fa" }, "TXC")).toContain("two-factor");
    expect(pocketSendBlocker({ ...ready, twoFactor: "needs_relink" }, "TXC")).toContain("Re-link");
    expect(pocketSendBlocker({ ...ready, twoFactor: null }, "TXC")).not.toBeNull();
  });
  test("no verified Telegram blocks the send", () => {
    expect(pocketSendBlocker({ ...ready, telegramVerified: false }, "TXC")).toContain("Telegram");
  });
  test("approve-in-HME-Wallet links and keyless links can't send from Seeds", () => {
    expect(pocketSendBlocker({ ...ready, link: { ...ready.link, mode: "approve" } }, "TXC")).not.toBeNull();
    expect(pocketSendBlocker({ ...ready, link: { ...ready.link, hasKey: false } }, "TXC")).not.toBeNull();
    expect(pocketSendBlocker({ ...ready, link: null }, "TXC")).not.toBeNull();
  });
  test("TSD and wrapped coins pay from the TEXITcoin pocket; USDC from the EVM pocket", () => {
    expect(pocketForLeg("tsd")).toBe("TXC");
    expect(pocketForLeg("wbtc")).toBe("TXC");
    expect(pocketForLeg("isk")).toBe("ISK");
    expect(pocketForLeg("ltc")).toBe("LTC");
    expect(pocketForLeg("usdc")).toBe("EVM");
    expect(pocketForLeg("pls")).toBe("EVM");
  });
});

describe("Telegram approve buttons", () => {
  const key = "k".repeat(32);
  const id = "11111111-2222-4333-8444-555555555555";
  const owner = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  test("button data fits Telegram's 64-byte limit and round-trips", async () => {
    const d = await approvalButtonData(key, "yes", id, owner);
    expect(d.length).toBeLessThanOrEqual(64);
    const p = parseApprovalData(d)!;
    expect(p.choice).toBe("yes");
    expect(await approvalSignatureOk(key, p, owner)).toBe(true);
  });
  test("a button signed for another member, or relabelled, is refused", async () => {
    const p = parseApprovalData(await approvalButtonData(key, "no", id, owner))!;
    expect(await approvalSignatureOk(key, p, "ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee")).toBe(false);
    expect(await approvalSignatureOk(key, { ...p, choice: "yes" }, owner)).toBe(false);
  });

  const tap = {
    choice: "yes" as const, signatureOk: true, privateChat: true, tapChatId: "42", ownerChatId: "42",
    ownerChatVerified: true, status: "pending", expiresAtMs: 2_000, nowMs: 1_000,
  };
  test("only the owner's verified private chat can approve", () => {
    expect(approvalTapDecision(tap)).toBe("approve");
    expect(approvalTapDecision({ ...tap, tapChatId: "43" })).toBe("refuse");
    expect(approvalTapDecision({ ...tap, privateChat: false })).toBe("refuse");
    expect(approvalTapDecision({ ...tap, ownerChatVerified: false })).toBe("refuse");
    expect(approvalTapDecision({ ...tap, signatureOk: false })).toBe("refuse");
  });
  test("a tap after 15 minutes, or a second tap, does nothing", () => {
    expect(approvalTapDecision({ ...tap, nowMs: 2_000 })).toBe("expired");
    expect(approvalTapDecision({ ...tap, status: "approved" })).toBe("already_decided");
    expect(approvalTapDecision({ ...tap, choice: "no" })).toBe("decline");
  });
});

describe("exchange trades move all-or-nothing", () => {
  const leg = (status: string | null, sent = false) => ({ sent, needsApproval: true, status });
  test("both sides approved → send", () => {
    expect(tradeApprovalOutcome([leg("approved"), leg("approved")])).toBe("send");
  });
  test("one side still deciding → wait", () => {
    expect(tradeApprovalOutcome([leg("approved"), leg("pending")])).toBe("wait");
  });
  test("any decline or expiry → cancel the trade", () => {
    expect(tradeApprovalOutcome([leg("approved"), leg("declined")])).toBe("cancel");
    expect(tradeApprovalOutcome([leg("expired"), leg("pending")])).toBe("cancel");
  });
});

test("an approval is spent only for exactly what was approved", () => {
  const row = { status: "approved", expiresAtMs: 2_000, userId: "u", linkId: "l", leg: "tsd", amount: 250, fromAddress: "Tpocket", toAddress: "Tbuyer" };
  const want = { userId: "u", linkId: "l", leg: "tsd", amount: 250, fromAddress: "Tpocket", toAddress: "Tbuyer", nowMs: 1_000 };
  expect(approvalMatches(row, want)).toBe(true);
  expect(approvalMatches(row, { ...want, amount: 251 })).toBe(false);
  expect(approvalMatches(row, { ...want, toAddress: "Tother" })).toBe(false);
  expect(approvalMatches(row, { ...want, fromAddress: "Tnewpocket" })).toBe(false);
  expect(approvalMatches(row, { ...want, linkId: "l2" })).toBe(false);
  expect(approvalMatches(row, { ...want, nowMs: 2_000 })).toBe(false);
  expect(approvalMatches({ ...row, status: "used" }, want)).toBe(false);
});

import { approvalMetaMatches } from "./rules";
describe("outside-address swap approval binds the receiving coin and route (audit #3 A5)", () => {
  const approved = { from: "BTC.BTC", to: "ETH.ETH", protocol: "thorchain", shownOut: "1.2" };
  test("the same coin and route pass", () =>
    expect(approvalMetaMatches(approved, { from: "BTC.BTC", to: "ETH.ETH", protocol: "thorchain" })).toBe(true));
  test("a different receiving coin is refused", () =>
    expect(approvalMetaMatches(approved, { from: "BTC.BTC", to: "ETH.USDC", protocol: "thorchain" })).toBe(false));
  test("a different protocol is refused", () =>
    expect(approvalMetaMatches(approved, { from: "BTC.BTC", to: "ETH.ETH", protocol: "maya" })).toBe(false));
  test("an approval with no recorded details is refused when details are required", () =>
    expect(approvalMetaMatches({}, { to: "ETH.ETH" })).toBe(false));
  test("no details asked = nothing extra to match", () => expect(approvalMetaMatches(null, undefined)).toBe(true));
});
