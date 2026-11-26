import { describe, expect, test } from "bun:test";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { tronAddress } from "./encode";
import { USDT_TRON_CONTRACT, USDT_TRON_DECIMALS, TRON_USDT_MAX_FEE_SUN, tronHexAddress, tronAbiAddress, tronUsdtParameters, tronUsdtData, tronUsdtFeeBudget, tronUsdtBlocker, tronUsdtStage, tronUsdtDestinationProblem, tronUsdtSimulationEnergy, encodeTronUsdt, signTronUsdt, tronUsdtReceipt, type TronReceipt } from "./tron-usdt";
import { pocketsFromMnemonic } from "./derive";
import { accountPath, receivePath } from "./coins";
import { findAsset, findNetwork, depositState, pocketBalanceKey } from "@/lib/account/deposit-options";
import { withdrawCoin } from "@/lib/withdraw/catalog";
import { parseUnits, sendBlocker as withdrawalBlocker, detailsText } from "@/lib/withdraw/rules";
import { swapCoin } from "@/lib/xchain/assets";
import { sendSource, sendBlocker } from "@/lib/xchain/send-rules";
import { routeBlocker, routePockets } from "@/lib/xchain/tsd-route";
import { planSwap } from "@/lib/swap/plan";
import { swapPairForRow } from "@/lib/account/swap-link";
import { revokeCheck } from "./hme-support";

// Public, un-funded test key, never a member credential.
const key = hexToBytes("01".padStart(64, "0"));
const from = tronAddress(secp256k1.getPublicKey(key, true));
const to = tronAddress(secp256k1.getPublicKey(hexToBytes("02".padStart(64, "0")), true));
const params = { from, to, units: 12_000_000n, refBlockNum: 100, refBlockId: "00".repeat(32), timestamp: 1_795_645_200_000, feeLimit: 10_000_000n };

describe("pinned USDT and unchanged pocket", () => {
  test("Tether's mainnet contract is pinned with six decimals", () => {
    expect(tronHexAddress(USDT_TRON_CONTRACT)).toBe("41a614f803b6fd780986a42c78ec9c7f77e6ded13c");
    expect(USDT_TRON_DECIMALS).toBe(6);
    expect(parseUnits("12", 6)).toBe(12_000_000n);
    expect(parseUnits("0.0000001", 6)).toBeNull();
  });
  test("USDT reuses native TRX pocket 1106/0/0, never another wallet", () => {
    expect(accountPath("TRX", 1106)).toBe("m/44'/195'/1106'");
    expect(receivePath("TRX", 1106)).toBe("m/44'/195'/1106'/0/0");
    const bundle = pocketsFromMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", { account: 1106, coins: ["TRX"] });
    expect(Object.keys(bundle.xpubs)).toEqual(["TRX"]);
    const net = findNetwork(findAsset("USDT"), "trx");
    if (!net) throw new Error("Missing USDT TRON network");
    expect(net.pocket).toBe("TRX");
    expect(withdrawCoin("USDT", "trx")?.pocket).toBe("TRX");
  });
  test("TRX, USDT on TRON and USDt on TON read separate balances", () => {
    const usdt = findAsset("USDT"), trx = findAsset("TRX");
    const tronNet = findNetwork(usdt, "trx"), tonNet = findNetwork(usdt, "ton"), native = findNetwork(trx, "trx");
    if (!usdt || !trx || !tronNet || !tonNet || !native) throw new Error("Missing catalog entries");
    expect(pocketBalanceKey(usdt, tronNet)).toBe("USDT_TRON");
    expect(pocketBalanceKey(usdt, tonNet)).toBe("USDT_TON");
    expect(pocketBalanceKey(trx, native)).toBe("TRX");
  });
});

