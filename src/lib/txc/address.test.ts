import { describe, expect, test as it } from "bun:test";
import { bytesToHex } from "@noble/hashes/utils.js";
import { addressToScript, addressToScriptFor } from "./tx.server";

// 2-of-2 multisig of G and 2G, as returned by each chain's own node (createmultisig "legacy").
describe("shared (P2SH) addresses", () => {
  it("accepts a real TEXITcoin P2SH address (starts with T, version 65)", () =>
    expect(bytesToHex(addressToScript("TBhbrVhcJ2uE8tj3NtQCfZXJPguiJ5Udoo")).startsWith("a914")).toBe(true));
  it("accepts a real ISK P2SH address (starts with J, version 44)", () =>
    expect(bytesToHex(addressToScriptFor("JjbwBDSZPFApxnoDs5QWUvonB6VuSjyr5M", 45)).startsWith("a914")).toBe(true));
  it("rejects an ISK P2SH address on TEXITcoin", () =>
    expect(() => addressToScript("JjbwBDSZPFApxnoDs5QWUvonB6VuSjyr5M")).toThrow());
});
