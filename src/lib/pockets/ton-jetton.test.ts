import { describe, expect, test } from "bun:test";
import { Address, Cell } from "@ton/core";
import { checkStonQuote, stonSwapMessage, swapMinimum, usdtTransferBody, usdtTraceStatus, STON_PTON_WALLET, STON_ROUTER, STON_ROUTER_USDT_WALLET, STON_FORWARD_GAS, TON_NATIVE_ID, USDT_TON_MASTER, tonUnits, type StonSimulation } from "./ton-jetton";
import { planSwap } from "@/lib/swap/plan";
import { stonBlocker, parseOffer } from "@/lib/ston/ston.server";

const member = "UQCD39VS5jcptHL8vMjEXrzGaRcCVYto7HUn4bpAOg8xqEBI";
const quote = (o: Partial<StonSimulation> = {}): StonSimulation => ({ offer_address: TON_NATIVE_ID, ask_address: USDT_TON_MASTER, router_address: STON_ROUTER,
  offer_jetton_wallet: STON_PTON_WALLET, ask_jetton_wallet: STON_ROUTER_USDT_WALLET, offer_units: "1000000000", ask_units: "919433", min_ask_units: "910238",
  router: { pton_wallet_address: STON_PTON_WALLET, major_version: 1 }, ...o });

describe("STON.fi TON -> USD₮ quote", () => {
  test("accepts only the pinned router, pTON wallet, router USD₮ wallet and exact amount", () => {
    expect(checkStonQuote(quote(), 1_000_000_000n).askUnits).toBe(919433n);
    expect(() => checkStonQuote(quote({ router_address: member }), 1_000_000_000n)).toThrow(/different pool/);
    expect(() => checkStonQuote(quote({ ask_jetton_wallet: member }), 1_000_000_000n)).toThrow(/different pool/);
    expect(() => checkStonQuote(quote({ offer_jetton_wallet: member }), 1_000_000_000n)).toThrow(/different pool/);
    expect(() => checkStonQuote(quote({ ask_address: TON_NATIVE_ID }), 1_000_000_000n)).toThrow(/different pool/);
    expect(() => checkStonQuote(quote({ router: { major_version: 2 } }), 1_000_000_000n)).toThrow(/different pool/);
    expect(() => checkStonQuote(quote(), 2_000_000_000n)).toThrow(/amount/);
  });
  test("minimum is the shown price less 1%", () => {
    expect(swapMinimum(1_000_000n)).toBe(990_000n);
  });
  test("amount limits: 0.1 to 2,000 TON, up to 9 decimals", () => {
    expect(parseOffer("0.1")).toBe(100_000_000n);
    expect(() => parseOffer("0.09")).toThrow();
    expect(() => parseOffer("2000.000000001")).toThrow();
    expect(() => tonUnits("1.0000000001")).toThrow();
  });
});

describe("STON.fi swap message Seeds signs", () => {
  test("goes to the pTON wallet, carries offer + forward gas, pays USD₮ to the member with the agreed minimum", () => {
    const m = stonSwapMessage({ queryId: 7n, offer: 1_000_000_000n, minOut: 990_000n, member });
    expect(m.to).toBe(STON_PTON_WALLET);
    expect(m.value).toBe(1_000_000_000n + STON_FORWARD_GAS);
    const s = m.body.beginParse();
    expect(s.loadUint(32)).toBe(0x0f8a7ea5);
    expect(s.loadUintBig(64)).toBe(7n);
    expect(s.loadCoins()).toBe(1_000_000_000n);
    expect(s.loadAddress().equals(Address.parse(STON_ROUTER))).toBe(true);
    expect(s.loadMaybeAddress()).toBeNull();
    expect(s.loadBit()).toBe(false);
    expect(s.loadCoins()).toBe(STON_FORWARD_GAS);
    expect(s.loadBit()).toBe(true);
    const p = s.loadRef().beginParse();
    expect(p.loadUint(32)).toBe(0x25938561);
    expect(p.loadAddress().equals(Address.parse(STON_ROUTER_USDT_WALLET))).toBe(true);
    expect(p.loadCoins()).toBe(990_000n);
    expect(p.loadAddress().equals(Address.parse(member))).toBe(true);
    expect(p.loadUint(1)).toBe(0);
  });
});