describe("send rules and audit stage", () => {
  test("only beta testers can move it at the testers stage", () => {
    expect(tronUsdtStage()).toBe("testers");
    expect(tronUsdtBlocker(true)).toBeNull();
    expect(tronUsdtBlocker(true, "review")).not.toBeNull();
    expect(tronUsdtBlocker(false)).not.toBeNull();
    expect(tronUsdtBlocker(false, "testers")).not.toBeNull();
    expect(tronUsdtBlocker(true, "testers")).toBeNull();
    expect(tronUsdtBlocker(false, "open")).toBeNull();
  });
  test("tester deposits require verified send readiness; non-testers still cannot withdraw", () => {
    const net = findNetwork(findAsset("USDT"), "trx");
    if (!net) throw new Error("Missing TRON network");
    expect(depositState(net, true, { TRX: from }, null)).toEqual({ ok: true, address: from });
    expect(depositState(net, true, { TRX: from }, tronUsdtBlocker(false)).ok).toBe(false);
    expect(depositState(net, true, { TRX: from }).ok).toBe(false);
    expect(withdrawalBlocker({ symbol: "USDT", networkLabel: "TRON", pocket: "TRX", tester: true, frozen: false, link: { mode: "access", hasKey: true, address: from } })).toBeNull();
    expect(withdrawalBlocker({ symbol: "USDT", networkLabel: "TRON", pocket: "TRX", tester: false, frozen: false, link: { mode: "access", hasKey: true, address: from } })).not.toBeNull();
  });
  test("TRON USDT sends through THORChain, not Maya or Ethereum", () => {
    const coin = swapCoin("USDT.TRON");
    if (!coin) throw new Error("Missing swap coin");
    expect(sendSource(coin)).toEqual({ pocket: "TRX", kind: "trc20" });
    expect(sendSource(coin, "maya")).toBeNull();
    expect(routePockets("buy", coin).sort()).toEqual(["EVM", "TRX", "TXC"]);
  });
  test("swaps open to testers only, both directions", () => {
    const coin = swapCoin("USDT.TRON"), btc = swapCoin("BTC");
    if (!coin || !btc) throw new Error("Missing swap coin");
    const link = { mode: "access", hasKey: true, pockets: ["TXC", "TRX", "EVM", "BTC"] };
    for (const direction of ["buy", "sell"] as const) {
      expect(routeBlocker({ direction, coin, link, isAdmin: true, amountUsd: 50, tsdAmount: 50 })).toBeNull();
      expect(routeBlocker({ direction, coin, link, isAdmin: false, amountUsd: 50, tsdAmount: 50 })).not.toBeNull();
    }
    expect(sendBlocker({ from: coin, to: btc, link, isAdmin: true, amountUsd: 50 })).toBeNull();
    expect(sendBlocker({ from: btc, to: coin, link, isAdmin: false, amountUsd: 50 })).not.toBeNull();
    expect(sendBlocker({ from: btc, link, isAdmin: true, amountUsd: 50 })).toBeNull();
  });
  test("prefilled Balances links select the intended one-tap TSD pair", () => {
    expect(swapPairForRow("USDT", "trx", 12)).toEqual({ from: "USDT.TRON", to: "TSD" });
    expect(swapPairForRow("USDT", "trx", 0)).toEqual({ from: "TSD", to: "USDT.TRON" });
    expect(planSwap({ kind: "tsd" }, { kind: "coin", id: "USDT.TRON" }).options).toEqual([{ kind: "tsd", direction: "buy", coin: "USDT.TRON" }]);
    expect(planSwap({ kind: "coin", id: "USDT.TRON" }, { kind: "tsd" }).options).toEqual([{ kind: "tsd", direction: "sell", coin: "USDT.TRON" }]);
  });
  test("approval details distinguish USDT on TRON from USDT elsewhere", () => {
    const d = { userId: "test", units: 12_000_000n, to };
    expect(detailsText({ ...d, key: "USDT:trx" })).not.toBe(detailsText({ ...d, key: "USDT:ton" }));
  });
  test("revoke never silently ignores TRON USDT or its unreadable balance", () => {
    expect(revokeCheck([{ coin: "USDT_TRON", balance: 12 }]).stranded).toEqual([{ coin: "USDT_TRON", balance: 12 }]);
    expect(revokeCheck([{ coin: "USDT_TRON", balance: null }]).unknown).toEqual(["USDT_TRON"]);
  });
});

