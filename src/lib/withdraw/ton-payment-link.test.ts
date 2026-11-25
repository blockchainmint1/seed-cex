import { describe, expect, test } from "bun:test";
import { Address } from "@ton/core";
import { approvalPaymentCommentMatches, normalizeTonPaymentInput, parseTonPaymentLink, paymentComment } from "./ton-payment-link";
import { codeDigest, detailsText } from "./rules";
import { USDT_TON_MASTER, usdtTransferBody } from "@/lib/pockets/ton-jetton";

const to = "UQDdUeSv2MQ9GahvwFegT6n4vUlWfuNn-6ppQKaYrPnRSJgA";
const invoice = `ton://transfer/${to}?jetton=${USDT_TON_MASTER}&amount=12000000&text=TON+Console%3A+Refill`;
const input = { symbol: "USDT", network: "ton", to: invoice, amount: "12" };

describe("TONAPI payment link", () => {
  test("Bobby's invoice requests exactly 12 USDt on TON and preserves its payment note", () => {
    expect(parseTonPaymentLink(invoice)).toEqual({ symbol: "USDT", network: "ton", to, amount: "12", comment: "TON Console: Refill" });
    expect(normalizeTonPaymentInput(input)).toEqual({ symbol: "USDT", network: "ton", to, amount: "12", comment: "TON Console: Refill" });
  });
  test("native TON uses nine decimals, not jetton decimals", () => {
    expect(parseTonPaymentLink(`ton://transfer/${to}?amount=12000000`)).toEqual({ symbol: "TON", network: "ton", to, amount: "0.012", comment: "" });
  });
  test("a bare address is still a bare address", () => {
    expect(parseTonPaymentLink(to)).toBeNull();
    expect(normalizeTonPaymentInput({ ...input, to })).toEqual({ ...input, to, comment: "" });
  });
  test("an address-only TON link does not invent an amount", () => {
    expect(parseTonPaymentLink(`ton://transfer/${to}`)?.amount).toBeNull();
  });
  test("server refuses the wrong asset or network rather than sending something else", () => {
    expect(() => normalizeTonPaymentInput({ ...input, symbol: "TON" })).toThrow();
    expect(() => normalizeTonPaymentInput({ ...input, network: "ethereum" })).toThrow();
  });
  test("server refuses conflicting amount or note", () => {
    expect(() => normalizeTonPaymentInput({ ...input, amount: "13" })).toThrow();
    expect(() => normalizeTonPaymentInput({ ...input, comment: "other" })).toThrow();
    expect(normalizeTonPaymentInput({ ...input, amount: "12.000000" }).amount).toBe("12");
  });
  test("a different jetton master is never substituted for Tether", () => {
    expect(() => parseTonPaymentLink(invoice.replace(USDT_TON_MASTER, to))).toThrow();
  });
  test("an equivalent master address spelling is allowed", () => {
    const master = Address.parse(USDT_TON_MASTER).toString({ bounceable: false });
    expect(parseTonPaymentLink(invoice.replace(USDT_TON_MASTER, master))?.symbol).toBe("USDT");
  });
  test("duplicate parameters and outside binary/init/signing payloads are refused", () => {
    for (const suffix of ["&amount=13000000", "&text=other", "&jetton=other", "&bin=AAAA", "&init=AAAA", "&payload=AAAA"]) {
      expect(() => parseTonPaymentLink(invoice + suffix)).toThrow();
    }
    expect(() => parseTonPaymentLink(invoice.replace("transfer", "sign"))).toThrow();
  });
  test("testnet, burn, malformed and multi-address links are refused", () => {
    const testnet = Address.parse(to).toString({ testOnly: true });
    for (const bad of [invoice.replace(to, testnet), invoice.replace(to, "not-an-address"), invoice.replace(to, to + "/other"), invoice + "#fragment", invoice + "&text=%GG", invoice.replace("TON+Console%3A+Refill", "%FF")]) {
      expect(() => parseTonPaymentLink(bad)).toThrow();
    }
  });
  test("fractional, negative, zero and overlarge base-unit amounts are refused", () => {
    for (const amount of ["0", "-1", "12.5", "1e6", "1".repeat(37)]) {
      expect(() => parseTonPaymentLink(invoice.replace("12000000", amount))).toThrow();
    }
  });
  test("notes are bounded in UTF-8 bytes and cannot include control characters", () => {
    expect(paymentComment("ton_usdt", "TON Console: Refill")).toBe("TON Console: Refill");
    expect(() => paymentComment("ton_usdt", "é".repeat(61))).toThrow();
    expect(() => paymentComment("ton_usdt", "note\nother")).toThrow();
    expect(() => paymentComment("evm", "note")).toThrow();
    expect(() => parseTonPaymentLink(`ton://transfer/${to}?text=Refill`)).toThrow();
  });
});

describe("payment note stays bound to withdrawal approvals", () => {
  test("changing or omitting the note invalidates the emailed code", async () => {
    const details = { userId: "test", key: "USDT:ton", units: 12000000n, to };
    const approved = await codeDigest("test-secret", detailsText({ ...details, comment: "TON Console: Refill" }), "123456");
    expect(await codeDigest("test-secret", detailsText({ ...details, comment: "Other" }), "123456")).not.toBe(approved);
    expect(await codeDigest("test-secret", detailsText(details), "123456")).not.toBe(approved);
  });
  test("old no-comment codes retain their exact details text", () => {
    expect(detailsText({ userId: "test", key: "USDT:ton", units: 12000000n, to })).toBe(`seeds-withdrawal|test|USDT:ton|12000000|${to}|`);
  });
  test("Telegram must approve the identical stored note, including spaces", () => {
    expect(approvalPaymentCommentMatches("TON Console: Refill", { payment_comment: "TON Console: Refill" })).toBe(true);
    expect(approvalPaymentCommentMatches("TON Console: Refill", { payment_comment: "TON Console: Refill " })).toBe(false);
    expect(approvalPaymentCommentMatches("TON Console: Refill", {})).toBe(false);
    expect(approvalPaymentCommentMatches("TON Console: Refill", null)).toBe(false);
    expect(approvalPaymentCommentMatches("", {})).toBe(true);
    expect(approvalPaymentCommentMatches("", { payment_comment: "injected" })).toBe(false);
  });
  test("the TEP-74 body sends exact units, destination, response and plain forward comment", () => {
    const response = "UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI";
    const body = usdtTransferBody({ queryId: 7n, units: 12000000n, destination: to, response, comment: "TON Console: Refill" }).beginParse();
    expect(body.loadUint(32)).toBe(0x0f8a7ea5);
    expect(body.loadUintBig(64)).toBe(7n);
    expect(body.loadCoins()).toBe(12000000n);
    expect(body.loadAddress().equals(Address.parse(to))).toBe(true);
    expect(body.loadAddress().equals(Address.parse(response))).toBe(true);
    expect(body.loadBit()).toBe(false);
    expect(body.loadCoins()).toBe(1n);
    expect(body.loadBit()).toBe(true);
    const note = body.loadRef().beginParse();
    expect(note.loadUint(32)).toBe(0);
    expect(note.loadStringTail()).toBe("TON Console: Refill");
    expect(body.remainingBits).toBe(0);
    expect(body.remainingRefs).toBe(0);
  });
});