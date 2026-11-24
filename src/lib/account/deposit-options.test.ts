import { describe, expect, test } from "bun:test";
import { DEPOSIT_ASSETS, depositState, findAsset, findNetwork, withdrawRoute } from "./deposit-options";

const addrs = { TXC: "Ttxc", BTC: "bc1q", EVM: "0xabc", DOGE: "Ddoge", ZEC: "t1zec" };

describe("deposit catalog", () => {
  test("TSD deposits to the TEXITcoin address", () => {
    const net = findNetwork(findAsset("TSD"), undefined)!;
    expect(net.pocket).toBe("TXC");
    expect(depositState(net, true, addrs)).toEqual({ ok: true, address: "Ttxc" });
  });
  test("every EVM network uses the one EVM address", () => {
    for (const id of ["ethereum", "base", "bsc"]) expect(depositState(findNetwork(findAsset("USDC"), id)!, true, addrs)).toEqual({ ok: true, address: "0xabc" });
  });
  test("a coin with several networks needs the network picked", () => {
    expect(findNetwork(findAsset("USDT"), undefined)).toBeUndefined();
  });
  test("nothing is depositable before the pocket is linked", () => {
    expect(depositState(findNetwork(findAsset("BTC"), "btc")!, false, addrs).ok).toBe(false);
  });
  test("a coin the pocket hasn't shared is blocked", () => {
    expect(depositState(findNetwork(findAsset("SOL"), "sol")!, true, addrs).ok).toBe(false);
  });
  test("ZEC stays closed while Seeds can't send it, even with an address", () => {
    const net = findNetwork(findAsset("ZEC"), "zec")!;
    expect(withdrawRoute(net)).toBe("none");
    expect(depositState(net, true, addrs).ok).toBe(false);
  });
  test("HME Wallet coins withdraw in HME Wallet, extra coins swap back to TSD", () => {
    expect(withdrawRoute(findNetwork(findAsset("BTC"), "btc")!)).toBe("hme");
    expect(withdrawRoute(findNetwork(findAsset("TSD"), "txc-omni")!)).toBe("hme");
    expect(withdrawRoute(findNetwork(findAsset("DOGE"), "doge")!)).toBe("swap");
  });
  test("network ids are unique within each coin", () => {
    for (const a of DEPOSIT_ASSETS) expect(new Set(a.networks.map((n) => n.id)).size).toBe(a.networks.length);
  });
  test("PulseChain coins (PLS, pHEX) go to the EVM address and are sent out by Seeds", () => {
    for (const c of ["PLS", "pHEX"]) {
      const net = findNetwork(findAsset(c), undefined)!;
      expect(net.evmChain).toBe("pulsechain");
      expect(withdrawRoute(net)).toBe("seeds");
      expect(depositState(net, true, addrs, null)).toEqual({ ok: true, address: "0xabc" });
    }
  });
  test("PulseChain deposits stay closed while Seeds can't send for this member", () => {
    const net = findNetwork(findAsset("PLS"), "pulsechain")!;
    expect(depositState(net, true, addrs, "pilot").ok).toBe(false);
    expect(depositState(net, true, addrs).ok).toBe(false); // unknown = closed
  });
  test("HEX on Ethereum withdraws in HME Wallet; pHEX is a separate coin", () => {
    expect(withdrawRoute(findNetwork(findAsset("HEX"), "ethereum")!)).toBe("hme");
    expect(findAsset("phex")!.symbol).toBe("pHEX");
  });
});

import { test as t2, expect as e2 } from "bun:test";
import { withdrawCoin } from "@/lib/withdraw/catalog";
t2("Cardano deposits open only when Seeds can send ADA back out", () => {
  const net = findNetwork(findAsset("ADA"), "ada")!;
  e2(depositState(net, true, { ADA: "addr1x" }, "Telegram not connected").ok).toBe(false);
  e2(depositState(net, true, { ADA: "addr1x" }, null).ok).toBe(true);
  e2(withdrawCoin("ADA", "ada")?.kind).toBe("ada");
});
