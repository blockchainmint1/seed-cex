import { describe, expect, test } from "bun:test";
import { MAX_ARRIVING_TXS, arrivingFromTxs, arrivingShown, flatFromBlockbook, flatFromEsplora, omniArriving, type FlatTx } from "./arriving";

const me = "bc1qlqhdnpw9urhfuugtpk7plgr846lpwm0pcnayfz";
const other = "bc1qte3ge7yv43tlmlsxk9c2u5c2chaac5w7fcs9nx";
const id = (n: number) => n.toString(16).padStart(64, "0");

describe("arrivingShown", () => {
  test("Bobby's 0.019 BTC deposit waiting for a block is shown", () => {
    expect(arrivingShown("BTC", 0.019)).toBe(0.019);
  });
  test("dust on TXC is not shown", () => {
    expect(arrivingShown("TXC", 0.00000546)).toBe(0);
  });
  test("unreadable values show nothing", () => {
    expect(arrivingShown("BTC", null)).toBe(0);
    expect(arrivingShown("BTC", undefined)).toBe(0);
    expect(arrivingShown("BTC", Number.NaN)).toBe(0);
  });
});

describe("arrivingFromTxs", () => {
  test("a deposit from someone else counts", () => {
    const t: FlatTx = { txid: id(1), from: [other], outputs: [{ address: me, sats: 1_900_000 }, { address: other, sats: 5_000 }], omni: false };
    expect(arrivingFromTxs([t], me)).toBe(0.019);
  });
  test("the pocket's own change (Mati's TSD payment) is never a deposit", () => {
    const t: FlatTx = { txid: id(2), from: [me], outputs: [{ address: me, sats: 99_999_991_960 }], omni: false };
    expect(arrivingFromTxs([t], me)).toBe(0);
  });
  test("an input whose owner can't be read doesn't count", () => {
    const t: FlatTx = { txid: id(3), from: [other, null], outputs: [{ address: me, sats: 100_000 }], omni: false };
    expect(arrivingFromTxs([t], me)).toBe(0);
  });
  test("a TSD payment's TXC marker output isn't TXC arriving", () => {
    const t: FlatTx = { txid: id(4), from: [other], outputs: [{ address: me, sats: 500_000 }], omni: true };
    expect(arrivingFromTxs([t], me)).toBe(0);
  });
  test("sending and receiving at once still shows the incoming coins", () => {
    const out: FlatTx = { txid: id(5), from: [me], outputs: [{ address: other, sats: 1_000_000 }, { address: me, sats: 500_000 }], omni: false };
    const inc: FlatTx = { txid: id(6), from: [other], outputs: [{ address: me, sats: 200_000 }], omni: false };
    expect(arrivingFromTxs([out, inc], me)).toBe(0.002);
  });
  test("the same transaction twice counts once; too many shows nothing", () => {
    const t: FlatTx = { txid: id(7), from: [other], outputs: [{ address: me, sats: 100_000 }], omni: false };
    expect(arrivingFromTxs([t, t], me)).toBe(0.001);
    const many = Array.from({ length: MAX_ARRIVING_TXS + 1 }, (_, i) => ({ ...t, txid: id(100 + i) }));
    expect(arrivingFromTxs(many, me)).toBe(0);
  });
});

describe("explorer shapes", () => {
  test("Esplora: waiting tx is read, confirmed tx ignored, Omni payload flagged", () => {
    const waiting = { txid: id(8), status: { confirmed: false }, vin: [{ prevout: { scriptpubkey_address: other } }], vout: [{ scriptpubkey_address: me, value: 1_900_000 }] };
    expect(flatFromEsplora(waiting)).toEqual({ txid: id(8), from: [other], outputs: [{ address: me, sats: 1_900_000 }], omni: false });
    expect(flatFromEsplora({ ...waiting, status: { confirmed: true } })).toBeNull();
    const omni = { ...waiting, vout: [...waiting.vout, { scriptpubkey_type: "op_return", scriptpubkey: "6a146f6d6e6900000000000000270000000005f5e100", value: 0 }] };
    expect(flatFromEsplora(omni)?.omni).toBe(true);
  });
  test("Blockbook: 0 confirmations read, confirmed ignored", () => {
    const waiting = { txid: id(9), confirmations: 0, vin: [{ addresses: [other], isAddress: true }], vout: [{ value: "1900000", addresses: [me], isAddress: true }] };
    expect(flatFromBlockbook(waiting)).toEqual({ txid: id(9), from: [other], outputs: [{ address: me, sats: 1_900_000 }], omni: false });
    expect(flatFromBlockbook({ ...waiting, confirmations: 1 })).toBeNull();
  });
});

describe("omniArriving", () => {
  const a = "TtXXgohUXU4bibYm4NPMsoezXx8zJGPirU";
  const b = "TrSfjHw1sy22QCQwk1x7KTfje79eM2ZhKK";
  test("an incoming TSD send counts", () => {
    expect(omniArriving([{ txid: "a", type_int: 0, propertyid: 39, sendingaddress: b, referenceaddress: a, amount: "400.00000000" }], a, 39)).toBe(400);
  });
  test("the pocket's own send, other tokens, other types and other addresses don't count", () => {
    const list = [
      { txid: "b", type_int: 0, propertyid: 39, sendingaddress: a, referenceaddress: b, amount: "5" },
      { txid: "c", type_int: 0, propertyid: 40, sendingaddress: b, referenceaddress: a, amount: "5" },
      { txid: "d", type_int: 4, propertyid: 39, sendingaddress: b, referenceaddress: a, amount: "5" },
      { txid: "e", type_int: 0, propertyid: 39, sendingaddress: b, referenceaddress: "Tsomeoneelse", amount: "5" },
    ];
    expect(omniArriving(list, a, 39)).toBe(0);
  });
  test("a node answer that isn't a list means nothing arriving", () => {
    expect(omniArriving(null, a, 39)).toBe(0);
    expect(omniArriving({ error: "x" }, a, 39)).toBe(0);
  });
});
