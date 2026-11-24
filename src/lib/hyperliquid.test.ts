import { describe, expect, test } from "bun:test";
import { getChain, getPair, LEGS } from "@/lib/chains";
import { withdrawCoin, EVM_MAX_FEE, EVM_NATIVE } from "@/lib/withdraw/catalog";
import { confirmationsNeeded } from "@/lib/settle/confirm-rules";

describe("Hyperliquid (HYPE on HyperEVM)", () => {
  test("HyperEVM is network 999 with HYPE as its own coin", () => {
    expect(getChain("hyperevm").evmChainId).toBe(999);
    expect(getChain("hyperevm").nativeSymbol).toBe("HYPE");
    expect(LEGS.hype.evmChains).toEqual(["hyperevm"]);
  });
  test("HYPE/TSD trades HYPE for TSD", () => {
    const p = getPair("hype-tsd");
    expect(p.baseLeg).toBe("hype");
    expect(p.quoteLeg).toBe("tsd");
  });
  test("HYPE can be withdrawn by Seeds, with a fee cap set (an unset cap refuses every send)", () => {
    expect(withdrawCoin("HYPE", "hyperevm")).not.toBeNull();
    expect(EVM_MAX_FEE["hyperevm"]).toBe(0.01);
    expect(EVM_NATIVE["hyperevm"]).toBe("HYPE");
  });
  test("a HYPE payment waits 30 blocks before the other side is paid", () => {
    expect(confirmationsNeeded("hyperevm")).toBe(30);
  });
});
