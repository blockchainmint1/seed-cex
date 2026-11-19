import { describe, expect, test } from "bun:test";
import { thirdPartyScriptsAllowed } from "./third-party-scripts";

describe("Honest.Money scripts: public pages only", () => {
  test("homepage, Ignite and info pages get them", () => {
    for (const p of ["/", "/ignite", "/about/kyc", "/privacy", "/list/"]) expect(thirdPartyScriptsAllowed(p)).toBe(true);
  });
  test("account, admin, setup guide, sign-in, trading, swaps and P2P never do", () => {
    for (const p of ["/account", "/account/security", "/admin", "/admin/users", "/welcome", "/wallet", "/auth", "/sso",
      "/link-account", "/trade/tsd-txc", "/swap", "/swap/tokens", "/p2p", "/pay/abc", "/ai"]) expect(thirdPartyScriptsAllowed(p)).toBe(false);
  });
  test("look-alike paths don't sneak in", () => {
    expect(thirdPartyScriptsAllowed("/ignite-admin")).toBe(false);
    expect(thirdPartyScriptsAllowed("/aboutx")).toBe(false);
  });
});