describe("USD₮ on TON transfer", () => {
  test("TEP-74 transfer of exact units, excess back to own pocket, no payload", () => {
    const dest = "EQB3ncyBUTjZUA5EnFKR5_EnOMI9V1tTEAAPaiU71gc4TiUt";
    const s = usdtTransferBody({ queryId: 1n, units: 9_900_000n, destination: dest, response: member }).beginParse();
    expect(s.loadUint(32)).toBe(0x0f8a7ea5);
    s.loadUintBig(64);
    expect(s.loadCoins()).toBe(9_900_000n);
    expect(s.loadAddress().equals(Address.parse(dest))).toBe(true);
    expect(s.loadAddress().equals(Address.parse(member))).toBe(true);
    expect(s.loadBit()).toBe(false);
    expect(s.loadCoins()).toBe(1n);
    expect(s.loadBit()).toBe(false);
    expect(() => usdtTransferBody({ queryId: 1n, units: 0n, destination: dest, response: member })).toThrow();
  });
  const tx = (address: string, extra: object = {}) => ({ aborted: false, success: true, account: { address }, ...extra });
  const own = "0:4eec921b9d4d56a0d94676016d49c26b39b1d7901a7e153e66033f146a0886f4";
  const dst = Address.parse(STON_PTON_WALLET).toRawString();
  const trace = (amount: string, ok = true) => ({ transaction: tx("0:aa", { in_msg: { hash: "m" } }), children: [{ transaction: tx(own), children: [{ transaction: { ...tx(dst, { in_msg: { decoded_op_name: "jetton_internal_transfer", decoded_body: { amount } } }), success: ok } }] }] });
  test("delivered only when the destination's USD₮ wallet took exactly the amount", () => {
    expect(usdtTraceStatus(trace("9900000"), "m", own, dst, 9_900_000n)).toEqual({ success: true, confirmations: 1 });
    expect(usdtTraceStatus(trace("9900000", false), "m", own, dst, 9_900_000n)).toEqual({ success: false, confirmations: 1 });
    expect(usdtTraceStatus(trace("1"), "m", own, dst, 9_900_000n)).toBeNull();
    expect(usdtTraceStatus(trace("9900000"), "other", own, dst, 9_900_000n)).toBeNull();
  });
});

describe("routes and gates", () => {
  test("TON -> USD₮ on TON is STON.fi; TSD reaches it only as the one-tap chain; nothing leaves USD₮ on TON", () => {
    expect(planSwap({ kind: "ton" }, { kind: "ton_usdt" }).options).toEqual([{ kind: "ston" }]);
    expect(planSwap({ kind: "tsd" }, { kind: "ton_usdt" }).options).toEqual([{ kind: "hype_chain", direction: "to_ton_usdt", via: "tsd", coin: "TSD" }]);
    expect(planSwap({ kind: "ton_usdt" }, { kind: "ton" }).options).toEqual([]);
  });
  test("testers only while TON is in its tester stage; needs instant access and a TON pocket", () => {
    const link = { mode: "access", hasKey: true, pockets: ["TON"] };
    expect(stonBlocker(false, link)).toMatch(/beta testers/);
    expect(stonBlocker(true, link)).toBeNull();
    expect(stonBlocker(true, { ...link, pockets: ["EVM"] })).toMatch(/no TON pocket/);
    expect(stonBlocker(true, { ...link, mode: "approve" })).toMatch(/instant access/);
  });
  test("Cell import used", () => expect(Cell).toBeDefined());
});