describe("exact transfers and fees", () => {
  test("raw signed data matches independent TronWeb 6.5.2 protobuf bytes", () => {
    // Produced by official TronWeb's txJsonToPb, then its signed protobuf decoder;
    // public test keys 1 and 2, exactly 12 USDT, no member credentials or funds.
    expect(bytesToHex(encodeTronUsdt(params))).toBe("0a0200642208000000000000000040a0abb8a6a1345aae01081f12a9010a31747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e54726967676572536d617274436f6e747261637412740a15417e5f4552091a69125d5dfcb7b8c2659029395bdf121541a614f803b6fd780986a42c78ec9c7f77e6ded13c2244a9059cbb0000000000000000000000002b5ad5c4795c026514f8317c7a215e218dccd6cf0000000000000000000000000000000000000000000000000000000000b71b007080adada6a134900180ade204");
  });
  test("RPC success cannot hide a failed token simulation", () => {
    expect(tronUsdtSimulationEnergy({ result: { result: true }, energy_used: 100_000, constant_result: ["1".padStart(64, "0")], transaction: { ret: [{ contractRet: "SUCCESS" }] } })).toBe(100_000n);
    expect(() => tronUsdtSimulationEnergy({ result: { result: true }, energy_used: 100_000, constant_result: ["0".repeat(64)] })).toThrow();
    expect(() => tronUsdtSimulationEnergy({ result: { result: true }, energy_used: 100_000, transaction: { ret: [{ contractRet: "REVERT" }] } })).toThrow();
    expect(() => tronUsdtSimulationEnergy({ result: { result: false }, energy_used: 100_000 })).toThrow();
  });
  test("ABI removes the 41 network byte and sends exactly 12 USDT", () => {
    expect(tronAbiAddress(to)).toBe(tronHexAddress(to).slice(2).padStart(64, "0"));
    expect(tronUsdtData(to, 12_000_000n)).toBe("a9059cbb" + tronAbiAddress(to) + "b71b00".padStart(64, "0"));
    expect(tronUsdtParameters(to, 12_000_000n).length).toBe(128);
  });
  test("bad checksum, burn, own address and token contract are refused", () => {
    expect(tronUsdtDestinationProblem(to.slice(0, -1) + (to.endsWith("1") ? "2" : "1"))).not.toBeNull();
    expect(tronUsdtDestinationProblem("T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb")).not.toBeNull();
    expect(tronUsdtDestinationProblem(from, from)).not.toBeNull();
    expect(tronUsdtDestinationProblem(USDT_TRON_CONTRACT)).not.toBeNull();
    expect(() => tronUsdtData(to, 0n)).toThrow();
    expect(() => tronUsdtData(to, 1n << 256n)).toThrow();
  });
  test("fee budget uses live unit rates, 20% energy headroom, bandwidth and memo fee", () => {
    expect(tronUsdtFeeBudget(100_000n, 100n, 1000n)).toEqual({ feeLimit: 12_000_000n, totalSun: 13_500_000n });
    expect(tronUsdtFeeBudget(100_000n, 100n, 1000n, 1_000_000n).totalSun).toBe(14_500_000n);
    expect(TRON_USDT_MAX_FEE_SUN).toBe(100_000_000n);
    expect(() => tronUsdtFeeBudget(1_000_000n, 100n, 1000n)).toThrow();
    expect(() => tronUsdtFeeBudget(0n, 100n, 1000n)).toThrow();
    expect(() => tronUsdtFeeBudget(100n, 0n, 1000n)).toThrow();
  });
  test("memo is signed outer data, not an extra USDT call argument", () => {
    const plain = encodeTronUsdt(params), memo = encodeTronUsdt({ ...params, memo: "=:b:destination:1" });
    expect(bytesToHex(memo)).toContain(bytesToHex(new TextEncoder().encode("=:b:destination:1")));
    expect(bytesToHex(plain)).toContain(tronUsdtData(to, params.units));
    expect(signTronUsdt(params, key).txid).not.toBe(signTronUsdt({ ...params, memo: "=:b:destination:1" }, key).txid);
    expect(() => encodeTronUsdt({ ...params, memo: "x".repeat(251) })).toThrow();
    expect(() => encodeTronUsdt({ ...params, memo: "bad\ntext" })).toThrow();
  });
  test("wrong key never signs; signature recovery byte matches TronWeb 27/28", () => {
    const tx = signTronUsdt(params, key);
    expect(tx.txid).toMatch(/^[a-f0-9]{64}$/);
    expect([27, 28]).toContain(parseInt(tx.hex.slice(-2), 16));
    expect(() => signTronUsdt({ ...params, from: to }, key)).toThrow();
    expect(() => encodeTronUsdt({ ...params, feeLimit: TRON_USDT_MAX_FEE_SUN + 1n })).toThrow();
  });
});

describe("finalized confirmation evidence", () => {
  const txid = "ab".repeat(32);
  const receipt: TronReceipt = { id: txid, blockNumber: 100, receipt: { result: "SUCCESS" }, log: [{ address: tronHexAddress(USDT_TRON_CONTRACT).slice(2), topics: [bytesToHex(keccak_256(new TextEncoder().encode("Transfer(address,address,uint256)"))), tronAbiAddress(from), tronAbiAddress(to)], data: params.units.toString(16).padStart(64, "0") }] };
  test("only exact USDT sender, recipient and amount prove success", () => {
    expect(tronUsdtReceipt(receipt, txid, from, to, params.units)).toBe(true);
    expect(tronUsdtReceipt(receipt, txid, from, to, params.units + 1n)).toBeNull();
    expect(tronUsdtReceipt(receipt, txid, to, from, params.units)).toBeNull();
    expect(tronUsdtReceipt({ ...receipt, log: [] }, txid, from, to, params.units)).toBeNull();
    expect(tronUsdtReceipt({ ...receipt, log: [...(receipt.log ?? []), ...(receipt.log ?? [])] }, txid, from, to, params.units)).toBeNull();
  });
  test("failed execution is not delivery; missing receipt stays unknown", () => {
    expect(tronUsdtReceipt({ ...receipt, receipt: { result: "OUT_OF_ENERGY" } }, txid, from, to, params.units)).toBe(false);
    expect(tronUsdtReceipt({ ...receipt, result: "FAILED" }, txid, from, to, params.units)).toBe(false);
    expect(tronUsdtReceipt({}, txid, from, to, params.units)).toBeNull();
    expect(tronUsdtReceipt({ ...receipt, id: "cc".repeat(32) }, txid, from, to, params.units)).toBeNull();
  });
});