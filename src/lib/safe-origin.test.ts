import { describe, expect, it } from "bun:test";
import { safeOrigin } from "./safe-origin";
import { safeOrigin as peerSafeOrigin } from "./ignite-peer";

describe("payment return addresses only point at Seeds (review P1)", () => {
  it("Seeds' own addresses are kept", () => {
    expect(safeOrigin("https://seeds.honest.money")).toBe("https://seeds.honest.money");
    expect(safeOrigin("https://seeds-cex.lovable.app")).toBe("https://seeds-cex.lovable.app");
  });
  it("an arbitrary https host falls back to Seeds", () => {
    expect(safeOrigin("https://seeds-honest.money")).toBe("https://seeds.honest.money");
    expect(safeOrigin("https://evil.example")).toBe("https://seeds.honest.money");
    expect(safeOrigin("https://seeds.honest.money.evil.example")).toBe("https://seeds.honest.money");
    expect(safeOrigin("http://localhost.evil.example")).toBe("https://seeds.honest.money");
  });
  it("missing origin falls back to Seeds", () => {
    expect(safeOrigin(undefined)).toBe("https://seeds.honest.money");
    expect(safeOrigin(null)).toBe("https://seeds.honest.money");
  });
  it("listing checkout and Ignite Peer Pay use the same rule", () => expect(peerSafeOrigin).toBe(safeOrigin));
});
